import { RssService } from "./RssService";
import { AiService } from "./AiService";
import { FileManager } from "./FileManager";
import { AutomationService, LoginResult } from "./AutomationService";
import { logger, sendLogToRenderer } from "../utils/logger";
import store from "../config/store";

export type ScheduleInterval = 30 | 60 | 120 | 180 | 240 | 300;

export type PublishStage =
  | "idle"
  | "checking-auth"
  | "waiting-login"
  | "logging-in"
  | "fetching-feeds"
  | "selecting-issues"
  | "selecting-style" // [신규] 프롬프트/페르소나 선택 단계
  | "generating-content"
  | "processing-images"
  | "publishing"
  | "completed"
  | "failed"
  | "cancelled";

export interface SchedulerStatus {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: number;
  nextRun: number | null;
  totalPublished: number;
  isRunning: boolean;
  currentStage: PublishStage;
  currentMessage: string;
}

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private mainWindow: any;
  private isRunning: boolean = false;
  private currentStage: PublishStage = "idle";
  private currentMessage: string = "";
  private isCancelled: boolean = false;

  constructor(window: any) {
    this.mainWindow = window;
    this.restoreScheduler();
  }

  private restoreScheduler() {
    const schedulerConfig = store.get("scheduler");
    if (schedulerConfig?.enabled && schedulerConfig?.intervalMinutes) {
      logger.info(`스케줄러 복원: ${schedulerConfig.intervalMinutes}분 간격`);
      this.startSchedule(schedulerConfig.intervalMinutes as ScheduleInterval);
    }
  }

  private updateStage(stage: PublishStage, message: string) {
    this.currentStage = stage;
    this.currentMessage = message;
    sendLogToRenderer(this.mainWindow, message);

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("publish-stage-change", {
        stage,
        message,
        canCancel: this.canCancelCurrentStage(stage),
      });
    }
  }

  private canCancelCurrentStage(stage: PublishStage): boolean {
    const cancellableStages: PublishStage[] = [
      "checking-auth",
      "waiting-login",
      "logging-in",
      "fetching-feeds",
      "selecting-issues",
      "selecting-style", // [추가] 스타일 선택 단계도 취소 가능
      "generating-content",
      "processing-images",
    ];
    return cancellableStages.includes(stage);
  }

  public getStatus(): SchedulerStatus {
    const config = store.get("scheduler");
    return {
      enabled: config.enabled,
      intervalMinutes: config.intervalMinutes,
      lastRun: config.lastRun,
      nextRun: config.enabled
        ? config.lastRun + config.intervalMinutes * 60 * 1000
        : null,
      totalPublished: config.totalPublished,
      isRunning: this.isRunning,
      currentStage: this.currentStage,
      currentMessage: this.currentMessage,
    };
  }

  public startSchedule(intervalMinutes: ScheduleInterval): boolean {
    this.stopSchedule();

    const intervalMs = intervalMinutes * 60 * 1000;

    store.set("scheduler", {
      ...store.get("scheduler"),
      enabled: true,
      intervalMinutes,
    });

    this.intervalId = setInterval(async () => {
      await this.runOneClickPublish();
    }, intervalMs);

    logger.info(`스케줄러 시작: ${intervalMinutes}분 간격`);
    sendLogToRenderer(
      this.mainWindow,
      `⏰ 자동 발행 스케줄러 시작 (${intervalMinutes}분 간격)`
    );

    return true;
  }

  public stopSchedule(): boolean {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    store.set("scheduler", {
      ...store.get("scheduler"),
      enabled: false,
    });

    logger.info("스케줄러 중지됨");
    sendLogToRenderer(this.mainWindow, "자동 발행 스케줄러가 중지되었습니다");

    return true;
  }

  public cancelCurrentPublish(): { success: boolean; message: string } {
    if (!this.isRunning) {
      return { success: false, message: "진행 중인 발행이 없습니다." };
    }

    if (!this.canCancelCurrentStage(this.currentStage)) {
      return {
        success: false,
        message: `현재 단계(${this.currentStage})에서는 취소할 수 없습니다.`,
      };
    }

    this.isCancelled = true;

    const automation = AutomationService.getInstance();
    automation.cancelCurrentOperation();

    this.updateStage("cancelled", "발행이 취소되었습니다.");

    return { success: true, message: "발행 취소 요청이 처리되었습니다." };
  }

  public async runOneClickPublish(): Promise<{
    success: boolean;
    title?: string;
    usedPrompt?: string;
    usedPersona?: string;
    error?: string;
  }> {
    if (this.isRunning) {
      return { success: false, error: "이미 발행이 진행 중입니다." };
    }

    this.isRunning = true;
    this.isCancelled = false;
    this.updateStage("checking-auth", "원클릭 발행을 시작합니다...");

    try {
      const rssService = new RssService();
      const aiService = new AiService();
      const fileManager = new FileManager();
      const automation = AutomationService.getInstance();
      automation.setMainWindow(this.mainWindow);

      if (this.isCancelled) {
        return { success: false, error: "발행이 취소되었습니다." };
      }

      this.updateStage("checking-auth", "로그인 상태 확인 중...");
      const loginResult = await automation.ensureLoggedInForPublish();

      if (!loginResult.success) {
        if (loginResult.error?.includes("취소")) {
          this.updateStage("cancelled", "로그인이 취소되었습니다.");
          return { success: false, error: "로그인이 취소되었습니다." };
        }
        this.updateStage("failed", "로그인 실패");
        return { success: false, error: loginResult.error || "로그인 실패" };
      }

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      this.updateStage("fetching-feeds", "최신 RSS 피드를 가져오는 중...");
      const allFeeds = await rssService.fetchAllFeeds(true);

      if (allFeeds.length === 0) {
        this.updateStage("failed", "RSS 피드가 없습니다.");
        return { success: false, error: "RSS 피드가 없습니다." };
      }

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      const recentFeeds = rssService.filterByPeriod(allFeeds, 3);

      if (recentFeeds.length === 0) {
        this.updateStage("failed", "최근 3일 내 피드가 없습니다.");
        return { success: false, error: "최근 3일 내 피드가 없습니다." };
      }

      this.updateStage(
        "selecting-issues",
        `${recentFeeds.length}개 피드에서 이슈 선택 중...`
      );

      const shuffled = [...recentFeeds].sort(() => Math.random() - 0.5);
      const selectedIssue = shuffled[0]; // 랜덤으로 1개만 선택
      const selectedIssues = [selectedIssue]; // 배열로 감싸기 (기존 API 호환성 유지)

      sendLogToRenderer(
        this.mainWindow,
        `선택된 이슈: ${selectedIssue.title.substring(0, 50)}...`
      );
      sendLogToRenderer(this.mainWindow, `출처: ${selectedIssue.source}`);

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      // ============================================================
      // [신규] Step 4: 프롬프트/페르소나 자동 선택
      // ============================================================
      this.updateStage(
        "selecting-style",
        "소재에 맞는 글쓰기 스타일을 선택하고 있습니다..."
      );

      // 피드 내용을 기반으로 최적 조합 선택
      const feedContent = `${selectedIssue.title} ${
        selectedIssue.contentSnippet || ""
      }`;
      const dynamicSelection = aiService.autoSelectCombination(feedContent);

      sendLogToRenderer(
        this.mainWindow,
        `📝 선택된 페르소나: ${dynamicSelection.persona?.name || "기본"}`
      );
      sendLogToRenderer(
        this.mainWindow,
        `📄 선택된 프롬프트: ${dynamicSelection.prompt?.name || "기본"}`
      );
      sendLogToRenderer(
        this.mainWindow,
        `🎯 매칭 이유: ${dynamicSelection.matchReason}`
      );

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      // ============================================================
      // Step 5: AI 콘텐츠 생성 (동적 프롬프트/페르소나 적용)
      // ============================================================
      this.updateStage(
        "generating-content",
        `AI가 "${
          dynamicSelection.persona?.name || "기본"
        }" 스타일로 콘텐츠 생성 중... (30초~1분 소요)`
      );

      // 'dynamic-auto' 모드로 호출하여 선택된 조합 사용
      const { title, content, imageKeyword, usedPrompt, usedPersona } =
        await aiService.generatePost(
          selectedIssues,
          "독자의 관심을 끌고 실용적인 정보를 제공하는 블로그 글을 작성해주세요. 자연스러운 한국어로 작성하고 AI가 쓴 것처럼 보이지 않게 해주세요.",
          "dynamic-auto", // [중요] 동적 자동 모드 사용
          dynamicSelection // 선택된 프롬프트/페르소나 전달
        );

      if (!title || !content || content.length < 100) {
        this.updateStage("failed", "AI 콘텐츠 생성 실패");
        return { success: false, error: "AI 콘텐츠 생성 실패" };
      }

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      this.updateStage("processing-images", "이미지 처리 중...");

      let finalContent = content;
      const usedImageUrls = new Set<string>();

      if (
        imageKeyword &&
        imageKeyword !== "blog" &&
        imageKeyword.trim() !== ""
      ) {
        try {
          sendLogToRenderer(
            this.mainWindow,
            `대표 이미지 검색: ${imageKeyword}`
          );
          const heroImageUrl = await automation.fetchImageFromGoogle(
            imageKeyword,
            usedImageUrls
          );
          if (heroImageUrl) {
            usedImageUrls.add(heroImageUrl);
            const heroImageHtml = `
<div class="image-container" style="margin-bottom: 40px;">
  <img src="${heroImageUrl}" alt="${imageKeyword}" />
</div>`;
            finalContent = heroImageHtml + finalContent;
            sendLogToRenderer(this.mainWindow, "대표 이미지 추가 완료");
          }
        } catch (e) {
          logger.warn("대표 이미지 검색 실패:", e);
        }
      }

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      try {
        finalContent = await automation.processImageTags(
          finalContent,
          usedImageUrls
        );
      } catch (e) {
        logger.warn("이미지 태그 처리 실패:", e);
      }

      const category = "Auto_News";
      const filePath = await fileManager.savePost(
        category,
        title,
        finalContent,
        "html"
      );

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      this.updateStage("publishing", "글을 발행하는 중...");
      await automation.writePostFromHtmlFile(filePath, title, category);

      fileManager.markPostAsPublished(filePath);

      const schedulerConfig = store.get("scheduler");
      store.set("scheduler", {
        ...schedulerConfig,
        lastRun: Date.now(),
        totalPublished: (schedulerConfig.totalPublished || 0) + 1,
      });

      // 성공 메시지에 사용된 스타일 정보 포함
      this.updateStage(
        "completed",
        `발행 완료! "${title.substring(0, 30)}..." (${
          usedPersona || "기본"
        } 스타일)`
      );

      logger.info(
        `원클릭 발행 성공 - 프롬프트: ${usedPrompt}, 페르소나: ${usedPersona}`
      );

      return {
        success: true,
        title,
        usedPrompt: usedPrompt || dynamicSelection.prompt?.name,
        usedPersona: usedPersona || dynamicSelection.persona?.name,
      };
    } catch (error: any) {
      logger.error(`원클릭 발행 실패: ${error.message}`);

      if (error.message.includes("취소")) {
        this.updateStage("cancelled", error.message);
        return { success: false, error: error.message };
      }

      this.updateStage("failed", `발행 실패: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      this.isRunning = false;
      this.isCancelled = false;
    }
  }
}
