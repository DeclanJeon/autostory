import { Page } from "playwright";
import { NAVER_SELECTORS, NAVER_THEME_CODES } from "../config/naverSelectors";
import { logger, sendLogToRenderer } from "../utils/logger";

/**
 * 네이버 블로그 자동화 서비스 (Refactored)
 *
 * 개선사항:
 * 1. 카테고리 추가 로직: 트리 구조 내 인라인 입력 방식(input.cat_input) 완벽 대응
 * 2. 태그 추출 로직: 단순 형태소 분리가 아닌, 조사 제거 및 빈도 기반 명사 추출 알고리즘 적용
 */
export class NaverService {
  private mainWindow: any;

  constructor(mainWindow: any) {
    this.mainWindow = mainWindow;
  }

  public setMainWindow(window: any) {
    this.mainWindow = window;
  }

  /**
   * [Step 1] 네이버 로그인 확인 및 수행
   */
  public async login(page: Page, blogId: string): Promise<boolean> {
    try {
      sendLogToRenderer(this.mainWindow, "네이버 로그인 상태 확인 중...");

      await page.goto("https://www.naver.com", {
        waitUntil: "domcontentloaded",
      });

      const isLoginBtnVisible = await page.isVisible(
        NAVER_SELECTORS.LOGIN.LOGIN_BTN_CLASS
      );

      if (!isLoginBtnVisible) {
        logger.info("이미 네이버에 로그인되어 있습니다.");
        return true;
      }

      sendLogToRenderer(
        this.mainWindow,
        "로그인이 필요합니다. 로그인 페이지로 이동합니다."
      );
      await page.goto(NAVER_SELECTORS.LOGIN.URL);

      sendLogToRenderer(
        this.mainWindow,
        "수동 로그인을 대기합니다. (최대 5분)"
      );

      await page.waitForFunction(
        () => {
          return (
            location.href.includes("www.naver.com") &&
            !document.querySelector(".link_login")
          );
        },
        null,
        { timeout: 300000 }
      );

      return true;
    } catch (error) {
      logger.error(`네이버 로그인 실패: ${error}`);
      return false;
    }
  }

  /**
   * [Core Logic] 카테고리 존재 여부 확인 및 생성 (HTML 구조 기반 최적화)
   */
  public async ensureCategoryExists(
    page: Page,
    blogId: string,
    categoryName: string
  ): Promise<boolean> {
    if (!categoryName || categoryName === "General") return false;

    try {
      sendLogToRenderer(
        this.mainWindow,
        `[Naver] 카테고리 확인 중: ${categoryName}`
      );

      const adminUrl = NAVER_SELECTORS.WRITE.ADMIN_CATEGORY_URL(blogId);

      // 관리 페이지로 이동 (이미 있다면 새로고침 방지)
      if (!page.url().includes("/config/blog")) {
        await page.goto(adminUrl, { waitUntil: "networkidle" });
      }

      // iframe 내부의 트리 구조 로딩 대기
      await page.waitForSelector("#tree", { timeout: 10000 });

      // 현재 존재하는 카테고리 텍스트 스캔
      const existingCategories = await page.$$eval(
        "#tree li ._categoryName",
        (els) => els.map((el) => el.textContent?.trim())
      );

      if (existingCategories.includes(categoryName)) {
        logger.info(`[Naver] 이미 존재하는 카테고리입니다: ${categoryName}`);
        return true;
      }

      sendLogToRenderer(
        this.mainWindow,
        `[Naver] 새 카테고리 생성 시도: ${categoryName}`
      );

      // 1. '카테고리 추가' 버튼 클릭
      // HTML 구조: <a href="#"><img ... class="_addCategoryView ..."></a>
      const addBtnSelector = "img._addCategoryView";
      await page.waitForSelector(addBtnSelector, { state: "visible" });
      await page.click(addBtnSelector);

      logger.info("카테고리 추가 버튼 클릭됨");

      // 2. 트리에 생성된 인라인 입력창(input.cat_input) 대기 및 입력
      // HTML 구조: <li ... input"><div ...><label><span ...><input class="cat_input" ...>
      const inlineInputSelector = "#tree li input.cat_input";
      await page.waitForSelector(inlineInputSelector, {
        state: "visible",
        timeout: 5000,
      });

      // 입력창 포커스 및 초기화
      await page.click(inlineInputSelector);
      await page.waitForTimeout(100);

      // 기존 텍스트(예: "게시판") 지우기
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${modifier}+A`);
      await page.keyboard.press("Backspace");

      // 새 카테고리명 입력
      await page.keyboard.type(categoryName, { delay: 100 });
      await page.waitForTimeout(500);

      // 엔터키로 확정 (가장 확실한 방법)
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1000);

      logger.info(`카테고리명 입력 완료: ${categoryName}`);

      // 3. 생성된 카테고리 선택 (설정 패널 활성화를 위해)
      // 입력창이 사라지고 텍스트로 변환된 노드를 찾아서 클릭
      const createdNodeSelector = `#tree li label:has-text("${categoryName}")`;
      await page.click(createdNodeSelector);
      await page.waitForTimeout(500);

      // 4. 공개 설정 (공개)
      try {
        const publicRadio = page.locator("#pub_c1"); // 공개 라디오 버튼 ID
        if (await publicRadio.isVisible()) {
          await publicRadio.click();
        }
      } catch (e) {
        logger.warn(
          "공개 설정 라디오 버튼을 찾을 수 없습니다 (상위 카테고리 설정 등 원인)"
        );
      }

      // 5. 주제 분류 설정
      const targetSeq = this.getThemeSeq(categoryName);

      // 주제 분류 드롭다운 열기
      await page.click("#theme_select_bar");
      await page.waitForSelector("#themeSelectLayer", { state: "visible" });

      // 해당 주제 클릭
      const themeSelector = `input[name="directorySeq"][value="${targetSeq}"] + label`;
      if (await page.isVisible(themeSelector)) {
        await page.click(themeSelector);
        logger.info(`주제 분류 선택 완료: Seq ${targetSeq}`);
      } else {
        // 매칭되는 주제가 없으면 IT(30) 혹은 첫 번째 항목 선택
        await page
          .click(`input[name="directorySeq"][value="30"] + label`)
          .catch(() => {});
      }
      await page.waitForTimeout(500);

      // 6. 저장 (확인 버튼)
      // alert 창 자동 수락 처리
      page.once("dialog", async (dialog) => {
        logger.info(`[Naver Alert] ${dialog.message()}`);
        await dialog.accept();
      });

      await page.click("#submit_button");
      await page.waitForTimeout(3000); // 저장 처리 대기

      sendLogToRenderer(this.mainWindow, "[Naver] 카테고리 생성 및 설정 완료");

      // 글쓰기 페이지로 복귀
      await page.goto(NAVER_SELECTORS.WRITE.URL(blogId), {
        waitUntil: "networkidle",
      });

      return true;
    } catch (error: any) {
      logger.error(`[Naver] 카테고리 생성 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * [Core Logic] 주제 분류 코드 매핑
   */
  private getThemeSeq(categoryName: string): number {
    for (const [keyword, seq] of Object.entries(NAVER_THEME_CODES)) {
      if (categoryName.includes(keyword)) {
        return seq;
      }
    }
    return 30; // Default: IT·컴퓨터
  }

  /**
   * [Step 9~15] 네이버 블로그 글 작성 메인 로직
   */
  public async writePost(
    page: Page,
    blogId: string,
    title: string,
    contentHtml: string,
    categoryName: string
  ): Promise<void> {
    const writeUrl = NAVER_SELECTORS.WRITE.URL(blogId);

    // 글쓰기 페이지 진입
    if (!page.url().includes("/postwrite")) {
      await page.goto(writeUrl, { waitUntil: "networkidle" });
    }

    await this.handleDraftPopup(page);

    sendLogToRenderer(this.mainWindow, "네이버 에디터에 내용 입력 중...");

    // 1. 제목 입력
    await page.waitForSelector(NAVER_SELECTORS.WRITE.TITLE_INPUT, {
      timeout: 10000,
    });
    const titleArea = page
      .locator(".se-documentTitle .se-text-paragraph")
      .first();
    await titleArea.click();
    await page.waitForTimeout(300);

    // 기존 제목 지우기
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+A`);
    await page.keyboard.press("Backspace");

    // 제목 타이핑
    await page.keyboard.type(title, { delay: 80 });
    await page.waitForTimeout(500);

    // 2. 본문 입력 (클립보드 방식)
    await page.keyboard.press("Tab"); // 본문 영역으로 포커스 이동
    await this.pasteContent(page, contentHtml);
    await page.waitForTimeout(2000);

    // 3. 발행 버튼 클릭 (Drawer 열기)
    sendLogToRenderer(this.mainWindow, "발행 설정 진행 중...");
    await page.click(NAVER_SELECTORS.PUBLISH.BTN_OPEN_DRAWER);
    await page.waitForSelector(NAVER_SELECTORS.PUBLISH.DRAWER_LAYER);

    // 4. 카테고리 선택
    if (categoryName && categoryName !== "General") {
      try {
        // Drawer 내 카테고리 리스트에서 텍스트 매칭으로 클릭
        const categoryLabel = page
          .locator(`.layer_publish__vA9PX label:has-text("${categoryName}")`)
          .first();
        if (await categoryLabel.isVisible()) {
          await categoryLabel.click();
          logger.info(`카테고리 선택됨: ${categoryName}`);
        }
      } catch (e) {
        logger.warn("발행 화면에서 카테고리 선택 실패 (기본값 사용)");
      }
    }

    // 5. 태그 입력 (개선된 로직 사용)
    try {
      const tags = this.extractSmartTags(title, contentHtml); // 개선된 태그 추출 함수 호출
      const tagInput = page.locator(NAVER_SELECTORS.PUBLISH.TAG_INPUT);

      if (await tagInput.isVisible()) {
        await tagInput.click();

        for (const tag of tags) {
          await page.keyboard.type(tag, { delay: 50 });
          await page.keyboard.press("Enter"); // 태그 등록
          await page.waitForTimeout(300);
        }
        logger.info(`태그 입력 완료: ${tags.join(", ")}`);
      }
    } catch (e) {
      logger.warn(`태그 입력 중 오류: ${e}`);
    }

    // 6. 최종 발행
    const finalPublishBtn = page
      .locator(NAVER_SELECTORS.PUBLISH.BTN_FINAL_PUBLISH)
      .first();
    await finalPublishBtn.click();

    // 발행 완료 대기
    await page
      .waitForNavigation({ waitUntil: "networkidle", timeout: 10000 })
      .catch(() => {});
    sendLogToRenderer(this.mainWindow, "네이버 블로그 발행 완료!");
  }

  /**
   * [Improved] 스마트 태그 추출 로직
   * 단순 띄어쓰기 분할이 아닌, 한국어 조사 제거 및 핵심 명사 추출 시뮬레이션
   */
  private extractSmartTags(title: string, htmlContent: string): string[] {
    const MAX_TAGS = 10;

    // 1. HTML 태그 제거 및 텍스트 정규화
    const cleanText = (title + " " + htmlContent)
      .replace(/<[^>]*>/g, " ") // HTML 태그 제거
      .replace(/[^\w\uac00-\ud7af\s]/g, " ") // 특수문자 제거 (한글, 영문, 공백만 남김)
      .replace(/\s+/g, " ")
      .trim();

    // 2. 단어 분리
    const rawWords = cleanText.split(" ");

    // 3. 불용어 및 조사 제거를 위한 정규식 (어설픈 형태소 분석 흉내)
    // 끝이 은,는,이,가,을,를,의,에,로,으로,도,만,까지,부터 등으로 끝나는 경우 제거 시도
    const postPositionRegex =
      /(은|는|이|가|을|를|의|에|에게|에서|로|으로|도|만|까지|부터|들)$/;

    const candidateMap = new Map<string, number>();

    rawWords.forEach((word) => {
      // 2글자 미만 무시
      if (word.length < 2) return;

      // 조사가 붙어있을 확률이 높은 단어 처리 (간이 방식)
      let stem = word;
      if (word.length >= 3 && postPositionRegex.test(word)) {
        stem = word.replace(postPositionRegex, "");
      }

      // 너무 짧아진 단어 무시 (예: '그' -> '')
      if (stem.length < 2) return;

      // 불용어 필터링
      if (this.isStopWord(stem)) return;

      candidateMap.set(stem, (candidateMap.get(stem) || 0) + 1);
    });

    // 4. 빈도수 정렬
    const sortedTags = Array.from(candidateMap.entries())
      .sort((a, b) => b[1] - a[1]) // 빈도 내림차순
      .map((entry) => entry[0]);

    // 5. 제목에 있는 단어 가중치 (제목에 포함된 키워드를 우선순위로 올림)
    const titleKeywords = sortedTags.filter((tag) => title.includes(tag));
    const contentKeywords = sortedTags.filter((tag) => !title.includes(tag));

    const finalTags = [
      ...new Set([...titleKeywords, ...contentKeywords]),
    ].slice(0, MAX_TAGS);

    logger.info(`스마트 태그 추출 결과: ${finalTags.join(", ")}`);
    return finalTags;
  }

  private isStopWord(word: string): boolean {
    const stopWords = [
      "있다",
      "없다",
      "하는",
      "있는",
      "그리고",
      "하지만",
      "때문에",
      "위해",
      "대한",
      "통해",
      "정말",
      "진짜",
      "너무",
      "많이",
      "가장",
      "바로",
      "이것",
      "저것",
      "그것",
      "여기",
      "저기",
      "오늘",
      "내일",
      "이번",
      "사용",
      "방법",
      "경우",
      "생각",
      "사실",
      "부분",
      "관련",
      "정도",
      "블로그",
      "포스팅",
      "글쓰기",
      "사진",
      "시간",
      "사람",
      "우리",
    ];
    return stopWords.includes(word);
  }

  private async handleDraftPopup(page: Page) {
    try {
      const popup = await page
        .waitForSelector(".se-popup-container", { timeout: 2000 })
        .catch(() => null);
      if (popup) {
        const cancelBtn = page.locator("button.se-popup-button-cancel");
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();
        }
      }
    } catch (e) {}
  }

  private async pasteContent(page: Page, htmlContent: string) {
    await page.evaluate((html) => {
      const blob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([html], { type: "text/plain" });
      const item = new ClipboardItem({
        "text/html": blob,
        "text/plain": textBlob,
      });
      navigator.clipboard.write([item]);
    }, htmlContent);

    // 본문 영역 클릭 후 붙여넣기
    const contentArea = page
      .locator(".se-component.se-text.se-l-default")
      .first();
    if (await contentArea.isVisible()) {
      await contentArea.click();
    } else {
      // fallback
      await page.click("body");
    }

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+v`);
  }
}
