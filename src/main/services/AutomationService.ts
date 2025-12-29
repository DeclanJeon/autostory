import { chromium, Browser, BrowserContext, Page } from "playwright";
import store from "../config/store";
import { logger, sendLogToRenderer } from "../utils/logger";
import { AiService } from "./AiService";
import { browserManager } from "./BrowserManager.js";
import {
  TISTORY_SELECTORS,
  HOME_TOPIC_KEYWORDS,
  CATEGORY_KEYWORDS,
} from "../config/tistorySelectors";
import { NAVER_SELECTORS } from "../config/naverSelectors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import fs from "fs-extra";
import { NaverService } from "./NaverService";
import { YoutubeTranscript } from "youtube-transcript";
import * as cheerio from "cheerio";
import { HOME_TOPICS } from "../config/homeTopics";

export type LoginState = "logged-in" | "logged-out" | "logging-in" | "unknown";

export interface LoginResult {
  success: boolean;
  state: LoginState;
  error?: string;
}

/**
 * 클립보드 복사 결과 인터페이스
 */
interface ClipboardCopyResult {
  success: boolean;
  contentLength: number;
  error?: string;
}

export class AutomationService {
  private static instance: AutomationService;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private mainWindow: any; // Electron BrowserWindow 참조
  private aiService: AiService;
  private imageCache: Map<string, string[]> = new Map();
  private naverService: NaverService;

  private loginState: LoginState = "unknown";
  private loginAbortController: AbortController | null = null;
  private publishAbortController: AbortController | null = null;

  /**
   * [신규] 마지막 로그인 검증 시간 캐시
   * 짧은 시간 내 중복 검증 방지
   */
  private lastLoginCheckTime: number = 0;
  private readonly LOGIN_CHECK_CACHE_MS = 30000; // 30초 캐시

  private constructor() {
    this.aiService = new AiService();
    this.naverService = new NaverService(null); // Initialize with null first
  }

  public static getInstance(): AutomationService {
    if (!AutomationService.instance) {
      AutomationService.instance = new AutomationService();
    }
    return AutomationService.instance;
  }

  public setMainWindow(window: any) {
    this.mainWindow = window;
    if (this.naverService) {
      this.naverService.setMainWindow(window);
    }
  }

  public getLoginState(): LoginState {
    return this.loginState;
  }

  public cancelCurrentOperation(): boolean {
    if (this.loginAbortController) {
      this.loginAbortController.abort();
      this.loginAbortController = null;
      sendLogToRenderer(this.mainWindow, "로그인이 취소되었습니다.");
      return true;
    }

    if (this.publishAbortController) {
      this.publishAbortController.abort();
      this.publishAbortController = null;
      sendLogToRenderer(this.mainWindow, "발행이 취소되었습니다.");
      return true;
    }

    return false;
  }

  public isOperationInProgress(): boolean {
    return (
      this.loginAbortController !== null || this.publishAbortController !== null
    );
  }

  private async cleanupBrowser(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
      }
    } catch (e) {}

    try {
      if (this.context) {
        await this.context.close().catch(() => {});
      }
    } catch (e) {}

    try {
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close().catch(() => {});
      }
    } catch (e) {}

    this.page = null;
    this.context = null;
    this.browser = null;
  }

  private isBrowserValid(): boolean {
    return !!(
      this.browser &&
      this.browser.isConnected() &&
      this.context &&
      this.page &&
      !this.page.isClosed()
    );
  }

  public async initBrowser(): Promise<void> {
    if (this.isBrowserValid()) {
      return;
    }

    await this.cleanupBrowser();

    // 1. 브라우저 설치 확인 및 다운로드 요청
    const isInstalled = await browserManager.isInstalled();

    if (!isInstalled) {
      logger.info("내장 브라우저 없음. 다운로드 시작.");

      // 메인 윈도우에 이벤트 전송
      if (this.mainWindow) {
        this.mainWindow.webContents.send("browser-download-start");
      }

      try {
        await browserManager.install((progress) => {
          if (this.mainWindow) {
            this.mainWindow.webContents.send(
              "browser-download-progress",
              progress
            );
          }
        });

        if (this.mainWindow) {
          this.mainWindow.webContents.send("browser-download-complete");
        }
      } catch (error: any) {
        logger.error(`브라우저 설치 실패: ${error}`);
        if (this.mainWindow) {
          this.mainWindow.webContents.send(
            "browser-download-error",
            error.message
          );
        }
        throw new Error("필수 브라우저 구성요소 설치에 실패했습니다.");
      }
    }

    // 2. 설치된 브라우저 경로 가져오기
    const executablePath = browserManager.getExecutablePath();
    logger.info(`Launching browser from: ${executablePath}`);

    try {
      this.browser = await chromium.launch({
        headless: false,
        executablePath: executablePath, // 시스템 크롬 대신 다운로드한 파일 사용
        args: [
          "--start-maximized",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
        ],
      });
    } catch (e: any) {
      // Linux 라이브러리 부족 시 안내
      if (
        process.platform === "linux" &&
        e.message.includes("error while loading shared libraries")
      ) {
        const msg =
          "Linux 시스템 라이브러리가 부족합니다. (libgbm1, libasound2 등)";
        logger.error(msg);
        sendLogToRenderer(this.mainWindow, msg);
      }
      throw e;
    }

    this.browser.on("disconnected", () => {
      logger.info("브라우저 연결 끊김, 정리 중");
      this.page = null;
      this.context = null;
      this.browser = null;
      this.loginState = "unknown";
    });

    const contextOptions: any = {
      viewport: null,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      permissions: ["clipboard-read", "clipboard-write"],
    };

    const authData = store.get("auth");

    // [핵심 변경] 1순위: 전체 스토리지 상태 복원 (LocalStorage 포함)
    if (authData?.storageState) {
      contextOptions.storageState = authData.storageState;
      this.context = await this.browser.newContext(contextOptions);
      logger.info("💾 저장된 전체 세션 상태(StorageState)를 복원합니다.");
      sendLogToRenderer(
        this.mainWindow,
        "💾 저장된 전체 세션 상태(StorageState)를 복원합니다."
      );
    }
    // 2순위: 쿠키만 복원 (하위 호환성)
    else if (authData?.cookies && authData.cookies.length > 0) {
      this.context = await this.browser.newContext(contextOptions);
      await this.context.addCookies(authData.cookies);
      logger.info("🍪 저장된 쿠키만 복원합니다. (하위 호환성 모드)");
      sendLogToRenderer(this.mainWindow, "🍪 저장된 쿠키만 복원합니다.");
    }
    // 3순위: 빈 컨텍스트 생성 (첫 로그인)
    else {
      this.context = await this.browser.newContext(contextOptions);
      logger.info("🆕 새로운 브라우저 컨텍스트 생성됨 (첫 로그인)");
    }

    this.page = await this.context.newPage();

    this.page.on("close", () => {
      logger.info("페이지가 닫힘");
      this.page = null;
    });
  }

  private async ensureValidPage(): Promise<Page> {
    if (!this.isBrowserValid()) {
      await this.initBrowser();
    }

    if (!this.page || this.page.isClosed()) {
      if (this.context) {
        this.page = await this.context.newPage();
        this.page.on("close", () => {
          this.page = null;
        });
      } else {
        await this.initBrowser();
      }
    }

    return this.page!;
  }

  public async loginWithRetry(
    maxWaitTime: number = 300000
  ): Promise<LoginResult> {
    this.loginAbortController = new AbortController();
    const signal = this.loginAbortController.signal;

    try {
      const page = await this.ensureValidPage();

      const KAKAO_LOGIN_URL =
        "https://accounts.kakao.com/login/?continue=https%3A%2F%2Fkauth.kakao.com%2Foauth%2Fauthorize%3Fclient_id%3D3e6ddd834b023f24221217e370daed18%26state%3DaHR0cHM6Ly93d3cudGlzdG9yeS5jb20v%26redirect_uri%3Dhttps%253A%252F%252Fwww.tistory.com%252Fauth%252Fkakao%252Fredirect%26response_type%3Dcode%26auth_tran_id%3D.DhJJcB3LN3NpjjZrEdt2AaNSTa_py2.8tVXt6ZWIJ_0ZmxKmJx~2BXiyZsE%26ka%3Dsdk%252F2.7.3%2520os%252Fjavascript%2520sdk_type%252Fjavascript%2520lang%252Fko%2520device%252FLinux_x86_64%2520origin%252Fhttps%25253A%25252F%25252Fwww.tistory.com%26is_popup%3Dfalse%26through_account%3Dtrue&talk_login=hidden#login";

      await page.goto(TISTORY_SELECTORS.LOGIN.TISTORY_MAIN_URL);

      if (signal.aborted) {
        return {
          success: false,
          state: "logged-out",
          error: "로그인이 취소되었습니다.",
        };
      }

      const isNotLoggedIn = await page.evaluate((selector) => {
        return !!document.querySelector(selector);
      }, TISTORY_SELECTORS.LOGIN.LOGIN_INDICATOR_CLASS);

      if (isNotLoggedIn) {
        this.loginState = "logging-in";
        sendLogToRenderer(
          this.mainWindow,
          "로그인이 필요합니다. 로그인 페이지로 이동합니다..."
        );

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("login-state-change", {
            state: "logging-in",
            message: "로그인 페이지에서 로그인해주세요.",
          });
        }

        await page.goto(KAKAO_LOGIN_URL);

        if (signal.aborted) {
          return {
            success: false,
            state: "logged-out",
            error: "로그인이 취소되었습니다.",
          };
        }

        const waitForLoginResult = await this.waitForLoginCompletion(
          page,
          maxWaitTime,
          signal
        );

        if (!waitForLoginResult.success) {
          this.loginState = "logged-out";
          return waitForLoginResult;
        }

        if (this.context) {
          const storageState = await this.context.storageState();
          const cookies = await this.context.cookies();
          const auth = store.get("auth");
          store.set("auth", {
            ...auth,
            cookies,
            storageState,
            lastLogin: Date.now(),
          });
          sendLogToRenderer(
            this.mainWindow,
            "로그인 성공! 세션 정보가 저장되었습니다."
          );
        }

        this.loginState = "logged-in";

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("login-state-change", {
            state: "logged-in",
            message: "로그인 완료",
          });
        }

        return { success: true, state: "logged-in" };
      } else {
        sendLogToRenderer(this.mainWindow, "이미 로그인된 상태입니다.");
        this.loginState = "logged-in";

        // [개선] 이미 로그인된 상태에서도 세션 상태 갱신
        if (this.context) {
          try {
            const storageState = await this.context.storageState();
            const cookies = await this.context.cookies();
            const auth = store.get("auth");
            store.set("auth", {
              ...auth,
              cookies,
              storageState,
              lastLogin: Date.now(),
            });

            logger.info("🔄 기존 세션 상태가 갱신되었습니다.");
          } catch (e) {
            logger.warn(`세션 갱신 중 경고: ${e}`);
          }
        }
        // [핵심 변경] 로그인 성공 시 전체 상태 저장
        if (this.context) {
          try {
            const storageState = await this.context.storageState(); // 쿠키 + 로컬스토리지 덤프
            const cookies = await this.context.cookies(); // 백업용

            const auth = store.get("auth");
            store.set("auth", {
              ...auth,
              cookies,
              storageState, // 전체 상태 저장 (LocalStorage 포함)
              lastLogin: Date.now(),
            });

            logger.info(
              "✅ 로그인 세션 전체 상태가 영구 저장되었습니다. (StorageState + Cookies)"
            );
            sendLogToRenderer(
              this.mainWindow,
              "✅ 로그인 정보가 안전하게 저장되었습니다."
            );
          } catch (e) {
            logger.error(`세션 저장 실패: ${e}`);
          }
        }

        return { success: true, state: "logged-in" };
      }
    } catch (error: any) {
      logger.error(`Login failed: ${error}`);
      sendLogToRenderer(
        this.mainWindow,
        `로그인 중 오류 발생: ${error.message}`
      );
      this.loginState = "logged-out";

      if (
        error.message.includes("closed") ||
        error.message.includes("Target")
      ) {
        await this.cleanupBrowser();
      }

      return { success: false, state: "logged-out", error: error.message };
    } finally {
      this.loginAbortController = null;
    }
  }

  private async waitForLoginCompletion(
    page: Page,
    maxWaitTime: number,
    signal: AbortSignal
  ): Promise<LoginResult> {
    const startTime = Date.now();
    const checkInterval = 1000;

    sendLogToRenderer(this.mainWindow, "로그인 완료를 기다리는 중...");

    while (Date.now() - startTime < maxWaitTime) {
      if (signal.aborted) {
        return {
          success: false,
          state: "logged-out",
          error: "로그인이 취소되었습니다.",
        };
      }

      try {
        const currentUrl = page.url();

        if (
          currentUrl.includes("tistory.com") &&
          !currentUrl.includes("accounts.kakao.com") &&
          !currentUrl.includes("login")
        ) {
          const isLoggedIn = await page.evaluate(() => {
            const loginIndicator = document.querySelector(".txt_login");
            return !loginIndicator;
          });

          if (isLoggedIn) {
            sendLogToRenderer(this.mainWindow, "로그인이 완료되었습니다!");
            return { success: true, state: "logged-in" };
          }
        }

        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const remainingSeconds = Math.floor(
          (maxWaitTime - (Date.now() - startTime)) / 1000
        );

        if (elapsedSeconds % 10 === 0 && elapsedSeconds > 0) {
          sendLogToRenderer(
            this.mainWindow,
            `로그인 대기 중... (${elapsedSeconds}초 경과, ${remainingSeconds}초 남음)`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      } catch (e) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }
    }

    return {
      success: false,
      state: "logged-out",
      error: "로그인 시간이 초과되었습니다.",
    };
  }

  public async login(): Promise<boolean> {
    const result = await this.loginWithRetry();
    return result.success;
  }

  /**
   * [신규] 쿠키 기반 빠른 로그인 상태 확인
   * 페이지 이동 없이 저장된 인증 정보의 유효성을 검사합니다.
   *
   * @returns {Promise<boolean>} 쿠키가 유효하면 true
   */
  private async quickCookieCheck(): Promise<boolean> {
    try {
      const authData = store.get("auth");

      // 인증 데이터 존재 여부 확인
      if (!authData || !authData.lastLogin) {
        logger.debug("쿠키 빠른 검사: 인증 데이터 없음");
        return false;
      }

      // 마지막 로그인으로부터 24시간 이내인지 확인
      const now = Date.now();
      const hoursSinceLogin = (now - authData.lastLogin) / (1000 * 60 * 60);

      if (hoursSinceLogin > 24) {
        logger.debug(
          `쿠키 빠른 검사: 세션 만료 (${hoursSinceLogin.toFixed(1)}시간 경과)`
        );
        return false;
      }

      // 쿠키 존재 및 유효성 확인
      if (!authData.cookies || authData.cookies.length === 0) {
        logger.debug("쿠키 빠른 검사: 쿠키 없음");
        return false;
      }

      // Tistory 관련 필수 쿠키 존재 확인
      const hasTistoryCookie = authData.cookies.some(
        (cookie: any) =>
          cookie.domain?.includes("tistory") &&
          (cookie.name?.includes("TSSESSION") ||
            cookie.name?.includes("TSESSION") ||
            cookie.name?.includes("auth") ||
            cookie.name?.includes("token"))
      );

      if (!hasTistoryCookie) {
        logger.debug("쿠키 빠른 검사: Tistory 세션 쿠키 없음");
        return false;
      }

      // storageState 존재 확인 (더 안정적인 세션)
      if (authData.storageState) {
        logger.info("쿠키 빠른 검사: 유효한 세션 상태 확인됨");
        return true;
      }

      logger.info("쿠키 빠른 검사: 쿠키 유효함");
      return true;
    } catch (error) {
      logger.warn(`쿠키 빠른 검사 실패: ${error}`);
      return false;
    }
  }

  /**
   * [신규] 페이지 기반 로그인 상태 확인
   * 실제 페이지 이동이 필요한 경우에만 호출됩니다.
   */
  private async performPageBasedLoginCheck(): Promise<boolean> {
    try {
      const page = await this.ensureValidPage();

      await page.goto("https://www.tistory.com", {
        waitUntil: "networkidle",
        timeout: 15000,
      });

      const loginChecks = [
        () => page.evaluate(() => !document.querySelector(".txt_login")),
        () => page.evaluate(() => !!document.querySelector(".user_menu")),
        () => page.evaluate(() => !document.querySelector("a[href*='login']")),
        () =>
          page.evaluate(() => {
            const userElements = document.querySelectorAll(
              "[data-user-id], .user_info, .nickname"
            );
            return userElements.length > 0;
          }),
      ];

      let isLoggedIn = false;
      for (let i = 0; i < loginChecks.length; i++) {
        try {
          const result = await loginChecks[i]();
          if (result) {
            isLoggedIn = true;
            logger.info(`로그인 확인 방법 ${i + 1} 성공`);
            break;
          }
        } catch (e) {
          logger.debug(`로그인 확인 방법 ${i + 1} 실패: ${e}`);
        }
      }

      if (isLoggedIn && this.context) {
        try {
          const cookies = await this.context.cookies();
          const hasValidSession = cookies.some(
            (cookie) =>
              cookie.name.includes("session") ||
              cookie.name.includes("token") ||
              cookie.domain.includes("tistory")
          );

          if (!hasValidSession) {
            logger.warn("유효한 세션 쿠키를 찾을 수 없음.");
            isLoggedIn = false;
          }
        } catch (e) {
          logger.debug(`쿠키 확인 중 오류: ${e}`);
        }
      }

      if (isLoggedIn && this.context) {
        const authData = store.get("auth");
        const storageState = await this.context.storageState();
        const cookies = await this.context.cookies();

        store.set("auth", {
          ...authData,
          cookies,
          storageState,
          lastLogin: Date.now(),
        });

        logger.info("로그인 상태 확인 및 세션 갱신 완료");
        this.loginState = "logged-in";
        this.lastLoginCheckTime = Date.now();
      } else {
        this.loginState = "logged-out";
      }

      return isLoggedIn;
    } catch (error: any) {
      logger.error(`페이지 기반 로그인 확인 실패: ${error}`);
      this.loginState = "unknown";
      return false;
    }
  }

  /**
   * [개선] 로그인 상태 확인 - 2단계 검증 전략
   * 1단계: 쿠키 기반 빠른 검사 (페이지 이동 없음)
   * 2단계: 페이지 기반 실제 검증 (1단계 실패 시에만)
   */
  public async checkCurrentLoginStatus(): Promise<boolean> {
    try {
      // 캐시된 검증 결과 확인 (30초 이내 재검증 방지)
      const now = Date.now();
      if (
        this.loginState === "logged-in" &&
        now - this.lastLoginCheckTime < this.LOGIN_CHECK_CACHE_MS
      ) {
        logger.info("로그인 상태 캐시 사용 (30초 이내 재검증 건너뜀)");
        return true;
      }

      // 1단계: 쿠키 기반 빠른 검사
      const quickCheckResult = await this.quickCookieCheck();

      if (quickCheckResult) {
        // 쿠키가 유효하면 로그인된 것으로 간주
        this.loginState = "logged-in";
        this.lastLoginCheckTime = now;
        logger.info("쿠키 기반 로그인 상태 확인 완료 (페이지 이동 없음)");
        return true;
      }

      // 2단계: 쿠키 검사 실패 시에만 페이지 기반 검증
      logger.info("쿠키 검사 실패, 페이지 기반 검증 수행...");
      return await this.performPageBasedLoginCheck();
    } catch (error: any) {
      logger.error(`로그인 상태 확인 실패: ${error}`);
      this.loginState = "unknown";

      if (
        error.message.includes("closed") ||
        error.message.includes("Target")
      ) {
        await this.cleanupBrowser();
      }

      return false;
    }
  }

  /**
   * [개선] 발행용 로그인 확인 - 최적화된 버전
   * 페이지 리다이렉트를 최소화합니다.
   */
  public async ensureLoggedInForPublish(): Promise<LoginResult> {
    sendLogToRenderer(this.mainWindow, "로그인 상태 확인 중...");

    // 빠른 쿠키 기반 검사 먼저 수행
    const isLoggedIn = await this.checkCurrentLoginStatus();

    if (isLoggedIn) {
      sendLogToRenderer(this.mainWindow, "로그인 상태 확인됨 (세션 유효)");
      return { success: true, state: "logged-in" };
    }

    sendLogToRenderer(
      this.mainWindow,
      "로그인이 필요합니다. 로그인 진행 중..."
    );
    return await this.loginWithRetry();
  }

  public async refreshSession(): Promise<boolean> {
    try {
      logger.info("세션 갱신 시도...");

      const isCurrentlyLoggedIn = await this.checkCurrentLoginStatus();

      if (isCurrentlyLoggedIn) {
        logger.info("세션이 유효함.");
        return true;
      }

      const page = await this.ensureValidPage();

      const KAKAO_LOGIN_URL =
        "https://accounts.kakao.com/login/?continue=https%3A%2F%2Fkauth.kakao.com%2Foauth%2Fauthorize%3Fclient_id%3D3e6ddd834b023f24221217e370daed18%26state%3DaHR0cHM6Ly93d3cudGlzdG9yeS5jb20v%26redirect_uri%3Dhttps%253A%252F%252Fwww.tistory.com%252Fauth%252Fkakao%252Fredirect%26response_type%3Dcode%26auth_tran_id%3D.DhJJcB3LN3NpjjZrEdt2AaNSTa_py2.8tVXt6ZWIJ_0ZmxKmJx~2BXiyZsE%26ka%3Dsdk%252F2.7.3%2520os%252Fjavascript%2520sdk_type%252Fjavascript%2520lang%252Fko%2520device%252FLinux_x86_64%2520origin%252Fhttps%25253A%25252F%25252Fwww.tistory.com%26is_popup%3Dfalse%26through_account%3Dtrue&talk_login=hidden#login";

      await page.goto(KAKAO_LOGIN_URL);

      try {
        await page.waitForURL("**/tistory.com/**", {
          timeout: 1800000,
        });
      } catch (e) {
        logger.warn("세션 갱신 대기 시간 초과");
        return false;
      }

      if (this.context) {
        const storageState = await this.context.storageState();
        const cookies = await this.context.cookies();
        const auth = store.get("auth");

        store.set("auth", {
          ...auth,
          cookies,
          storageState,
          lastLogin: Date.now(),
        });
      }

      logger.info("세션 갱신 성공");
      return true;
    } catch (error: any) {
      logger.error(`Session refresh failed: ${error}`);

      if (
        error.message.includes("closed") ||
        error.message.includes("Target")
      ) {
        await this.cleanupBrowser();
      }

      return false;
    }
  }

  private async findElementBySelectors(
    selectors: string[],
    timeout = 2000
  ): Promise<{ element: any; selector: string } | null> {
    const page = await this.ensureValidPage();

    for (const selector of selectors) {
      try {
        const element = await page.waitForSelector(selector, { timeout });
        if (element) return { element, selector };
      } catch (e) {}
    }
    return null;
  }

  public async processImageTags(
    content: string,
    usedImageUrls?: Set<string>
  ): Promise<string> {
    // [[IMAGE:...]] 또는 [[이미지:...]] 패턴 매칭
    const imageTagRegex = /\[\[IMAGE:\s*(.+?)\]\]/gi;
    const matches = [...content.matchAll(imageTagRegex)];

    if (matches.length === 0) return content;

    sendLogToRenderer(
      this.mainWindow,
      `🖼 ${matches.length}개의 이미지 태그 처리 중 (Google → Pexels → Placeholder)`
    );

    let newContent = content;
    const usedUrls = usedImageUrls || new Set<string>();

    for (const match of matches) {
      const fullMatch = match[0];
      const keyword = match[1];

      try {
        let finalImageUrl: string | null = null;

        // 1. Google 이미지 검색 시도
        const googleImages = await this.scrapeGoogleImages(keyword);
        if (googleImages && googleImages.length > 0) {
          for (const imgUrl of googleImages) {
            if (!usedUrls.has(imgUrl) && (await this.verifyImageUrl(imgUrl))) {
              finalImageUrl = imgUrl;
              break;
            }
          }
        }

        // 2. Pexels fallback
        if (!finalImageUrl) {
          finalImageUrl = await this.fetchRelevantImage(keyword);
        }

        // 3. Placeholder fallback (최종 안전장치)
        if (!finalImageUrl) {
          finalImageUrl = `https://placehold.co/800x400/f8f9fa/6c5ce7?font=roboto&text=${encodeURIComponent(
            keyword
          )}`;
        }

        if (finalImageUrl) {
          usedUrls.add(finalImageUrl);
          const imageHtml = this.createSectionImageHtml(finalImageUrl, keyword);
          newContent = newContent.replace(fullMatch, imageHtml);
        }
      } catch (e) {
        logger.error(`이미지 태그 처리 실패 (${keyword}): ${e}`);
        // 실패 시 태그만 제거
        newContent = newContent.replace(fullMatch, "");
      }
    }
    return newContent;
  }

  // ==========================================
  //  NAVER BLOG AUTOMATION
  // ==========================================

  /**
   * 네이버 로그인 체크 및 진입 (User Requirement #1)
   *
   * 로그인 세션/쿠키가 있고 로그인이 되어있는 상태라면
   * 글쓰기 페이지로 바로 리다이렉트한다.
   */
  // ==========================================
  // NAVER BLOG AUTOMATION
  // ==========================================

  /**
   * 네이버 발행 진입점 (전체 파이프라인 관리)
   *
   * 로그인 -> 카테고리 검증(Pre-flight) -> 글쓰기 -> 발행 설정 -> 발행
   */
  public async writeToNaver(
    blogId: string,
    title: string,
    contentHtml: string,
    categoryName?: string
  ): Promise<void> {
    this.publishAbortController = new AbortController();
    const signal = this.publishAbortController.signal;

    try {
      const page = await this.ensureValidPage();

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      // 1. 로그인 체크
      const isLoggedIn = await this.naverService.login(page, blogId);
      if (!isLoggedIn) {
        throw new Error("네이버 로그인 실패");
      }

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      // 2. 카테고리 검증 및 생성 (Pre-flight Check)
      if (categoryName && categoryName !== "General") {
        await this.naverService.ensureCategoryExists(
          page,
          blogId,
          categoryName
        );
      }

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      // 3. 글 작성 및 발행 (Main Flow)
      await this.naverService.writePost(
        page,
        blogId,
        title,
        contentHtml,
        categoryName || ""
      );
    } catch (e: any) {
      if (e.message.includes("취소")) {
        throw e;
      }

      logger.error(`네이버 발행 실패: ${e.message}`);
      sendLogToRenderer(this.mainWindow, `❌ 발행 실패: ${e.message}`);

      if (e.message.includes("closed") || e.message.includes("Target")) {
        await this.cleanupBrowser();
      }
      throw e;
    } finally {
      this.publishAbortController = null;
    }
  }

  public async validateAndReplaceImages(htmlContent: string): Promise<string> {
    sendLogToRenderer(this.mainWindow, "이미지 유효성 검증 시작...");

    const imgRegex =
      /<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi;
    const matches = [...htmlContent.matchAll(imgRegex)];

    if (matches.length === 0) {
      sendLogToRenderer(this.mainWindow, "검증할 이미지가 없습니다.");
      return htmlContent;
    }

    sendLogToRenderer(this.mainWindow, `${matches.length}개 이미지 검증 중...`);

    let updatedContent = htmlContent;
    const usedUrls = new Set<string>();

    for (const match of matches) {
      const fullTag = match[0];
      const imageUrl = match[1];
      const altText = match[2] || "image";

      usedUrls.add(imageUrl);

      const isValid = await this.verifyImageUrl(imageUrl);

      if (!isValid) {
        sendLogToRenderer(
          this.mainWindow,
          `깨진 이미지 발견: ${imageUrl.substring(0, 50)}...`
        );

        const keyword = this.extractKeywordFromAlt(altText);
        const replacementUrl = await this.findReplacementImage(
          keyword,
          usedUrls
        );

        if (replacementUrl) {
          usedUrls.add(replacementUrl);
          const newTag = fullTag.replace(imageUrl, replacementUrl);
          updatedContent = updatedContent.replace(fullTag, newTag);
          sendLogToRenderer(this.mainWindow, `이미지 대체 완료: ${keyword}`);
        } else {
          const placeholderUrl = `https://placehold.co/800x400/EEE/31343C?font=roboto&text=${encodeURIComponent(
            keyword
          )}`;
          const newTag = fullTag.replace(imageUrl, placeholderUrl);
          updatedContent = updatedContent.replace(fullTag, newTag);
          sendLogToRenderer(this.mainWindow, `플레이스홀더로 대체: ${keyword}`);
        }
      }
    }

    sendLogToRenderer(this.mainWindow, "이미지 검증 완료");
    return updatedContent;
  }

  private async verifyImageUrl(url: string): Promise<boolean> {
    if (!url || url.includes("placehold.co")) {
      return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.includes("image")) {
        return false;
      }

      return true;
    } catch (error) {
      logger.warn(`이미지 검증 실패 (${url}): ${error}`);
      return false;
    }
  }

  private async verifyImageWithBrowser(url: string): Promise<boolean> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.initBrowser();
    }
    if (!this.browser) return false;

    let testPage: Page | null = null;

    try {
      testPage = await this.browser.newPage();

      const result = await testPage.evaluate(async (imageUrl: string) => {
        return new Promise<boolean>((resolve) => {
          const img = new Image();
          const timeout = setTimeout(() => resolve(false), 5000);

          img.onload = () => {
            clearTimeout(timeout);
            resolve(img.naturalWidth > 10 && img.naturalHeight > 10);
          };

          img.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };

          img.src = imageUrl;
        });
      }, url);

      return result;
    } catch (error) {
      logger.warn(`브라우저 이미지 검증 실패: ${error}`);
      return false;
    } finally {
      if (testPage) {
        await testPage.close().catch(() => {});
      }
    }
  }

  private extractKeywordFromAlt(altText: string): string {
    if (!altText || altText === "image") {
      return "blog";
    }

    const cleanedAlt = altText
      .replace(/[^\w\s가-힣]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(" ");

    return cleanedAlt || "blog";
  }

  private async findReplacementImage(
    keyword: string,
    excludeUrls: Set<string>
  ): Promise<string | null> {
    const cachedImages = this.imageCache.get(keyword);

    if (cachedImages && cachedImages.length > 0) {
      for (const url of cachedImages) {
        if (!excludeUrls.has(url)) {
          const isValid = await this.verifyImageUrl(url);
          if (isValid) {
            return url;
          }
        }
      }
    }

    const freshImages = await this.scrapeGoogleImages(keyword);

    if (freshImages.length > 0) {
      this.imageCache.set(keyword, freshImages);

      for (const url of freshImages) {
        if (!excludeUrls.has(url)) {
          const isValid = await this.verifyImageUrl(url);
          if (isValid) {
            return url;
          }
        }
      }
    }

    try {
      const pexelsImage = await this.fetchRelevantImage(keyword);
      if (pexelsImage && !excludeUrls.has(pexelsImage)) {
        const isValid = await this.verifyImageUrl(pexelsImage);
        if (isValid) {
          return pexelsImage;
        }
      }
    } catch (e) {
      logger.warn(`Pexels 대체 이미지 검색 실패: ${e}`);
    }

    return null;
  }

  public async insertSectionImages(
    htmlContent: string,
    usedImageUrls: Set<string>
  ): Promise<string> {
    sendLogToRenderer(this.mainWindow, "섹션별 이미지 삽입 분석 중...");

    const sections = this.extractSections(htmlContent);

    if (sections.length === 0) {
      sendLogToRenderer(this.mainWindow, "삽입할 섹션이 없습니다.");
      return htmlContent;
    }

    sendLogToRenderer(this.mainWindow, `${sections.length}개 섹션 발견`);

    let updatedContent = htmlContent;
    const sectionsNeedingImages = this.identifySectionsNeedingImages(
      sections,
      htmlContent
    );

    for (const section of sectionsNeedingImages) {
      try {
        const keyword = await this.extractSectionKeyword(
          section.title,
          section.content
        );

        if (!keyword || keyword === "blog") {
          continue;
        }

        const imageUrl = await this.fetchImageFromGoogle(
          keyword,
          usedImageUrls
        );

        if (imageUrl) {
          usedImageUrls.add(imageUrl);

          const imageHtml = this.createSectionImageHtml(imageUrl, keyword);
          updatedContent = this.insertImageAfterSection(
            updatedContent,
            section.endTag,
            imageHtml
          );

          sendLogToRenderer(
            this.mainWindow,
            `섹션 이미지 삽입: "${section.title}" → ${keyword}`
          );
        }
      } catch (error) {
        logger.warn(`섹션 이미지 삽입 실패 (${section.title}): ${error}`);
      }
    }

    return updatedContent;
  }

  private extractSections(htmlContent: string): Array<{
    title: string;
    content: string;
    startIndex: number;
    endIndex: number;
    endTag: string;
    hasImage: boolean;
  }> {
    const sections: Array<{
      title: string;
      content: string;
      startIndex: number;
      endIndex: number;
      endTag: string;
      hasImage: boolean;
    }> = [];

    const headingRegex = /<(h[23]|p[^>]*><b>)[^>]*>(.*?)<\/(h[23]|b><\/p)>/gi;
    const matches = [...htmlContent.matchAll(headingRegex)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const nextMatch = matches[i + 1];

      const startIndex = match.index! + match[0].length;
      const endIndex = nextMatch ? nextMatch.index! : htmlContent.length;

      const sectionContent = htmlContent.substring(startIndex, endIndex);
      const hasImage = /<img[^>]+>/i.test(sectionContent);

      const titleText = match[2]
        .replace(/<[^>]*>/g, "")
        .replace(/^\d+\.\s*/, "")
        .trim();

      sections.push({
        title: titleText,
        content: sectionContent,
        startIndex,
        endIndex,
        endTag: match[0],
        hasImage,
      });
    }

    return sections;
  }

  private identifySectionsNeedingImages(
    sections: Array<{
      title: string;
      content: string;
      startIndex: number;
      endIndex: number;
      endTag: string;
      hasImage: boolean;
    }>,
    htmlContent: string
  ): Array<{
    title: string;
    content: string;
    endTag: string;
  }> {
    const needImages: Array<{
      title: string;
      content: string;
      endTag: string;
    }> = [];

    const totalImages = (htmlContent.match(/<img[^>]+>/gi) || []).length;
    const targetImageCount = Math.max(3, Math.ceil(sections.length * 0.6));

    if (totalImages >= targetImageCount) {
      return needImages;
    }

    const sectionsWithoutImages = sections.filter((s) => !s.hasImage);

    const selectedCount = Math.min(
      targetImageCount - totalImages,
      sectionsWithoutImages.length
    );

    const interval = Math.max(
      1,
      Math.floor(sectionsWithoutImages.length / selectedCount)
    );

    for (
      let i = 0;
      i < sectionsWithoutImages.length && needImages.length < selectedCount;
      i += interval
    ) {
      needImages.push({
        title: sectionsWithoutImages[i].title,
        content: sectionsWithoutImages[i].content,
        endTag: sectionsWithoutImages[i].endTag,
      });
    }

    return needImages;
  }

  private async extractSectionKeyword(
    title: string,
    content: string
  ): Promise<string> {
    try {
      const sampleText = `${title} ${content.substring(0, 200)}`;
      const keyword = await this.aiService.extractKeyword(sampleText);
      return keyword;
    } catch (error) {
      const words = title.split(/\s+/).filter((w) => w.length > 2);
      return words.slice(0, 2).join(" ") || "blog";
    }
  }

  private createSectionImageHtml(imageUrl: string, altText: string): string {
    return `
<div style="display: flex; flex-direction: column; align-items: center; margin: 40px 0;">
  <div style="max-width: 100%; text-align: center;">
    <img src="${imageUrl}" alt="${altText}"
         style="max-width: 100%; height: auto; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); display: block;"
         loading="lazy" />
  </div>
  <p style="margin-top: 8px; font-size: 0.8em; color: #999; text-align: center;">※ 이 이미지는 참고용이며, 내용과 직접적인 연관이 없을 수 있습니다.</p>
</div>`;
  }

  private insertImageAfterSection(
    htmlContent: string,
    sectionEndTag: string,
    imageHtml: string
  ): string {
    const insertIndex = htmlContent.indexOf(sectionEndTag);

    if (insertIndex === -1) {
      return htmlContent;
    }

    const afterHeading = htmlContent.substring(
      insertIndex + sectionEndTag.length
    );

    // Check if there's already an image immediately following
    // (Simple check: look for <img within the next 200 chars)
    if (afterHeading.substring(0, 200).match(/<img/i)) {
      logger.info("Skipping image insertion: Image already exists nearby.");
      return htmlContent;
    }

    const nextParagraphMatch = afterHeading.match(/<\/p>/);

    if (nextParagraphMatch && nextParagraphMatch.index !== undefined) {
      const absoluteIndex =
        insertIndex + sectionEndTag.length + nextParagraphMatch.index + 4;
      return (
        htmlContent.substring(0, absoluteIndex) +
        imageHtml +
        htmlContent.substring(absoluteIndex)
      );
    }

    return (
      htmlContent.substring(0, insertIndex + sectionEndTag.length) +
      imageHtml +
      htmlContent.substring(insertIndex + sectionEndTag.length)
    );
  }

  public async processContentWithImageValidation(
    htmlContent: string
  ): Promise<string> {
    sendLogToRenderer(this.mainWindow, "콘텐츠 이미지 처리 시작...");

    const usedImageUrls = new Set<string>();

    const imgMatches =
      htmlContent.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
    imgMatches.forEach((match: string) => {
      const urlMatch = match.match(/src=["']([^"']+)["']/);
      if (urlMatch) {
        usedImageUrls.add(urlMatch[1]);
      }
    });

    let processedContent = await this.processImageTags(
      htmlContent,
      usedImageUrls
    );
    processedContent = await this.validateAndReplaceImages(processedContent);
    processedContent = await this.insertSectionImages(
      processedContent,
      usedImageUrls
    );
    processedContent = await this.validateAndReplaceImages(processedContent);

    // [최종 안전장치] 남은 태그 잔여물 강제 제거
    // AI가 만든 태그([[IMAGE:...]] 또는 [[이미지:...]])가 처리되지 않고
    // 본문에 그대로 남아있는 경우를 방지하기 위함입니다.
    processedContent = processedContent.replace(
      /\[\[(?:IMAGE|이미지):.*?\]\]/gi,
      ""
    );

    sendLogToRenderer(this.mainWindow, "콘텐츠 이미지 처리 완료");
    return processedContent;
  }

  /**
   * [신규] 카테고리명으로 적절한 주제 찾기
   */
  private matchCategoryToTopic(categoryName: string): string {
    for (const [topicKey, keywords] of Object.entries(HOME_TOPIC_KEYWORDS)) {
      const cleanTopic = topicKey.replace(/^- /, "").trim();
      // 카테고리 이름에 키워드가 포함되어 있는지 확인
      for (const keyword of keywords) {
        if (categoryName.includes(keyword)) {
          return cleanTopic;
        }
      }
    }
    return "주제 없음";
  }

  /**
   * [신규] 카테고리 존재 확인 및 생성
   */
  public async ensureCategoryExists(
    categoryName: string,
    page?: Page
  ): Promise<void> {
    // page가 없으면 현재 페이지 사용
    if (!page) {
      page = await this.ensureValidPage();
    }
    try {
      sendLogToRenderer(this.mainWindow, `카테고리 확인 중: ${categoryName}`);

      // 1. 글쓰기 페이지에서 카테고리 목록 확인
      await page.waitForSelector(TISTORY_SELECTORS.CATEGORY.BUTTON, {
        timeout: 5000,
      });
      await page.click(TISTORY_SELECTORS.CATEGORY.BUTTON);
      await page.waitForTimeout(500);

      const items = await page.$$(TISTORY_SELECTORS.CATEGORY.ITEM);
      let exists = false;
      for (const item of items) {
        const text = await item.innerText();
        // 정확한 매칭 또는 포함 관계 확인
        if (text.trim() === categoryName || text.includes(categoryName)) {
          exists = true;
          break;
        }
      }

      // 드롭다운 닫기
      await page.click(TISTORY_SELECTORS.CATEGORY.BUTTON);

      if (exists) {
        logger.info(`카테고리 '${categoryName}' 이미 존재함.`);
        return;
      }

      // 2. 존재하지 않으면 관리 페이지로 이동
      sendLogToRenderer(
        this.mainWindow,
        "카테고리가 없어 생성을 시작합니다..."
      );

      const settings = store.get("settings");
      let blogName = settings.blogName;

      // 블로그 이름이 없으면 URL에서 추출
      if (!blogName) {
        const url = page.url();
        const match = url.match(/https?:\/\/([^.]+)\.tistory\.com/);
        if (match) {
          blogName = match[1];
        } else {
          throw new Error("블로그 이름을 찾을 수 없어 카테고리 생성 불가");
        }
      }

      const manageUrl = TISTORY_SELECTORS.MANAGE_CATEGORY.URL(blogName);
      await page.goto(manageUrl, { waitUntil: "networkidle" });

      // 3. 카테고리 추가 로직
      // 추가 버튼 클릭
      await page.click(TISTORY_SELECTORS.MANAGE_CATEGORY.BTN_ADD);
      await page.waitForTimeout(500);

      // 이름 입력
      await page.fill(
        TISTORY_SELECTORS.MANAGE_CATEGORY.INPUT_NAME,
        categoryName
      );

      // 주제 선택
      const topicName = this.matchCategoryToTopic(categoryName);
      logger.info(`매칭된 주제: ${topicName}`);

      // 주제 드롭다운 열기
      await page.click(TISTORY_SELECTORS.MANAGE_CATEGORY.DROPDOWN_BTN);
      await page.waitForTimeout(500);

      // 주제 항목 클릭 시도
      let topicSelected = false;

      // 주제 목록 컨테이너
      const layerOpt = await page.$(
        TISTORY_SELECTORS.MANAGE_CATEGORY.DROPDOWN_LAYER
      );

      if (layerOpt && topicName !== "주제 없음") {
        // 1. 소주제를 바로 찾아서 클릭 시도
        // (구조: li > div.layer_opt > ul > li > label text)
        // 텍스트로 요소 찾기 (Playwright locator 활용)
        try {
          // ElementHandle에서 직접 locator를 사용할 수 없으므로 page에서 직접 찾기
          const topicLabel = page
            .locator(
              `${TISTORY_SELECTORS.MANAGE_CATEGORY.DROPDOWN_LAYER} .lab_btn:has-text("${topicName}")`
            )
            .first();
          if (await topicLabel.isVisible()) {
            await topicLabel.click();
            topicSelected = true;
          } else {
            // 안 보이면 대분류를 먼저 찾아야 함
            // 대분류 찾기 (어려움, 매핑 정보가 없으면)
            // 일단 모든 대분류를 펼쳐보는 전략 또는 상위 요소 검색
            // 여기서는 "주제 없음"으로 fallback하거나, 보이는 것만 클릭
          }
        } catch (e) {
          logger.warn(`주제 선택 실패: ${e}`);
        }
      }

      if (!topicSelected) {
        // 주제 없음 선택
        await page.click("text=주제 없음");
      }

      // 확인 버튼 (소분류 추가 확인)
      await page.click(TISTORY_SELECTORS.MANAGE_CATEGORY.BTN_CONFIRM);
      await page.waitForTimeout(1000);

      // 변경사항 저장 (전체 저장)
      await page.click(TISTORY_SELECTORS.MANAGE_CATEGORY.BTN_SAVE);

      // 저장 완료 대기 (알림창 등)
      await page.waitForTimeout(2000);
      try {
        await page.on("dialog", (dialog) => dialog.accept());
      } catch {}

      sendLogToRenderer(
        this.mainWindow,
        "카테고리 생성 완료. 글쓰기로 복귀..."
      );

      // 4. 글쓰기 페이지로 복귀
      const WRITE_URL = settings.writeRedirectUrl;
      await page.goto(WRITE_URL, { waitUntil: "networkidle" });
    } catch (e: any) {
      logger.error(`카테고리 생성 중 오류: ${e.message}`);
      // 오류가 나도 글쓰기 페이지로 돌아가서 진행 시도
      const settings = store.get("settings");
      await page.goto(settings.writeRedirectUrl, { waitUntil: "networkidle" });
    }
  }

  public async writePostFromHtmlFile(
    filePath: string,
    title: string,
    categoryName: string,
    htmlContent?: string,
    reservationDate?: Date,
    homeTheme?: string
  ): Promise<void> {
    this.publishAbortController = new AbortController();
    const signal = this.publishAbortController.signal;

    try {
      const page = await this.ensureValidPage();
      const WRITE_URL = store.get("settings").writeRedirectUrl;
      const modifier = process.platform === "darwin" ? "Meta" : "Control";

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      sendLogToRenderer(this.mainWindow, "HTML 파일 읽는 중...");

      // [FIX] 원본 HTML 저장을 위해 변수 분리
      let originalHtml: string;
      let bodyContent: string;

      if (htmlContent) {
        // htmlContent가 전달된 경우
        originalHtml = htmlContent;
        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        bodyContent = bodyMatch ? bodyMatch[1].trim() : htmlContent;
      } else {
        // htmlContent가 없으면 파일에서 읽기
        originalHtml = await fs.readFile(filePath, "utf-8");
        const bodyMatch = originalHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        bodyContent = bodyMatch ? bodyMatch[1].trim() : originalHtml;
      }

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      sendLogToRenderer(this.mainWindow, "이미지 유효성 검증 중...");
      const processedContent = await this.processContentWithImageValidation(
        bodyContent
      );

      // [NEW] 로컬 이미지 경로를 Base64로 변환 (에디터 삽입용)
      sendLogToRenderer(this.mainWindow, "이미지 인코딩 변환 중...");
      const finalContent = await this.convertLocalImagesToBase64(
        processedContent
      );

      // [FIX] 파일 업데이트 (전체 HTML 구조 유지) - originalHtml 사용
      // [FIX] 파일 업데이트 (전체 HTML 구조 유지) - originalHtml 사용
      const updatedHtml = originalHtml.replace(
        /<body[^>]*>[\s\S]*?<\/body>/i,
        `<body>${finalContent}</body>`
      );
      await fs.writeFile(filePath, updatedHtml, "utf-8");
      sendLogToRenderer(this.mainWindow, "이미지 처리 완료");

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      sendLogToRenderer(this.mainWindow, "글쓰기 페이지로 이동 중...");

      await page.goto(WRITE_URL, {
        waitUntil: "networkidle",
        timeout: 20000,
      });

      // 로그인 확인
      const isLoginPage = await page.evaluate(
        () =>
          window.location.href.includes("login") ||
          !!document.querySelector(".txt_login")
      );

      if (isLoginPage) {
        sendLogToRenderer(this.mainWindow, "로그인 필요. 재시도 중...");
        const loginResult = await this.loginWithRetry();
        if (!loginResult.success) {
          throw new Error("로그인 실패");
        }

        await page.goto(WRITE_URL, {
          waitUntil: "networkidle",
          timeout: 20000,
        });
      }

      await page.waitForTimeout(2000);

      // 팝업 닫기
      try {
        const popupClose = await page.$(".btn_close");
        if (popupClose) await popupClose.click();
      } catch {}

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      // [신규] 카테고리 존재 확인 및 생성
      if (categoryName && categoryName !== "카테고리 없음") {
        await this.ensureCategoryExists(categoryName, page);
      }

      await this.selectCategory(page, categoryName);

      // [FIX] 제목 입력 전 강력한 정제 (3차 방어)
      // HTML 태그 제거, 마크다운 제거, 따옴표 제거
      const cleanTitle = title
        .replace(/<[^>]*>/g, "") // HTML 태그 제거 (<strong> 등)
        .replace(/^[#\s]+/, "") // 마크다운 헤더 제거
        .replace(/\*\*/g, "") // 마크다운 볼드 제거
        .replace(/["''""]/g, "") // 따옴표 제거
        .replace(/&nbsp;/g, " ") // 엔티티 제거
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .trim();

      // 제목이 DOCTYPE으로 되어있다면 '제목 없음'으로 강제 변경
      const finalTitle = /^<!DOCTYPE/i.test(cleanTitle)
        ? "제목 없음"
        : cleanTitle;

      sendLogToRenderer(this.mainWindow, `제목 입력: ${finalTitle}`);

      const titleInput = await page.waitForSelector("#post-title-inp", {
        timeout: 5000,
      });
      if (titleInput) {
        await titleInput.click();
        await page.keyboard.press(`${modifier}+a`);
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(200);
        await titleInput.fill(finalTitle); // [Modified] cleanTitle -> finalTitle
      }

      await page.waitForTimeout(500);

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      // [핵심 변경] 클립보드 대신 직접 HTML 삽입
      sendLogToRenderer(this.mainWindow, "본문 콘텐츠 삽입 중...");
      sendLogToRenderer(this.mainWindow, "본문 콘텐츠 삽입 중...");
      await this.insertContentToEditor(page, finalContent, modifier);

      sendLogToRenderer(this.mainWindow, "본문 삽입 완료.");

      await page.waitForTimeout(1000);

      if (signal.aborted) {
        throw new Error("발행이 취소되었습니다.");
      }

      // [개선] 에디터에서 실제 콘텐츠를 추출하여 홈주제 선택에 활용
      let editorTextContent = "";
      try {
        const frame = page.frameLocator("#editor-tistory_ifr");
        editorTextContent = await frame
          .locator("body#tinymce")
          .evaluate((el: HTMLElement) => el.innerText || el.textContent || "");
        logger.info(`에디터 텍스트 추출 완료: ${editorTextContent.length}자`);
      } catch (e) {
        logger.warn("에디터 콘텐츠 추출 실패, 원본 콘텐츠 사용");
        // HTML 태그 제거
        // HTML 태그 제거
        editorTextContent = finalContent
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .substring(0, 2000);
      }

      // [NEW] 대표 이미지 설정 (본문 첫 번째 이미지)
      await this.setRepresentativeImage(page);

      // [FIX] 발행 순서 수정: 완료 버튼 클릭 -> (레이어 팝업) -> 홈주제 선택 -> 최종 발행
      await this.clickCompleteButton(page);
      await page.waitForTimeout(2000); // 레이어 애니메이션 대기

      await this.selectHomeTheme(
        page,
        cleanTitle,
        editorTextContent,
        homeTheme
      );

      // 예약 발행인 경우 예약 설정 처리
      if (reservationDate) {
        await this.setReservationDate(page, reservationDate);
        await this.clickReservationPublishButton(page);
      } else {
        await this.clickPublishButton(page);
      }

      sendLogToRenderer(
        this.mainWindow,
        reservationDate ? "예약 발행 완료!" : "발행 완료!"
      );
    } catch (e: any) {
      logger.error(`글 발행 실패: ${e.message}`);
      sendLogToRenderer(this.mainWindow, `오류: ${e.message}`);

      if (e.message.includes("closed") || e.message.includes("Target")) {
        await this.cleanupBrowser();
      }

      throw e;
    } finally {
      this.publishAbortController = null;
    }
  }

  private async convertMarkdownToHtml(markdown: string): Promise<string> {
    let html = markdown;

    html = html.replace(/^[a-zA-Z\s]+\n+/, "");
    html = html.replace(/^#+\s+(.*$)/gm, "");

    html = html.replace(
      /^## (.*$)/gim,
      `<h3 style="margin-top: 60px; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 2px solid #333; color: #111; font-family: 'Noto Sans KR', sans-serif; font-weight: 700; font-size: 26px; letter-spacing: -0.5px; line-height: 1.3;">$1</h3>`
    );

    html = html.replace(
      /^### (.*$)/gim,
      `<h4 style="margin-top: 40px; margin-bottom: 20px; color: #2c3e50; font-weight: 600; font-size: 22px; border-left: 4px solid #3498db; padding-left: 12px; line-height: 1.3;">$1</h4>`
    );

    html = html.replace(
      /^> (.*$)/gim,
      `<blockquote style="margin: 40px 0; padding: 25px; background-color: #f8f9fa; border-left: 5px solid #6c5ce7; color: #555; font-size: 18px; line-height: 1.8; border-radius: 0 8px 8px 0;">$1</blockquote>`
    );

    html = html.replace(
      /^---$/gim,
      `<hr style="margin: 80px 0; border: 0; border-top: 1px dashed #ccc;" />`
    );

    html = html.replace(
      /\*\*(.+?)\*\*/g,
      `<strong style="color: #d63031; font-weight: 700; font-size: 1.2em; background: linear-gradient(to top, #ffeaa7 50%, transparent 50%); line-height: 1.5; display: inline-block;">$1</strong>`
    );

    html = html.replace(
      /!\[(.*?)\]\((.*?)\)/g,
      `<figure style="text-align: center; margin: 40px 0;"><img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);" /><figcaption style="margin-top: 10px; font-size: 13px; color: #868e96;">$1</figcaption></figure>`
    );

    const paragraphs = html.split(/\n+/);

    html = paragraphs
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return "";

        if (trimmed.match(/^<(h3|h4|blockquote|div|hr|ul|ol|li|img)/i)) {
          return trimmed;
        }

        return `<p style="line-height: 2.0; margin-bottom: 24px; font-size: 17px; color: #333; letter-spacing: -0.03em; word-break: keep-all;">${trimmed}</p>`;
      })
      .join("\n");

    return html;
  }

  private async selectBestCategoryWithAI(
    title: string,
    content: string,
    categories: string[]
  ): Promise<string | null> {
    try {
      const prompt = `
다음 글에 가장 적합한 카테고리를 선택하세요.

제목: ${title}

내용 요약: ${content.substring(0, 500)}...

카테고리 목록:
${categories.map((cat, index) => `${index + 1}. ${cat}`).join("\n")}

카테고리 이름만 출력하세요.
`;

      const settings = store.get("settings");
      let response = "";

      if (settings.aiProvider === "openrouter") {
        const apiKey = settings.openrouterApiKey;
        const modelName =
          settings.aiModel || "meta-llama/llama-3.2-3b-instruct:free";

        const apiResponse = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://autostory-ai-writer.local",
              "X-Title": "AutoStory AI Writer",
            },
            body: JSON.stringify({
              model: modelName,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
              max_tokens: 50,
            }),
          }
        );

        if (apiResponse.ok) {
          const data = await apiResponse.json();
          response = data.choices[0]?.message?.content || "";
        }
      } else {
        const genAI = new GoogleGenerativeAI(settings.aiApiKey);
        const model = genAI.getGenerativeModel({
          model: settings.aiModel || "gemini-2.5-flash",
        });
        const result = await model.generateContent(prompt);
        response = result.response.text();
      }

      const cleaned = response.trim();

      const matched = categories.find(
        (cat) => cat.toLowerCase() === cleaned.toLowerCase()
      );
      return matched || categories[0] || null;
    } catch (e) {
      logger.error(`AI category selection failed: ${e}`);
      return categories[0] || null;
    }
  }

  /**
   * [개선] AI를 사용하여 가장 적합한 홈주제 선택
   *
   * 1. 로컬 AI 또는 클라우드 AI를 통해 본문 분석
   * 2. 키워드 기반 매칭으로 fallback
   * 3. 최종 fallback으로 IT 인터넷 선택
   *
   * @param title - 글 제목
   * @param content - 글 본문 (HTML 태그 제거된 텍스트 권장)
   * @param themes - 선택 가능한 홈주제 목록
   * @returns 가장 적합한 홈주제명 또는 null
   */
  private async selectBestThemeWithAI(
    title: string,
    content: string,
    themes: string[]
  ): Promise<string | null> {
    try {
      // 콘텐츠가 너무 길면 앞부분만 사용 (토큰 절약)
      const truncatedContent = content.substring(0, 1500);

      const prompt = `
다음 블로그 글에 가장 적합한 홈주제를 선택해주세요.

[제목]
${title}

[본문 일부]
${truncatedContent}...

[선택 가능한 홈주제 목록]
${themes.map((theme, index) => `${index + 1}. ${theme}`).join("\n")}

위 홈주제 중에서 본문 내용과 가장 관련성이 높은 것을 하나만 선택하세요.
반드시 목록에 있는 홈주제 이름만 정확히 출력하세요.
다른 설명이나 번호 없이 홈주제 이름만 출력하세요.

예시 출력: - IT 인터넷
`;

      const settings = store.get("settings");
      let response = "";

      // 로컬 AI 사용 시 키워드 기반 매칭으로 처리
      if (settings.aiProvider === "local") {
        logger.info("로컬 AI - 키워드 기반 홈주제 매칭 시도");
        return this.matchThemeByKeywords(title, truncatedContent, themes);
      }

      // OpenRouter 사용
      if (settings.aiProvider === "openrouter") {
        const apiKey = settings.openrouterApiKey;
        const modelName = settings.aiModel || "xiaomi/mimo-v2-flash:free";

        const apiResponse = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://autostory-ai-writer.local",
              "X-Title": "AutoStory AI Writer",
            },
            body: JSON.stringify({
              model: modelName,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
              max_tokens: 100,
            }),
          }
        );

        if (apiResponse.ok) {
          const data = await apiResponse.json();
          response = data.choices[0]?.message?.content || "";
        } else {
          logger.warn(`OpenRouter API 오류: ${apiResponse.status}`);
          return this.matchThemeByKeywords(title, truncatedContent, themes);
        }
      } else {
        // Gemini 사용
        const genAI = new GoogleGenerativeAI(settings.aiApiKey);
        const model = genAI.getGenerativeModel({
          model: settings.aiModel || "gemini-2.5-flash",
        });
        const result = await model.generateContent(prompt);
        response = result.response.text();
      }

      // 응답 정제
      const cleaned = response
        .trim()
        .replace(/^\d+\.\s*/, "") // 번호 제거
        .replace(/^["']|["']$/g, "") // 따옴표 제거
        .replace(/\n/g, "") // 줄바꿈 제거
        .trim();

      logger.info(`AI 응답 원본: "${response}"`);
      logger.info(`AI 응답 정제: "${cleaned}"`);

      // 정확히 일치하는 주제 찾기
      let matched = themes.find(
        (theme) => theme.toLowerCase() === cleaned.toLowerCase()
      );

      if (matched) {
        logger.info(`AI 홈주제 정확 일치: "${matched}"`);
        return matched;
      }

      // 포함 관계로 매칭 시도
      matched = themes.find(
        (theme) =>
          theme.toLowerCase().includes(cleaned.toLowerCase()) ||
          cleaned
            .toLowerCase()
            .includes(theme.replace(/^-\s*/, "").toLowerCase())
      );

      if (matched) {
        logger.info(`AI 홈주제 포함 매칭: "${matched}"`);
        return matched;
      }

      // AI 매칭 실패 시 키워드 기반 fallback
      logger.warn("AI 홈주제 매칭 실패, 키워드 기반 fallback");
      return this.matchThemeByKeywords(title, truncatedContent, themes);
    } catch (e: any) {
      logger.error(`AI 홈주제 선택 실패: ${e.message}`);
      // 에러 시 키워드 기반 fallback
      return this.matchThemeByKeywords(
        title,
        content.substring(0, 1000),
        themes
      );
    }
  }

  /**
   * 키워드 기반으로 가장 적합한 홈주제를 매칭
   *
   * HOME_TOPIC_KEYWORDS 매핑 테이블을 사용하여
   * 제목과 본문에서 키워드를 추출하고 홈주제와 매칭합니다.
   *
   * @param title - 글 제목
   * @param content - 글 본문
   * @param availableThemes - 선택 가능한 홈주제 목록
   * @returns 매칭된 홈주제명 또는 기본값
   */
  private matchThemeByKeywords(
    title: string,
    content: string,
    availableThemes: string[]
  ): string {
    const fullText = `${title} ${content}`.toLowerCase();

    // 각 홈주제별 매칭 점수 계산
    const scores: Map<string, number> = new Map();

    for (const [themeKey, keywords] of Object.entries(HOME_TOPIC_KEYWORDS)) {
      // 키에서 불필요한 접두어 제거 ('- ' 등)
      const cleanKey = themeKey.replace(/^-\s*/, "").trim();

      // UI에서 수집된 주제들 중 매칭되는 것이 있는지 확인 (유연한 매칭)
      const matchedTheme = availableThemes.find((t) => {
        const cleanTheme = t.replace(/^-\s*/, "").trim();
        return cleanTheme === cleanKey || cleanTheme.includes(cleanKey);
      });

      if (!matchedTheme) {
        continue;
      }

      let score = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(keyword.toLowerCase(), "gi");
        const matches = fullText.match(regex);
        if (matches) {
          score += matches.length;
        }
      }

      if (score > 0) {
        // 점수는 실제 UI에 있는 테마 이름으로 저장 (누적)
        const currentScore = scores.get(matchedTheme) || 0;
        scores.set(matchedTheme, currentScore + score);
      }
    }

    // 점수가 가장 높은 홈주제 선택
    if (scores.size > 0) {
      const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
      const bestMatch = sorted[0];
      logger.info(
        `키워드 매칭 결과: "${bestMatch[0]}" (점수: ${bestMatch[1]})`
      );
      return bestMatch[0];
    }

    // 매칭 실패 시 첫 번째 항목 반환 (IT 인터넷 강제 fallback 제거)
    logger.info(`키워드 매칭 실패, 첫 번째 항목 사용: "${availableThemes[0]}"`);
    return availableThemes[0];
  }

  public async fetchRelevantImage(keyword: string): Promise<string | null> {
    const settings = store.get("settings");
    const pexelsKey = settings.pexelsApiKey;

    if (!pexelsKey) {
      logger.warn("Pexels API Key 없음. 이미지 검색 스킵.");
      sendLogToRenderer(
        this.mainWindow,
        "⚠ Pexels API Key 없음. 이미지 검색 스킵."
      );
      return null;
    }

    try {
      sendLogToRenderer(this.mainWindow, `→ Pexels API 검색: "${keyword}"`);

      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(
          keyword
        )}&per_page=1&locale=ko-KR`,
        {
          headers: {
            Authorization: pexelsKey,
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`Pexels API Error: ${response.status} - ${errText}`);
        return null;
      }

      const data = await response.json();

      if (data.photos && data.photos.length > 0) {
        const imageUrl =
          data.photos[0].src.landscape || data.photos[0].src.large;
        sendLogToRenderer(this.mainWindow, `이미지 검색 성공`);
        return imageUrl;
      } else {
        logger.warn(`이미지 없음: ${keyword}`);
        return null;
      }
    } catch (e) {
      logger.warn(`Pexels API 오류: ${e}`);
      return null;
    }
  }

  public async scrapeGoogleImages(keyword: string): Promise<string[]> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.initBrowser();
    }
    if (!this.browser) return [];

    let page: Page | null = null;
    const imageUrls: string[] = [];

    try {
      sendLogToRenderer(this.mainWindow, `→ Google 이미지 검색: "${keyword}"`);

      page = await this.browser.newPage();

      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
      });

      const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
        keyword
      )}`;

      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // 쿠키 동의 팝업 처리 (유럽 등 국가에 따라 발생 가능)
      try {
        const consentButton = page.locator(
          "button:has-text('Accept all'), button:has-text('Agree'), button:has-text('동의'), button:has-text('수락')"
        );
        if (await consentButton.isVisible({ timeout: 3000 })) {
          await consentButton.click();
          logger.info("Google 쿠키 동의 단추 클릭됨");
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // 팝업 없음 시 무시
      }

      // 검색 결과 로딩 대기
      await page.waitForSelector("img", { timeout: 10000 }).catch(() => {
        logger.warn("이미지 태그가 로드되지 않았습니다.");
      });

      // 추가 로딩을 위한 살짝 스크롤
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);

      const results = await page.evaluate(() => {
        const urls: string[] = [];

        const anchors = document.querySelectorAll('a[href*="/imgres?"]');

        anchors.forEach((anchor) => {
          const href = anchor.getAttribute("href");
          if (href) {
            const match = href.match(/imgurl=([^&]+)/);
            if (match && match[1]) {
              try {
                const decodedUrl = decodeURIComponent(match[1]);
                if (
                  decodedUrl.startsWith("http") &&
                  !decodedUrl.includes("gstatic.com") &&
                  !decodedUrl.includes("google.com")
                ) {
                  urls.push(decodedUrl);
                }
              } catch (e) {}
            }
          }
        });

        if (urls.length < 10) {
          const imgElements = document.querySelectorAll(
            "img[data-src], img[data-iurl], img.rg_i"
          );

          imgElements.forEach((img) => {
            const dataSrc = img.getAttribute("data-src");
            const dataIurl = img.getAttribute("data-iurl");
            const src = img.getAttribute("src");

            const candidateUrl = dataIurl || dataSrc || src;

            if (
              candidateUrl &&
              candidateUrl.startsWith("http") &&
              !candidateUrl.includes("gstatic.com") &&
              !candidateUrl.includes("google.com") &&
              !candidateUrl.includes("base64") &&
              !urls.includes(candidateUrl)
            ) {
              urls.push(candidateUrl);
            }
          });
        }

        if (urls.length < 10) {
          const scripts = document.querySelectorAll("script");
          scripts.forEach((script) => {
            const content = script.textContent || "";
            const matches = content.match(
              /\["(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi
            );
            if (matches) {
              matches.forEach((match) => {
                try {
                  const url = match.replace(/^\["/, "").replace(/"$/, "");
                  const cleanUrl = url
                    .replace(/\\u003d/g, "=")
                    .replace(/\\u0026/g, "&");
                  if (
                    !cleanUrl.includes("gstatic.com") &&
                    !cleanUrl.includes("google.com") &&
                    !urls.includes(cleanUrl)
                  ) {
                    urls.push(cleanUrl);
                  }
                } catch (e) {}
              });
            }
          });
        }

        const uniqueUrls = [...new Set(urls)];
        return uniqueUrls.slice(0, 10);
      });

      imageUrls.push(...results);

      logger.info(`Google 이미지 결과: ${imageUrls.length} 개`);

      imageUrls.forEach((url, idx) => {
        logger.info(`  이미지 ${idx + 1}. ${url.substring(0, 80)}...`);
      });

      return imageUrls;
    } catch (error: any) {
      logger.error(`Google 이미지 검색 오류: ${error.message}`);
      return [];
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  public async fetchImageFromGoogle(
    keyword: string,
    excludeUrls: Set<string>
  ): Promise<string | null> {
    const imageUrls = await this.scrapeGoogleImages(keyword);

    for (const url of imageUrls) {
      if (!excludeUrls.has(url) && this.isValidImageUrl(url)) {
        return url;
      }
    }

    return imageUrls.length > 0 ? imageUrls[0] : null;
  }

  private async extractImageFromGoogle(
    page: Page,
    excludeUrls: Set<string>
  ): Promise<string | null> {
    const thumbnailSelectors = [
      "img.rg_i",
      "img.Q4LuWd",
      "g-img img",
      "[data-src]",
    ];

    let thumbnails: any[] = [];

    for (const selector of thumbnailSelectors) {
      try {
        thumbnails = await page.$$(selector);
        if (thumbnails.length > 0) {
          logger.info(`썸네일 매칭: ${selector} (${thumbnails.length})`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (thumbnails.length === 0) {
      return null;
    }

    const tryLimit = Math.min(thumbnails.length, 8);

    for (let i = 0; i < tryLimit; i++) {
      try {
        const thumbnail = thumbnails[i];

        await thumbnail.click();
        await page.waitForTimeout(1500);

        const imageUrl = await page.evaluate(() => {
          const sideImages = document.querySelectorAll('img[src^="http"]');

          for (const img of sideImages) {
            const htmlImg = img as HTMLImageElement;
            const src = htmlImg.src;

            const isExternal =
              !src.includes("gstatic.com") &&
              !src.includes("google.com") &&
              !src.includes("base64") &&
              !src.includes("encrypted");

            const isBigEnough =
              htmlImg.naturalWidth > 200 || htmlImg.width > 200;

            if (isExternal && isBigEnough) {
              return src;
            }
          }

          const imgWithDataUrl = document.querySelector("[data-iurl]");
          if (imgWithDataUrl) {
            return imgWithDataUrl.getAttribute("data-iurl");
          }

          const links = document.querySelectorAll('a[href*="imgurl="]');
          for (const link of links) {
            const href = link.getAttribute("href");
            if (href) {
              const match = href.match(/imgurl=([^&]+)/);
              if (match) {
                return decodeURIComponent(match[1]);
              }
            }
          }

          return null;
        });

        if (imageUrl) {
          if (this.isValidImageUrl(imageUrl) && !excludeUrls.has(imageUrl)) {
            return imageUrl;
          }
          logger.info(
            `이미지 스킵 (필터 미통과): ${imageUrl.substring(0, 50)}`
          );
        }
      } catch (innerError) {
        continue;
      }
    }

    return null;
  }

  private async extractThumbnailFromGoogle(
    page: Page,
    excludeUrls: Set<string>
  ): Promise<string | null> {
    try {
      const imageUrls = await page.evaluate(() => {
        const results: string[] = [];
        const images = document.querySelectorAll("img");

        for (const img of images) {
          const dataSrc = img.getAttribute("data-src");
          if (dataSrc && dataSrc.startsWith("http")) {
            results.push(dataSrc);
            continue;
          }

          const src = img.src;
          if (
            src &&
            src.startsWith("http") &&
            !src.includes("gstatic") &&
            !src.includes("google.com/images")
          ) {
            results.push(src);
          }
        }

        return results;
      });

      for (const url of imageUrls) {
        if (this.isValidImageUrl(url) && !excludeUrls.has(url)) {
          return url;
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  private isValidImageUrl(url: string): boolean {
    if (!url || url.length < 10) return false;

    const excludePatterns = [
      "gstatic.com",
      "google.com",
      "googleusercontent.com",
      "base64",
      "svg",
      "gif",
      "favicon",
      "logo",
      "icon",
      "1x1",
      "pixel",
    ];

    const lowerUrl = url.toLowerCase();

    for (const pattern of excludePatterns) {
      if (lowerUrl.includes(pattern)) {
        return false;
      }
    }

    const validExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    const hasValidExtension = validExtensions.some((ext) =>
      lowerUrl.includes(ext)
    );

    return true;
  }

  private async fetchImageFromUnsplash(
    keyword: string,
    apiKey: string
  ): Promise<string | null> {
    try {
      sendLogToRenderer(this.mainWindow, `→ Unsplash API 검색: ${keyword}`);

      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
          keyword
        )}&per_page=1&orientation=landscape`,
        {
          headers: {
            Authorization: `Client-ID ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        logger.warn(`Unsplash API Error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const imageUrl = data.results[0].urls.regular;
        logger.info(`Unsplash 이미지: ${imageUrl}`);
        return imageUrl;
      }

      return null;
    } catch (e) {
      logger.error(`Unsplash Fetch Error: ${e}`);
      return null;
    }
  }

  /**
   * [신규] URL에서 본문 추출 (스크래핑)
   * YouTube 링크인 경우 자막 -> 메타 태그 -> 설명란 순으로 시도합니다.
   */
  public async fetchPageContent(
    url: string
  ): Promise<{ title: string; content: string }> {
    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
    let transcriptText = "";

    // 1. 자막 추출 시도 (가장 품질이 좋음)
    if (isYouTube) {
      try {
        sendLogToRenderer(this.mainWindow, "YouTube 자막 추출 시도 중...");
        const transcriptItems = await YoutubeTranscript.fetchTranscript(url);

        transcriptText = transcriptItems
          .map((t) => t.text)
          .join(" ")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .trim();

        if (transcriptText.length > 50) {
          logger.info(`자막 추출 성공 (${transcriptText.length}자)`);
        } else {
          logger.warn("자막이 너무 짧습니다. 스크래핑으로 전환합니다.");
          transcriptText = "";
        }
      } catch (e) {
        logger.warn(`자막 추출 실패: ${e}`);
        sendLogToRenderer(
          this.mainWindow,
          "자막을 가져올 수 없어 영상 정보를 추출합니다."
        );
      }
    }

    // 2. Playwright 브라우저 준비
    if (!this.browser || !this.browser.isConnected()) {
      await this.initBrowser();
    }

    let page: Page | null = null;

    try {
      sendLogToRenderer(this.mainWindow, `🔗 페이지 분석 중: ${url}`);
      page = await this.browser!.newPage();

      // YouTube는 무거운 페이지이므로 domcontentloaded 후 약간의 대기
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // 제목 추출
      const title = await page.title();
      const cleanTitle = title.replace(" - YouTube", "").trim();

      if (isYouTube && transcriptText) {
        return { title: cleanTitle, content: transcriptText };
      }

      // 3. 본문/설명 추출
      let content = "";

      if (isYouTube) {
        // [전략 A] 메타 태그 우선 확인 (가장 빠르고 안정적)
        const metaDescription = await page.evaluate(() => {
          const meta =
            document.querySelector('meta[name="description"]') ||
            document.querySelector('meta[property="og:description"]');
          return meta ? meta.getAttribute("content") : "";
        });

        if (metaDescription && metaDescription.length > 50) {
          logger.info(`메타 태그 설명 추출 성공 (${metaDescription.length}자)`);
          return { title: cleanTitle, content: metaDescription };
        }

        // [전략 B] 화면 내 설명란 추출
        try {
          // 설명란 컨테이너 대기
          try {
            await page.waitForSelector("#description-inner", { timeout: 3000 });
          } catch {}

          // 더보기 버튼 클릭 시도
          const expandSelectors = ["#expand", "#expand-sizer"];
          for (const sel of expandSelectors) {
            if (await page.$(sel)) {
              await page.click(sel).catch(() => {});
              await page.waitForTimeout(300);
              break;
            }
          }

          content = await page.evaluate(() => {
            const selectors = [
              "#description-inline-expander .ytd-text-inline-expander",
              "#description-inner",
              "#description",
              "ytd-video-secondary-info-renderer",
            ];

            for (const sel of selectors) {
              const el = document.querySelector(sel);
              const text = (el as HTMLElement)?.innerText?.trim();
              if (text && text.length > 0) return text;
            }
            return "";
          });
        } catch (e) {
          logger.warn(`YouTube UI 스크래핑 오류: ${e}`);
        }
      } else {
        // 일반 웹페이지 스크래핑
        content = await page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          const removeTargets = [
            "nav",
            "header",
            "footer",
            "aside",
            "script",
            "style",
            ".ad",
            ".ads",
            ".sidebar",
            "#comments",
            "iframe",
            "noscript",
          ];

          removeTargets.forEach((sel) => {
            clone.querySelectorAll(sel).forEach((el) => el.remove());
          });

          // Readability 알고리즘 흉내: 텍스트가 많은 요소 찾기
          const candidates = [
            "article",
            "main",
            ".post-content",
            ".entry-content",
            "#content",
            ".content",
          ];
          for (const sel of candidates) {
            const el = clone.querySelector(sel);
            if (el && (el as HTMLElement).innerText.trim().length > 100) {
              return (el as HTMLElement).innerText;
            }
          }
          return clone.innerText;
        });
      }

      // 최종 검증
      if (!content || content.trim().length < 30) {
        // 메타 태그라도 다시 시도 (일반 페이지용)
        const fallbackMeta = await page.evaluate(
          () =>
            document
              .querySelector('meta[name="description"]')
              ?.getAttribute("content") || ""
        );

        if (fallbackMeta) {
          logger.info("본문 추출 실패로 메타 설명 사용");
          return { title: cleanTitle, content: fallbackMeta };
        }

        throw new Error("유효한 본문 내용을 추출할 수 없습니다. (내용 부족)");
      }

      return { title: cleanTitle, content: content.trim() };
    } catch (error: any) {
      logger.error(`스크래핑 최종 실패 (${url}): ${error.message}`);
      throw error;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /**
   * [신규] 클립보드 완전 초기화
   * 모든 형식(text, html, image)의 클립보드 데이터를 제거합니다.
   */
  private async clearClipboardCompletely(page: Page): Promise<void> {
    await page.evaluate(async () => {
      try {
        // 방법 1: Clipboard API를 사용한 초기화
        if (navigator.clipboard && navigator.clipboard.write) {
          // 빈 텍스트로 클립보드 덮어쓰기
          const emptyBlob = new Blob([""], { type: "text/plain" });
          const clipboardItem = new ClipboardItem({
            "text/plain": emptyBlob,
          });
          await navigator.clipboard.write([clipboardItem]);
        }

        // 방법 2: 레거시 execCommand 초기화
        const tempInput = document.createElement("textarea");
        tempInput.value = "";
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
      } catch (e) {
        console.warn("클립보드 초기화 경고:", e);
      }
    });

    // 초기화 완료 대기
    await page.waitForTimeout(100);
  }

  /**
   * [개선] HTML 콘텐츠를 렌더링하여 클립보드에 복사
   * 클립보드 우선순위를 보장하고 복사 검증을 강화합니다.
   */
  private async copyRenderedHtmlToClipboard(
    htmlContent: string,
    modifier: string
  ): Promise<ClipboardCopyResult> {
    if (!this.context) {
      await this.initBrowser();
    }

    const renderPage = await this.context!.newPage();

    try {
      sendLogToRenderer(this.mainWindow, "클립보드 초기화 중...");

      // 1. 클립보드 완전 초기화 (기존 내용 제거)
      await this.clearClipboardCompletely(renderPage);

      // 2. HTML 콘텐츠 로드
      await renderPage.setContent(htmlContent, { waitUntil: "load" });
      await renderPage.waitForLoadState("networkidle");
      await renderPage.waitForTimeout(1000);

      // 3. 콘텐츠 유효성 검증
      const bodyContent = await renderPage.evaluate(() => {
        return {
          innerHTML: document.body.innerHTML,
          innerText: document.body.innerText,
          length: document.body.innerHTML.length,
        };
      });

      if (bodyContent.length < 100) {
        throw new Error("렌더링된 콘텐츠가 너무 짧습니다");
      }

      sendLogToRenderer(
        this.mainWindow,
        `렌더링된 콘텐츠 크기: ${bodyContent.length}자`
      );

      // 4. 전체 콘텐츠 선택
      await renderPage.evaluate(() => {
        const selection = window.getSelection();
        selection?.removeAllRanges();

        const range = document.createRange();
        range.selectNodeContents(document.body);
        selection?.addRange(range);
      });

      // 5. 선택 영역 검증
      const selectionInfo = await renderPage.evaluate(() => {
        const selection = window.getSelection();
        return {
          length: selection?.toString().length || 0,
          rangeCount: selection?.rangeCount || 0,
        };
      });

      if (selectionInfo.length < 100) {
        throw new Error("콘텐츠 선택 영역이 너무 작습니다");
      }

      logger.info(
        `선택된 콘텐츠: ${selectionInfo.length}자, ${selectionInfo.rangeCount}개 범위`
      );

      // 6. 복사 실행
      await renderPage.keyboard.press(`${modifier}+c`);
      await renderPage.waitForTimeout(500);

      // 7. 복사 검증 (클립보드 읽기)
      let verificationPassed = false;
      try {
        const clipboardText = await renderPage.evaluate(async () => {
          try {
            const text = await navigator.clipboard.readText();
            return text;
          } catch (e) {
            return null;
          }
        });

        if (clipboardText && clipboardText.length > 50) {
          verificationPassed = true;
          logger.info(`클립보드 검증 성공: ${clipboardText.length}자`);
        }
      } catch (verifyError) {
        logger.debug("클립보드 읽기 검증 실패 (권한 문제일 수 있음)");
        // 검증 실패해도 복사는 성공했을 수 있으므로 계속 진행
        verificationPassed = true; // 선택 영역이 유효했으므로 신뢰
      }

      // 8. 선택 해제
      await renderPage.evaluate(() => {
        window.getSelection()?.removeAllRanges();
      });

      sendLogToRenderer(
        this.mainWindow,
        `클립보드 복사 완료 (${selectionInfo.length}자)`
      );

      return {
        success: true,
        contentLength: selectionInfo.length,
      };
    } catch (error: any) {
      logger.error(`클립보드 복사 실패: ${error.message}`);
      return {
        success: false,
        contentLength: 0,
        error: error.message,
      };
    } finally {
      await renderPage.close();
    }
  }

  /**
   * [개선된] WYSIWYG 에디터에 HTML 콘텐츠 삽입
   * TinyMCE API, HTML 모드, 클립보드 등 다양한 방식 시도
   *
   * @param page - Playwright Page 인스턴스
   * @param htmlContent - 삽입할 HTML 콘텐츠
   * @param modifier - 플랫폼별 수정자 키 (Meta/Control)
   */
  private async insertContentToEditor(
    page: Page,
    htmlContent: string,
    modifier: string
  ): Promise<void> {
    const MAX_RETRY_COUNT = 3;
    let lastError: Error | null = null;

    sendLogToRenderer(this.mainWindow, "에디터 준비 확인 중...");

    // 에디터 준비 대기
    const editorReady = await page
      .waitForFunction(
        () => {
          const iframe = document.querySelector(
            "#editor-tistory_ifr"
          ) as HTMLIFrameElement;
          if (!iframe || !iframe.contentDocument) return false;
          const body = iframe.contentDocument.body;
          if (!body) return false;
          const win = window as any;
          const tinymceReady = win.tinymce?.activeEditor?.initialized === true;
          const editableReady = body.getAttribute("contenteditable") === "true";
          return tinymceReady || editableReady;
        },
        { timeout: 15000 }
      )
      .catch(() => false);

    if (!editorReady) {
      logger.warn("에디터 준비 안됨, 계속 진행...");
    }

    await this.debugEditorState(page);

    // ============================================================
    // 방법 1: TinyMCE setContent API (format: 'raw')
    // ============================================================
    try {
      sendLogToRenderer(
        this.mainWindow,
        "[1/4] TinyMCE setContent API 시도..."
      );

      const success = await page.evaluate((content: string) => {
        try {
          const win = window as any;

          if (win.tinymce) {
            const editor =
              win.tinymce.activeEditor || win.tinymce.get("editor-tistory");
            if (editor && editor.initialized) {
              // format: 'raw'로 HTML 필터링 방지
              editor.setContent(content, { format: "raw" });
              editor.fire("change");
              editor.fire("input");
              editor.save();
              console.log("TinyMCE setContent(raw) 성공");
              return true;
            }
          }

          if (
            win.editorTistory &&
            typeof win.editorTistory.setContent === "function"
          ) {
            win.editorTistory.setContent(content);
            return true;
          }

          return false;
        } catch (e) {
          console.error("TinyMCE API error:", e);
          return false;
        }
      }, htmlContent);

      if (success) {
        const verified = await this.verifyEditorContent(page, 100);
        if (verified.success && verified.hasProperStructure) {
          sendLogToRenderer(this.mainWindow, "✅ TinyMCE API 방식 성공!");
          return;
        }
        logger.warn("TinyMCE 삽입은 됐으나 구조 검증 실패, 다른 방법 시도...");
      }
    } catch (e: any) {
      lastError = e;
      logger.warn(`TinyMCE API 실패: ${e.message}`);
    }

    // ============================================================
    // 방법 2: HTML 모드로 전환하여 직접 삽입 (NEW)
    // ============================================================
    try {
      sendLogToRenderer(this.mainWindow, "[2/4] HTML 모드 직접 삽입 시도...");

      const htmlModeSuccess = await this.insertViaHtmlMode(
        page,
        htmlContent,
        modifier
      );

      if (htmlModeSuccess) {
        const verified = await this.verifyEditorContent(page, 100);
        if (verified.success) {
          sendLogToRenderer(this.mainWindow, "✅ HTML 모드 삽입 성공!");
          return;
        }
      }
    } catch (e: any) {
      lastError = e;
      logger.warn(`HTML 모드 삽입 실패: ${e.message}`);
    }

    // ============================================================
    // 방법 3: iframe innerHTML 직접 설정
    // ============================================================
    try {
      sendLogToRenderer(
        this.mainWindow,
        "[3/4] iframe innerHTML 직접 설정 시도..."
      );

      const frame = page.frameLocator("#editor-tistory_ifr");
      const bodyLocator = frame.locator("body").first();

      await bodyLocator.evaluate((body: HTMLElement, content: string) => {
        body.innerHTML = content;
        body.dispatchEvent(new Event("input", { bubbles: true }));
        body.dispatchEvent(new Event("change", { bubbles: true }));
      }, htmlContent);

      await page.waitForTimeout(1000);

      const verified = await this.verifyEditorContent(page, 100);
      if (verified.success) {
        sendLogToRenderer(this.mainWindow, "✅ innerHTML 직접 설정 성공!");
        return;
      }
    } catch (e: any) {
      lastError = e;
      logger.warn(`innerHTML 설정 실패: ${e.message}`);
    }

    // ============================================================
    // 방법 4: 클립보드 복사/붙여넣기 (HTML MIME 타입)
    // ============================================================
    for (let retry = 0; retry < MAX_RETRY_COUNT; retry++) {
      try {
        sendLogToRenderer(
          this.mainWindow,
          `[4/4] 클립보드 방식 시도 ${retry + 1}/${MAX_RETRY_COUNT}...`
        );

        // HTML을 렌더링할 임시 페이지 생성
        const renderPage = await this.context!.newPage();

        try {
          // HTML 콘텐츠를 페이지에 로드
          await renderPage.setContent(
            `<html><body>${htmlContent}</body></html>`,
            { waitUntil: "load" }
          );
          await renderPage.waitForTimeout(500);

          // [NEW] text/html MIME 타입으로 클립보드에 복사
          await renderPage.evaluate(async (content) => {
            try {
              // ClipboardItem을 사용하여 HTML로 복사
              const htmlBlob = new Blob([content], { type: "text/html" });
              const textBlob = new Blob([content], { type: "text/plain" });
              const clipboardItem = new ClipboardItem({
                "text/html": htmlBlob,
                "text/plain": textBlob,
              });
              await navigator.clipboard.write([clipboardItem]);
              console.log("HTML 클립보드 복사 성공");
            } catch (e) {
              // fallback: 전통적인 방식
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(document.body);
              selection?.removeAllRanges();
              selection?.addRange(range);
              document.execCommand("copy");
            }
          }, htmlContent);

          await renderPage.waitForTimeout(300);
        } finally {
          await renderPage.close();
        }

        // 에디터에 붙여넣기
        const frame = page.frameLocator("#editor-tistory_ifr");
        const editorBody = frame.locator("body").first();

        await editorBody.click();
        await page.waitForTimeout(200);
        await page.keyboard.press(`${modifier}+a`);
        await page.keyboard.press("Delete");
        await page.waitForTimeout(200);
        await page.keyboard.press(`${modifier}+v`);
        await page.waitForTimeout(2000);

        const verified = await this.verifyEditorContent(page, 100);
        if (verified.success) {
          sendLogToRenderer(
            this.mainWindow,
            `✅ 클립보드 방식 성공 (시도 ${retry + 1})`
          );
          return;
        }

        logger.warn(`클립보드 시도 ${retry + 1} 실패, 재시도...`);
      } catch (e: any) {
        lastError = e;
        logger.warn(`클립보드 시도 ${retry + 1} 오류: ${e.message}`);
      }
    }

    throw new Error(
      `모든 콘텐츠 삽입 방법 실패: ${lastError?.message || "알 수 없는 오류"}`
    );
  }

  /**
   * [NEW] HTML 모드로 전환하여 콘텐츠 삽입
   */
  private async insertViaHtmlMode(
    page: Page,
    htmlContent: string,
    modifier: string
  ): Promise<boolean> {
    try {
      // 에디터 모드 버튼 찾기
      const modeBtn = await page.$(TISTORY_SELECTORS.EDITOR_MODE.MODE_BUTTON);
      if (!modeBtn) {
        logger.warn("에디터 모드 버튼을 찾을 수 없음");
        return false;
      }

      // 모드 선택 레이어 열기
      await modeBtn.click();
      await page.waitForTimeout(500);

      // HTML 모드 선택
      const htmlModeBtn = await page.$(TISTORY_SELECTORS.EDITOR_MODE.HTML_MODE);
      if (!htmlModeBtn) {
        logger.warn("HTML 모드 버튼을 찾을 수 없음");
        // 레이어 닫기
        await page.keyboard.press("Escape");
        return false;
      }

      await htmlModeBtn.click();
      await page.waitForTimeout(1000);

      // CodeMirror 에디터 찾기
      const codeMirror = await page.$(TISTORY_SELECTORS.EDITOR_MODE.CODEMIRROR);
      if (!codeMirror) {
        // HTML 컨테이너에서 textarea 찾기
        const htmlContainer = await page.$(
          TISTORY_SELECTORS.EDITOR_MODE.HTML_CONTAINER
        );
        if (htmlContainer) {
          const textarea = await htmlContainer.$("textarea");
          if (textarea) {
            await textarea.click();
            await page.keyboard.press(`${modifier}+a`);
            await page.keyboard.type(htmlContent, { delay: 0 });
          }
        }
      } else {
        // CodeMirror에 직접 입력
        await codeMirror.click();
        await page.waitForTimeout(200);

        // CodeMirror의 setValue 메서드 사용
        await page.evaluate((content) => {
          const cm = (document.querySelector(".CodeMirror") as any)?.CodeMirror;
          if (cm) {
            cm.setValue(content);
          }
        }, htmlContent);
      }

      await page.waitForTimeout(500);

      // 다시 기본 모드(WYSIWYG)로 전환
      await modeBtn.click();
      await page.waitForTimeout(500);

      const basicModeBtn = await page.$(
        TISTORY_SELECTORS.EDITOR_MODE.BASIC_MODE
      );
      if (basicModeBtn) {
        await basicModeBtn.click();
        await page.waitForTimeout(1000);
      }

      return true;
    } catch (error: any) {
      logger.error(`HTML 모드 삽입 오류: ${error.message}`);
      // 에러 발생 시 ESC로 레이어 닫기
      await page.keyboard.press("Escape");
      return false;
    }
  }

  // [NEW] 디버깅 헬퍼 함수
  private async debugEditorState(page: Page): Promise<void> {
    const state = await page.evaluate(() => {
      const iframe = document.querySelector(
        "#editor-tistory_ifr"
      ) as HTMLIFrameElement;

      return {
        iframeExists: !!iframe,
        contentWindowExists: !!iframe?.contentWindow,
        contentDocumentExists: !!iframe?.contentDocument,
        bodyExists: !!iframe?.contentDocument?.body,
        bodyId: iframe?.contentDocument?.body?.id,
        bodyContentLength:
          iframe?.contentDocument?.body?.innerHTML?.length || 0,
        tinymceExists: !!(window as any).tinymce,
        activeEditorExists: !!(window as any).tinymce?.activeEditor,
        editorInitialized: (window as any).tinymce?.activeEditor?.initialized,
      };
    });

    logger.info(`[DEBUG] 에디터 상태: ${JSON.stringify(state)}`);
    sendLogToRenderer(
      this.mainWindow,
      `[DEBUG] iframe=${state.iframeExists}, body=${state.bodyExists}, tinymce=${state.tinymceExists}, initialized=${state.editorInitialized}`
    );
  }

  /**
   * [개선된] 에디터 콘텐츠 검증
   * 마크다운 문법 감지 및 구조 검증 강화
   */
  private async verifyEditorContent(
    page: Page,
    minExpectedLength: number = 500
  ): Promise<{
    success: boolean;
    reason?: string;
    actualLength?: number;
    hasProperStructure?: boolean;
    hasMarkdown?: boolean;
  }> {
    try {
      const frame = page.frameLocator("#editor-tistory_ifr");
      const content = await frame
        .locator("body#tinymce")
        .evaluate((el: HTMLElement) => ({
          innerHTML: el.innerHTML,
          innerText: el.innerText,
          textLength: el.innerText.trim().length,
          paragraphCount: el.querySelectorAll("p").length,
          h2Count: el.querySelectorAll("h2").length,
          h3Count: el.querySelectorAll("h3").length,
          strongCount: el.querySelectorAll("strong").length,
          tableCount: el.querySelectorAll("table").length,
          imageCount: el.querySelectorAll("img").length,
          divCount: el.querySelectorAll("div").length,
          hasContent: el.innerHTML.length > 100,
        }));

      const totalLength = content.innerHTML.length;
      const textLength = content.textLength;

      // [NEW] 마크다운 문법 감지 (완화됨)
      // 줄 시작 부분의 헤딩(## )이나 테이블(|...|)만 엄격하게 검사
      const hasMarkdown = /^#{1,6}\s|^\|.+\|$/m.test(content.innerText);

      logger.info(
        `검증 결과: HTML=${totalLength}, 텍스트=${textLength}, ` +
          `p=${content.paragraphCount}, h2=${content.h2Count}, h3=${content.h3Count}, ` +
          `strong=${content.strongCount}, table=${content.tableCount}, div=${content.divCount}, ` +
          `마크다운감지=${hasMarkdown}`
      );

      // 구조적 검증: 최소한의 HTML 요소가 있는지
      const hasProperStructure =
        content.paragraphCount >= 2 ||
        content.divCount >= 3 ||
        (content.h2Count >= 1 && content.textLength >= 200);

      // 마크다운 문법이 감지되면 경고
      if (hasMarkdown) {
        // [FIX] 마크다운이 감지되었더라도, HTML 구조가 확실하면(p태그 5개 이상, h2태그 1개 이상) 성공으로 간주
        if (content.paragraphCount >= 5 && content.h2Count >= 1) {
          logger.info(
            "마크다운 문법이 일부 감지되었으나, HTML 구조가 확실하여 통과합니다."
          );
        } else {
          logger.error(
            "⚠️ 마크다운 문법이 감지됨! HTML로 제대로 변환되지 않았습니다."
          );
          return {
            success: false,
            reason: "마크다운 문법이 HTML로 변환되지 않음",
            actualLength: totalLength,
            hasProperStructure: false,
            hasMarkdown: true,
          };
        }
      }

      // 성공 조건: 길이 충족 + 구조 충족
      if (totalLength >= minExpectedLength && hasProperStructure) {
        return {
          success: true,
          actualLength: totalLength,
          hasProperStructure: true,
          hasMarkdown: false,
        };
      }

      // 이미지가 포함된 경우 텍스트 기준 완화
      if (content.imageCount > 0 && textLength >= 100) {
        return {
          success: true,
          actualLength: totalLength,
          hasProperStructure,
          hasMarkdown: false,
        };
      }

      return {
        success: false,
        reason: `콘텐츠 부족 (HTML: ${totalLength}, 텍스트: ${textLength}, p: ${content.paragraphCount})`,
        actualLength: totalLength,
        hasProperStructure,
        hasMarkdown: false,
      };
    } catch (error: any) {
      return {
        success: false,
        reason: error.message,
        hasProperStructure: false,
        hasMarkdown: false,
      };
    }
  }

  /**
   * [개선] 카테고리 선택 - 다층 매칭 알고리즘 적용
   *
   * 매칭 우선순위:
   * 1. 정확 일치 (원본 텍스트)
   * 2. 하이픈 제거 후 정확 일치
   * 3. 포함 관계 검사
   * 4. Fallback: 'Issue' 카테고리
   * 5. 최후 Fallback: 첫 번째 유효 카테고리
   *
   * @param page - Playwright Page 객체
   * @param categoryName - 선택하려는 카테고리명
   */
  private async selectCategory(
    page: Page,
    categoryName: string
  ): Promise<void> {
    try {
      sendLogToRenderer(
        this.mainWindow,
        `카테고리 선택 시작: "${categoryName}"`
      );

      // Step 1: 카테고리 버튼 클릭하여 드롭다운 열기
      const categoryBtn = await page.waitForSelector(
        TISTORY_SELECTORS.CATEGORY.BUTTON,
        { timeout: 5000 }
      );

      if (!categoryBtn) {
        logger.warn("카테고리 버튼을 찾을 수 없습니다.");
        return;
      }

      await categoryBtn.click();
      await page.waitForTimeout(500);

      // Step 2: 카테고리 리스트가 나타날 때까지 대기
      const categoryList = await page.waitForSelector(
        TISTORY_SELECTORS.CATEGORY.LIST_CONTAINER,
        { timeout: 3000 }
      );

      if (!categoryList) {
        logger.warn("카테고리 리스트를 찾을 수 없습니다.");
        return;
      }

      // Step 3: 모든 카테고리 항목 수집
      const categoryItems = await page.$$(TISTORY_SELECTORS.CATEGORY.ITEM);

      if (categoryItems.length === 0) {
        logger.warn("카테고리 항목이 없습니다.");
        return;
      }

      // 카테고리 정보 인터페이스
      interface CategoryInfo {
        element: any;
        text: string;
        cleanText: string;
        categoryId: string;
      }

      const categories: CategoryInfo[] = [];

      for (const item of categoryItems) {
        const text = (await item.innerText()).trim();
        const categoryId = (await item.getAttribute("category-id")) || "";
        const cleanText = text.replace(/^-\s*/, "").trim();

        categories.push({
          element: item,
          text,
          cleanText,
          categoryId,
        });
      }

      logger.info(`발견된 카테고리 수: ${categories.length}`);
      logger.info(`카테고리 목록: ${categories.map((c) => c.text).join(", ")}`);

      // Step 4: 다층 매칭 알고리즘
      let selectedCategory: CategoryInfo | null = null;
      const targetClean = categoryName
        .replace(/^-\s*/, "")
        .trim()
        .toLowerCase();

      // 4-1: 정확 일치 (원본 텍스트)
      selectedCategory =
        categories.find(
          (c) => c.text.toLowerCase() === categoryName.toLowerCase()
        ) || null;

      if (selectedCategory) {
        logger.info(`[매칭 1단계] 정확 일치 발견: "${selectedCategory.text}"`);
      }

      // 4-2: 하이픈 제거 후 정확 일치
      if (!selectedCategory) {
        selectedCategory =
          categories.find((c) => c.cleanText.toLowerCase() === targetClean) ||
          null;

        if (selectedCategory) {
          logger.info(
            `[매칭 2단계] 하이픈 제거 후 일치 발견: "${selectedCategory.text}"`
          );
        }
      }

      // 4-3: 포함 관계 검사 (target이 카테고리명에 포함되거나 그 반대)
      if (!selectedCategory) {
        selectedCategory =
          categories.find(
            (c) =>
              c.cleanText.toLowerCase().includes(targetClean) ||
              targetClean.includes(c.cleanText.toLowerCase())
          ) || null;

        if (selectedCategory) {
          logger.info(
            `[매칭 3단계] 포함 관계로 발견: "${selectedCategory.text}"`
          );
        }
      }

      // 4-4: 언더스코어를 공백으로 변환 후 매칭 (Auto_News -> Auto News)
      if (!selectedCategory) {
        const targetWithSpaces = categoryName.replace(/_/g, " ").toLowerCase();
        selectedCategory =
          categories.find(
            (c) =>
              c.cleanText.toLowerCase().includes(targetWithSpaces) ||
              targetWithSpaces.includes(c.cleanText.toLowerCase())
          ) || null;

        if (selectedCategory) {
          logger.info(
            `[매칭 4단계] 언더스코어 변환 후 발견: "${selectedCategory.text}"`
          );
        }
      }

      // 4-5: Fallback - 'Issue' 카테고리 찾기
      if (!selectedCategory) {
        logger.warn(
          `"${categoryName}" 카테고리를 찾을 수 없어 'Issue'로 fallback 시도`
        );

        selectedCategory =
          categories.find(
            (c) =>
              c.text.toLowerCase() === "issue" ||
              c.cleanText.toLowerCase() === "issue"
          ) || null;

        if (selectedCategory) {
          logger.info(
            `[매칭 5단계] Fallback 'Issue' 카테고리 발견: "${selectedCategory.text}"`
          );
        }
      }

      // 4-6: Issue도 없으면 첫 번째 유효 카테고리 (카테고리 없음 제외)
      if (!selectedCategory) {
        selectedCategory =
          categories.find(
            (c) => c.categoryId !== "0" && c.text !== "카테고리 없음"
          ) || categories[0];

        logger.warn(
          `[매칭 6단계] 모든 fallback 실패, 첫 번째 유효 카테고리 선택: "${selectedCategory?.text}"`
        );
      }

      // Step 5: 선택된 카테고리 클릭
      if (selectedCategory) {
        await selectedCategory.element.click();
        sendLogToRenderer(
          this.mainWindow,
          `카테고리 선택 완료: "${selectedCategory.text}"`
        );
      } else {
        logger.error("카테고리를 선택할 수 없습니다.");
      }

      await page.waitForTimeout(300);
    } catch (e: any) {
      logger.warn(`카테고리 선택 중 오류: ${e.message}`);
      sendLogToRenderer(this.mainWindow, `카테고리 선택 실패: ${e.message}`);
    }
  }

  /**
   * [개선] 홈주제 선택 - AI 분석 기반
   *
   * 본문 내용을 분석하여 가장 적합한 홈주제를 선택합니다.
   * disabled 클래스를 가진 대분류 항목은 제외하고 선택합니다.
   *
   * @param page - Playwright Page 객체
   * @param title - 글 제목
   * @param content - 글 본문 내용
   */
  private async selectHomeTheme(
    page: Page,
    title: string,
    content: string,
    targetTheme?: string
  ): Promise<void> {
    try {
      sendLogToRenderer(this.mainWindow, "홈주제 선택 시작...");

      // Step 1: 홈주제 영역 찾기 (제공된 HTML 구조 기반)
      const homeSubjectSelector = "#home_subject";
      const homeSubject = await page.waitForSelector(homeSubjectSelector, {
        timeout: 5000,
      });
      if (!homeSubject) {
        logger.warn("홈주제 영역(#home_subject)을 찾을 수 없습니다.");
        return;
      }

      // Step 2: 홈주제 버튼 클릭하여 드롭다운 열기
      // .select_btn 클래스를 가진 버튼 찾기
      const selectBtn = await homeSubject.$(".select_btn");
      if (!selectBtn) {
        logger.warn("홈주제 선택 버튼(.select_btn)을 찾을 수 없습니다.");
        return;
      }

      // 버튼 텍스트 확인 (디버깅용)
      const btnText = await selectBtn.innerText();
      logger.info(`현재 선택된 홈주제: ${btnText}`);

      await selectBtn.click();
      await page.waitForTimeout(1000); // 드롭다운 애니메이션 대기

      // Step 3: 드롭다운 메뉴가 나타날 때까지 대기
      // .mce-floatpanel.mce-menu 클래스를 가진 패널 찾기
      // 여러 개가 있을 수 있으므로 가장 마지막에 열린(z-index가 높은) 것을 타겟팅하거나 visible 상태인 것 확인
      const menuPanelSelector = ".mce-floatpanel.mce-menu:visible";
      const menuPanel = await page.waitForSelector(menuPanelSelector, {
        timeout: 5000,
      });

      if (!menuPanel) {
        logger.warn("홈주제 드롭다운 메뉴를 찾을 수 없습니다.");
        return;
      }

      // Step 4: 선택 가능한 홈주제 목록 수집 (disabled 제외)
      // .mce-menu-item 클래스를 가진 항목들 중 disabled 클래스가 없는 것
      const menuItems = await menuPanel.$$(".mce-menu-item:not(.disabled)");

      interface ThemeInfo {
        element: any;
        text: string;
      }

      const availableThemes: ThemeInfo[] = [];

      for (const item of menuItems) {
        try {
          const textElement = await item.$(".mce-text");
          if (textElement) {
            const rawText = await textElement.textContent();
            const text = (rawText || "").trim();

            // "선택 안 함" 제외
            if (text && text !== "선택 안 함") {
              availableThemes.push({
                element: item,
                text: text,
              });
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (availableThemes.length === 0) {
        logger.warn("선택 가능한 홈주제가 없습니다.");
        // 드롭다운 닫기 (ESC)
        await page.keyboard.press("Escape");
        return;
      }

      logger.info(`선택 가능한 홈주제 수: ${availableThemes.length}`);
      // 너무 많을 수 있으니 앞부분만 로그 출력
      logger.info(
        `홈주제 목록(일부): ${availableThemes
          .slice(0, 10)
          .map((t) => t.text)
          .join(", ")}...`
      );

      // Step 5: 홈주제 결정 (사용자 지정 > AI 추천)
      const themeNames = availableThemes.map((t) => t.text);
      let bestTheme: string | null = null;

      if (targetTheme && targetTheme !== "선택 안 함") {
        logger.info(`[홈주제] 사용자 지정 테마 우선 적용: "${targetTheme}"`);
        // 정확히 매칭되거나 포함되는 테마 찾기
        const exactMatch = availableThemes.find((t) => t.text === targetTheme);
        if (exactMatch) {
          bestTheme = exactMatch.text;
        } else {
          // "국내여행" -> "- 국내여행" 같은 경우 처리
          const partialMatch = availableThemes.find((t) =>
            t.text.includes(targetTheme)
          );
          if (partialMatch) {
            bestTheme = partialMatch.text;
          } else {
            logger.warn(
              `[홈주제] 지정된 테마 "${targetTheme}"를 목록에서 찾을 수 없어 AI 추천으로 전환합니다.`
            );
          }
        }
      }

      if (!bestTheme) {
        bestTheme = await this.selectBestThemeWithAI(
          title,
          content,
          themeNames
        );
      }

      logger.info(`AI 추천 홈주제: "${bestTheme}"`);

      // Step 6: 선택된 홈주제 클릭
      // 정확한 텍스트 매칭 시도
      let selectedTheme = availableThemes.find((t) => t.text === bestTheme);

      // AI/키워드 매칭 결과가 없으면 첫 번째 항목
      if (!selectedTheme && availableThemes.length > 0) {
        selectedTheme = availableThemes[0];
        logger.info(
          `최종 Fallback - 첫 번째 항목 선택: "${selectedTheme.text}"`
        );
      }

      if (selectedTheme) {
        // 스크롤이 필요할 수 있으므로 scrollIntoViewIfNeeded 또는 유사 기능 사용
        try {
          await selectedTheme.element.scrollIntoViewIfNeeded();
        } catch {}

        await selectedTheme.element.click();
        sendLogToRenderer(
          this.mainWindow,
          `홈주제 선택 완료: "${selectedTheme.text}"`
        );
      } else {
        logger.warn("홈주제를 선택할 수 없습니다.");
        await page.keyboard.press("Escape");
      }

      await page.waitForTimeout(500);
    } catch (e: any) {
      logger.warn(`홈주제 선택 중 오류: ${e.message}`);
      sendLogToRenderer(this.mainWindow, `홈주제 선택 실패 (기본값 사용)`);
      try {
        await page.keyboard.press("Escape");
      } catch {}
    }
  }

  private async clickCompleteButton(page: Page): Promise<void> {
    try {
      sendLogToRenderer(this.mainWindow, "완료 버튼 클릭 중...");

      const completeBtnSelectors = [
        'button:has-text("완료")',
        ".btn_apply",
        "#btn-publish-layer",
      ];

      for (const selector of completeBtnSelectors) {
        try {
          const btn = await page.waitForSelector(selector, { timeout: 2000 });
          if (btn) {
            await btn.click();
            sendLogToRenderer(
              this.mainWindow,
              "완료 버튼 클릭됨 (발행 레이어 열기)"
            );
            return;
          }
        } catch {}
      }
      logger.warn("완료 버튼을 찾을 수 없습니다.");
    } catch (e) {
      logger.warn(`완료 버튼 클릭 실패: ${e}`);
    }
  }

  private async clickPublishButton(page: Page): Promise<void> {
    try {
      sendLogToRenderer(this.mainWindow, "최종 발행 버튼 클릭 중...");

      const publishBtnSelectors = [
        "#publish-btn",
        'button:has-text("발행")',
        'button:has-text("공개 발행")',
        ".btn_publish",
      ];

      for (const selector of publishBtnSelectors) {
        try {
          const btn = await page.waitForSelector(selector, { timeout: 2000 });
          if (btn) {
            await btn.click();
            sendLogToRenderer(this.mainWindow, "발행 버튼 클릭됨!");
            return;
          }
        } catch {}
      }
      logger.warn("발행 버튼을 찾을 수 없습니다.");
    } catch (e) {
      logger.warn(`발행 버튼 클릭 실패: ${e}`);
    }
  }

  /**
   * [신규] 예약 날짜 설정
   * 티스토리 발행 레이어에서 예약 날짜를 설정합니다.
   */
  private async setReservationDate(
    page: Page,
    reservationDate: Date
  ): Promise<void> {
    try {
      sendLogToRenderer(
        this.mainWindow,
        `예약 날짜 설정 중: ${reservationDate.toLocaleString()}`
      );

      // 티스토리 예약 발행 UI는 보통 라디오 버튼으로 제어됨
      // "예약 발행" 옵션을 선택해야 함
      const reservationSelectors = [
        'input[type="radio"][value="reserve"]',
        'input[name="publish"][value="reserve"]',
        'label:has-text("예약")',
      ];

      let reservationRadio = null;
      for (const selector of reservationSelectors) {
        try {
          reservationRadio = await page.$(selector);
          if (reservationRadio) {
            logger.info(`예약 발행 라디오 발견: ${selector}`);
            break;
          }
        } catch {}
      }

      if (!reservationRadio) {
        logger.warn("예약 발행 옵션을 찾을 수 없습니다. 예약 날짜 설정 스킵.");
        return;
      }

      // 예약 발행 옵션 선택
      await reservationRadio.click();
      await page.waitForTimeout(500);

      // 날짜/시간 입력 필드 찾기
      // 티스토리는 보통 datetime-local 또는 별도의 날짜/시간 필드 사용
      const dateSelectors = [
        'input[type="datetime-local"]',
        'input[name="reservationDate"]',
        'input[name="reserveDate"]',
      ];

      let dateInput = null;
      for (const selector of dateSelectors) {
        try {
          dateInput = await page.$(selector);
          if (dateInput) {
            logger.info(`날짜 입력 필드 발견: ${selector}`);
            break;
          }
        } catch {}
      }

      if (dateInput) {
        // 날짜를 ISO 형식으로 변환 (YYYY-MM-DDTHH:mm)
        const year = reservationDate.getFullYear();
        const month = String(reservationDate.getMonth() + 1).padStart(2, "0");
        const day = String(reservationDate.getDate()).padStart(2, "0");
        const hours = String(reservationDate.getHours()).padStart(2, "0");
        const minutes = String(reservationDate.getMinutes()).padStart(2, "0");

        const isoDate = `${year}-${month}-${day}T${hours}:${minutes}`;

        await dateInput.fill(isoDate);
        await page.waitForTimeout(300);

        logger.info(`예약 날짜 설정 완료: ${isoDate}`);
      } else {
        logger.warn("날짜 입력 필드를 찾을 수 없습니다.");
      }
    } catch (e: any) {
      logger.warn(`예약 날짜 설정 중 오류: ${e.message}`);
      // 오류가 발생해도 계속 진행 (기본 발행으로 대체될 수 있음)
    }
  }

  /**
   * [신규] 예약 발행 버튼 클릭
   */
  private async clickReservationPublishButton(page: Page): Promise<void> {
    try {
      sendLogToRenderer(this.mainWindow, "예약 발행 버튼 클릭 중...");

      const reservationPublishSelectors = [
        'button:has-text("예약 발행")',
        'button:has-text("예약하기")',
        'button:has-text("예약")',
        'button[type="button"].reserve',
        "button.btn_reservation",
      ];

      for (const selector of reservationPublishSelectors) {
        try {
          const btn = await page.waitForSelector(selector, {
            timeout: 2000,
          });
          if (btn) {
            await btn.click();
            sendLogToRenderer(this.mainWindow, "예약 발행 버튼 클릭됨!");
            return;
          }
        } catch {}
      }

      logger.warn("예약 발행 버튼을 찾을 수 없습니다.");
    } catch (e: any) {
      logger.warn(`예약 발행 버튼 클릭 실패: ${e.message}`);
    }
  }

  /**
   * 대체 붙여넣기 방법 (Tab 키 사용)
   */
  private async pasteWithAlternativeMethod(
    page: Page,
    modifier: string
  ): Promise<void> {
    sendLogToRenderer(this.mainWindow, "Tab 키 방식으로 붙여넣기 시도...");

    // Tab으로 에디터로 이동
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);

    // 기존 내용 삭제
    await page.keyboard.press(`${modifier}+a`);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);

    // 붙여넣기
    await page.keyboard.press(`${modifier}+v`);
    await page.waitForTimeout(3000);

    // 검증
    const frame = page.frameLocator("#editor-tistory_ifr");
    const content = await frame
      .locator("body#tinymce")
      .evaluate((el) => el.innerHTML);

    if (content.length < 500) {
      throw new Error("대체 방법도 본문 내용 부족");
    }

    sendLogToRenderer(
      this.mainWindow,
      `✅ 대체 방법으로 붙여넣기 성공 (${content.length}자)`
    );
  }

  /**
   * [NEW] 대표 이미지 설정
   *
   * 본문 첫 번째 이미지를 잘라내서 다시 붙이고
   * 티스토리 캐시 후 대표 이미지 체크박스를 클릭합니다.
   *
   * @param page - Playwright Page 객체
   */
  private async setRepresentativeImage(page: Page): Promise<void> {
    try {
      sendLogToRenderer(this.mainWindow, "대표 이미지 설정 중...");

      const frame = page.frameLocator("#editor-tistory_ifr");
      const body = frame.locator("body#tinymce");

      // 1. 첫 번째 이미지 찾기
      const firstImage = body.locator("img:first-child");

      const exists = (await firstImage.count()) > 0;
      if (!exists) {
        logger.warn("에디터에 이미지가 없습니다. 대표 이미지 설정 스킵.");
        return;
      }

      // 2. 이미지 HTML 가져오기
      const imageHtml = await firstImage.evaluate(
        (img: HTMLImageElement) => img.outerHTML
      );

      logger.info(
        `첫 번째 이미지 HTML 추출 완료: ${imageHtml.substring(0, 100)}...`
      );

      // 3. 이미지 잘라내기 (Cut) 및 붙이기 (Paste)
      await firstImage.click();
      await page.waitForTimeout(200);

      // 전체 선택
      await page.keyboard.press(
        `${process.platform === "darwin" ? "Meta" : "Control"}+a`
      );
      await page.waitForTimeout(100);

      // 잘라내기
      await page.keyboard.press(
        `${process.platform === "darwin" ? "Meta" : "Control"}+x`
      );
      await page.waitForTimeout(200);

      // 붙이기
      await page.keyboard.press(
        `${process.platform === "darwin" ? "Meta" : "Control"}+v`
      );
      await page.waitForTimeout(2000);

      // 4. 티스토리 캐시 대기
      // 이미지가 캐시되면 대표 이미지 체크박스가 활성화됨
      logger.info("티스토리 이미지 캐시 대기 중...");
      await page.waitForTimeout(3000);

      // 5. 대표 이미지 체크박스 클릭
      // .mce-represent-image-btn.active 또는 .mce-represent-image-btn 요소 찾기
      // 먼저 활성화된 체크박스가 있는지 확인
      try {
        await page.waitForTimeout(1000);

        const activeCheckbox = page.locator(".mce-represent-image-btn.active");
        const activeExists = (await activeCheckbox.count()) > 0;

        if (activeExists) {
          sendLogToRenderer(
            this.mainWindow,
            "✅ 대표 이미지 체크박스가 이미 활성화되어 있습니다."
          );
          return;
        }

        // 체크박스 활성화되지 않은 경우, 이미지 다시 클릭
        logger.info("대표 이미지 체크박스 찾기 위해 이미지 클릭 중...");

        // 첫 번째 이미지 클릭
        const clickedImage = body.locator("img:first-child");
        const clickedExists = (await clickedImage.count()) > 0;
        if (clickedExists) {
          await clickedImage.click();
          await page.waitForTimeout(500);
        }

        // 활성화된 체크박스 찾기
        await page.waitForTimeout(1000);
        const checkbox = page.locator(".mce-represent-image-btn.active");
        const checkboxExists = (await checkbox.count()) > 0;

        if (checkboxExists) {
          await checkbox.click();
          sendLogToRenderer(
            this.mainWindow,
            "✅ 대표 이미지 체크박스 클릭 완료"
          );
        } else {
          logger.warn("대표 이미지 체크박스를 찾을 수 없습니다.");
        }
      } catch (e) {
        logger.warn(`대표 이미지 체크박스 클릭 중 오류: ${e.message}`);
      }
    } catch (error: any) {
      logger.warn(`대표 이미지 설정 중 오류: ${error.message}`);
      sendLogToRenderer(this.mainWindow, "대표 이미지 설정 실패 (계속 진행)");
    }
  }

  /**
   * [NEW] 로컬 이미지(file://)를 Base64로 변환하여 HTML에 임베딩
   */
  private async convertLocalImagesToBase64(
    htmlContent: string
  ): Promise<string> {
    const $ = cheerio.load(htmlContent);
    const images = $("img");
    let convertedCount = 0;

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const src = $(img).attr("src");

      // file:// 프로토콜 또는 절대 경로인 경우 처리
      if (src && (src.startsWith("file://") || path.isAbsolute(src))) {
        try {
          const cleanPath = src.replace(/^file:\/\//, "");
          const decodedPath = decodeURIComponent(cleanPath);

          if (await fs.pathExists(decodedPath)) {
            const buffer = await fs.readFile(decodedPath);
            const base64 = buffer.toString("base64");
            // 확장자 확인
            const ext = path.extname(decodedPath).toLowerCase();
            const mimeType =
              ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

            $(img).attr("src", `data:${mimeType};base64,${base64}`);
            convertedCount++;
          }
        } catch (e: any) {
          logger.warn(
            `Failed to convert image to Base64: ${src} - ${e.message}`
          );
        }
      }
    }

    if (convertedCount > 0) {
      logger.info(`Converted ${convertedCount} local images to Base64`);
    }

    return $("body").html() || $.html();
  }
}
