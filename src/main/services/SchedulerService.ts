import { RssService } from "./RssService";
import { AiService } from "./AiService";
import { FileManager } from "./FileManager";
import { AutomationService, LoginResult } from "./AutomationService";
import { logger, sendLogToRenderer } from "../utils/logger";
import store, { MaterialItem, addToPublishedHistory } from "../config/store";
import { powerSaveBlocker } from "electron";
import { jobQueue, Job, JobType } from "./JobQueueService";

export type ScheduleInterval = 5 | 10 | 30 | 60 | 120 | 180 | 240 | 300;

export type PublishStage =
  | "idle"
  | "checking-auth"
  | "waiting-login"
  | "logging-in"
  | "fetching-feeds"
  | "selecting-issues"
  | "selecting-style"
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
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
}

export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private mainWindow: any;
  private isProcessing: boolean = false;
  private currentStage: PublishStage = "idle";
  private currentMessage: string = "";
  private isCancelled: boolean = false;
  private powerBlockerId: number | null = null;
  private automation: AutomationService;
  private currentJobId: string | null = null;
  private TISTORY_LIMIT = 15;

  constructor(window: any) {
    this.mainWindow = window;
    this.automation = AutomationService.getInstance();
    this.automation.setMainWindow(window);

    // 앱 시작 시, 비정상 종료로 멈춘 작업 복구
    jobQueue.resetStuckJobs();

    // 오래된 작업 정리 (24시간 이전)
    jobQueue.cleanupStaleJobs();

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
      "selecting-style",
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
      isRunning: this.isProcessing,
      currentStage: this.currentStage,
      currentMessage: this.currentMessage,
      pendingJobs: jobQueue.getPendingCount(),
      completedJobs: jobQueue.getCompletedCount(),
      failedJobs: jobQueue.getFailedCount(),
    };
  }

  /**
   * 스케줄러 시작
   */
  public startSchedule(intervalMinutes: ScheduleInterval): boolean {
    this.stopSchedule();

    store.set("scheduler", {
      ...store.get("scheduler"),
      enabled: true,
      intervalMinutes,
    });

    // ⚡ 절전 모드 방지 (화면 꺼짐 방지)
    this.powerBlockerId = powerSaveBlocker.start("prevent-display-sleep");
    logger.info(
      `⚡ Scheduler Started. PowerBlocker ID: ${this.powerBlockerId}`
    );

    sendLogToRenderer(
      this.mainWindow,
      `⏰ 자동 발행 스케줄러 시작 (${intervalMinutes}분) | ⚡ 절전 방지 ON`
    );

    // [로직 변경] 시작 즉시 실행하지 않고, 다음 주기부터 실행할지,
    // 아니면 시작하자마자 한 번 실행할지 정책 결정.
    // 여기서는 "큐에 쌓인 게 있으면 즉시 처리"하는 기존 로직 유지
    if (jobQueue.getPendingCount() > 0) {
      this.processQueue();
    }

    // 주기적 실행 설정
    this.intervalId = setInterval(async () => {
      // [FIX] 스케줄러 핵심 로직 수정: 큐 확인 후 없으면 랜덤 발행
      const pendingCount = jobQueue.getPendingCount();

      if (this.isProcessing) {
        logger.warn(
          "[Scheduler] 이전 작업이 아직 진행 중입니다. 이번 주기는 건너뜁니다."
        );
        return;
      }

      if (pendingCount > 0) {
        logger.info(
          `[Scheduler] 큐에 대기 중인 작업 ${pendingCount}개를 처리합니다.`
        );
        await this.processQueue();
      } else {
        logger.info(
          `[Scheduler] 대기 중인 작업 없음 -> 랜덤 자동 발행(One-Click Publish)을 시작합니다.`
        );
        sendLogToRenderer(this.mainWindow, "⏰ 스케줄러: 정기 랜덤 발행 시작");

        // 랜덤 모드로 원클릭 발행 실행
        await this.runOneClickPublish({ mode: "random" });
      }
    }, intervalMinutes * 60 * 1000);

    return true;
  }

  /**
   * 스케줄러 중지
   */
  public stopSchedule(): boolean {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.powerBlockerId !== null) {
      powerSaveBlocker.stop(this.powerBlockerId);
      logger.info(`💤 PowerBlocker Released. ID: ${this.powerBlockerId}`);
      this.powerBlockerId = null;
    }

    store.set("scheduler", {
      ...store.get("scheduler"),
      enabled: false,
    });

    // 주의: isProcessing을 false로 강제 변경하지 않음 (진행 중인 작업은 완료되도록)
    // this.isProcessing = false;

    sendLogToRenderer(this.mainWindow, "⏹️ 자동 발행 스케줄러 중지됨");
    return true;
  }

  /**
   * 작업 큐 프로세서
   */
  private async processQueue() {
    if (this.isProcessing) {
      logger.warn("Job processor is already running. Skipping this cycle.");
      return;
    }

    this.isProcessing = true;

    try {
      const job = jobQueue.getNextJob();

      if (!job) {
        logger.info("No pending jobs in queue.");
        return;
      }

      logger.info(`🚀 Starting Job: ${job.id} (${job.type})`);
      jobQueue.updateJobStatus(job.id, "PROCESSING");
      this.currentJobId = job.id;

      sendLogToRenderer(
        this.mainWindow,
        `🔨 작업 시작: ${job.type} - ${JSON.stringify(job.data).substring(
          0,
          50
        )}...`
      );

      // 실제 작업 실행
      await this.executeJob(job);

      jobQueue.updateJobStatus(job.id, "COMPLETED");

      // 스케줄러 통계 업데이트
      const schedulerConfig = store.get("scheduler");
      store.set("scheduler", {
        ...schedulerConfig,
        lastRun: Date.now(),
        totalPublished: (schedulerConfig.totalPublished || 0) + 1,
      });

      sendLogToRenderer(this.mainWindow, `✅ 작업 완료: ${job.id}`);
    } catch (error: any) {
      logger.error(`❌ Job Execution Failed: ${error.message}`);

      // 현재 작업 실패 처리
      if (this.currentJobId) {
        jobQueue.updateJobStatus(this.currentJobId, "FAILED", error.message);
      }
    } finally {
      this.isProcessing = false;
      this.currentJobId = null;

      // 큐에 남은 작업이 더 있다면 즉시 재귀 호출
      const nextJob = jobQueue.getNextJob();
      if (nextJob) {
        logger.info("Processing next job in queue...");
        await this.processQueue();
      }
    }
  }

  /**
   * 개별 작업 실행기
   */
  private async executeJob(job: Job): Promise<void> {
    // 로그인 체크
    const loginResult = await this.automation.ensureLoggedInForPublish();
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error}`);
    }

    // 작업 타입에 따른 분기
    if (job.type === "PUBLISH_RSS") {
      await this.executeRssPublishJob(job);
    } else if (job.type === "PUBLISH_MATERIAL") {
      await this.executeMaterialPublishJob(job);
    }
  }

  /**
   * [NEW] 일일 발행량 리셋 체크
   */
  private checkAndResetDailyUsage() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const localToday = `${year}-${month}-${day}`;

    const usage = store.get("dailyUsage");

    // 날짜가 변경되었으면 카운트 리셋
    if (usage.lastResetDate !== localToday) {
      logger.info(
        `📅 날짜 변경 감지 (${usage.lastResetDate} -> ${localToday}). 발행량 초기화.`
      );
      store.set("dailyUsage", {
        tistoryCount: 0,
        lastResetDate: localToday,
      });
    }
  }

  /**
   * [UPDATED] 공통 발행 로직 (티스토리 일일 제한 체크 포함)
   */
  private async publishToPlatforms(
    filePath: string,
    title: string,
    category: string,
    htmlContent: string
  ): Promise<void> {
    // 1. 발행 시작 전 사용량 체크 및 리셋
    this.checkAndResetDailyUsage();

    const settings = store.get("settings");
    const dailyUsage = store.get("dailyUsage");
    const results: string[] = [];
    const errors: string[] = [];

    // 2. 티스토리 발행 (선택 여부 확인)
    if (settings.tistoryEnabled) {
      try {
        let reservationDate: Date | undefined = undefined;
        let isReservation = false;

        // 발행량 제한 체크
        if (dailyUsage.tistoryCount >= this.TISTORY_LIMIT) {
          logger.info(
            `🛑 티스토리 일일 발행량 초과 (${dailyUsage.tistoryCount}/${this.TISTORY_LIMIT}). 예약 발행으로 전환.`
          );

          // 내일 날짜 설정
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          // 시간 분산: 오전 7시 ~ 10시 사이 랜덤
          tomorrow.setHours(
            7 + Math.floor(Math.random() * 4),
            Math.floor(Math.random() * 60),
            0,
            0
          );

          reservationDate = tomorrow;
          isReservation = true;

          this.updateStage(
            "publishing",
            `티스토리 예약 발행 설정 중 (${tomorrow.toLocaleString()})...`
          );
        } else {
          this.updateStage(
            "publishing",
            `티스토리 발행 중... (오늘 ${dailyUsage.tistoryCount + 1}번째)`
          );
        }

        // Automation 호출 (예약 날짜 전달)
        await this.automation.writePostFromHtmlFile(
          filePath,
          title,
          category,
          undefined,
          reservationDate
        );

        results.push(isReservation ? "티스토리(예약)" : "티스토리");

        // 즉시 발행 성공 시에만 카운트 증가
        if (!isReservation) {
          store.set("dailyUsage", {
            ...dailyUsage,
            tistoryCount: dailyUsage.tistoryCount + 1,
          });
        }
      } catch (e: any) {
        logger.error(`Tistory Publish Error: ${e.message}`);
        errors.push(`티스토리 실패(${e.message})`);
      }
    } else {
      logger.info("티스토리 발행이 비활성화되어 건너뜁니다.");
    }

    // 3. 네이버 발행 (선택 여부 확인)
    // TODO: 네이버 블로그 발행 기능 구현 예정
    if (settings.naverEnabled && settings.naverBlogId) {
      logger.info("네이버 블로그 발행 기능은 아직 구현되지 않았습니다.");
      /*
      try {
        this.updateStage("publishing", `네이버 블로그 발행 중...`);

        // 네이버 로그인 확인
        // await this.automation.loginNaver();

        // 본문 내용만 추출
        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1].trim() : htmlContent;

        // await this.automation.writeToNaver(title, bodyContent, category);
        // results.push("네이버");
      } catch (e: any) {
        logger.error(`Naver Publish Error: ${e.message}`);
        errors.push(`네이버 실패(${e.message})`);
      }
      */
    }

    // 결과 처리
    if (results.length > 0) {
      const successMsg = `${results.join(", ")} 완료!`;
      const errorMsg = errors.length > 0 ? ` (오류: ${errors.join(", ")})` : "";
      logger.info(`Job Finished: ${successMsg}${errorMsg}`);
      // 하나라도 성공하면 파일은 발행된 것으로 처리
      const fileManager = new FileManager();
      fileManager.markPostAsPublished(filePath);
    } else if (
      !settings.tistoryEnabled &&
      (!settings.naverEnabled || !settings.naverBlogId)
    ) {
      throw new Error("활성화된 발행 플랫폼이 없습니다. 설정을 확인해주세요.");
    } else {
      throw new Error(`모든 플랫폼 발행 실패: ${errors.join(", ")}`);
    }
  }

  /**
   * RSS 발행 작업 실행
   */
  private async executeRssPublishJob(job: Job): Promise<void> {
    const rssService = new RssService();
    const aiService = new AiService();
    const fileManager = new FileManager();

    const feedLink = job.data.rssLink;
    let feedItem = job.data.feedItem;

    // [안전장치] feedItem의 link가 누락된 경우 rssLink로 복구
    if (feedItem && !feedItem.link && feedLink) {
      logger.warn(
        `RSS Job ${job.id}: feedItem.link is missing, using rssLink.`
      );
      feedItem = { ...feedItem, link: feedLink };
    }

    this.updateStage("generating-content", `RSS 발행: "${feedItem.title}"`);

    // 1. 스타일 자동 선택
    const feedContent = `${feedItem.title} ${feedItem.contentSnippet || ""}`;
    const dynamicSelection = aiService.autoSelectCombination(feedContent);

    sendLogToRenderer(
      this.mainWindow,
      `📝 페르소나: ${dynamicSelection.persona?.name || "기본"}`
    );

    // 2. AI 생성
    const { title, content, imageKeyword } = await aiService.generatePost(
      [feedItem],
      "블로그 형식으로 자연스럽게 작성해주세요.",
      "dynamic-auto",
      dynamicSelection
    );

    if (!content || content.length < 100) {
      throw new Error("AI 콘텐츠 생성 실패 (내용 부족)");
    }

    // 3. 이미지 처리
    let finalContent = content;
    const usedImageUrls = new Set<string>();

    if (imageKeyword && imageKeyword !== "blog") {
      try {
        sendLogToRenderer(this.mainWindow, `대표 이미지 검색: ${imageKeyword}`);
        const imgUrl = await this.automation.fetchImageFromGoogle(
          imageKeyword,
          usedImageUrls
        );
        if (imgUrl) {
          finalContent =
            `<div class="image-container"><img src="${imgUrl}" alt="${imageKeyword}"/></div>` +
            finalContent;
        }
      } catch (e) {
        logger.warn("대표 이미지 검색 실패 (무시하고 진행):", e);
      }
    }

    // 4. AI 기반 카테고리 자동 분류
    this.updateStage("generating-content", "AI가 적절한 카테고리를 분석 중...");
    const determinedCategory = await aiService.classifyCategory(content);

    logger.info(`🗂️ 카테고리 결정: "${title}" -> [${determinedCategory}]`);
    sendLogToRenderer(this.mainWindow, `🗂️ 카테고리: ${determinedCategory}`);

    // 5. 저장
    const filePath = await fileManager.savePost(
      determinedCategory,
      title,
      finalContent,
      "html"
    );

    // 6. [변경] 다중 플랫폼 발행 호출
    await this.publishToPlatforms(
      filePath,
      title,
      determinedCategory,
      finalContent
    );

    // [NEW] 발행 성공 시 원본 링크를 히스토리에 저장
    if (feedLink) {
      addToPublishedHistory(feedLink);
      logger.info(`Link added to history: ${feedLink}`);
    }
  }

  /**
   * 소재 발행 작업 실행
   */
  private async executeMaterialPublishJob(job: Job): Promise<void> {
    const aiService = new AiService();
    const fileManager = new FileManager();

    const materialId = job.data.materialId;
    const materials = store.get("materials") || [];
    const material = materials.find((m) => m.id === materialId);

    if (!material) {
      throw new Error(`소재를 찾을 수 없습니다: ${materialId}`);
    }

    this.updateStage("generating-content", `소재 발행: "${material.title}"`);

    // 1. 소재 내용 가져오기
    let contentToAnalyze = "";
    let sourceName = "Material";

    if (material.type === "link") {
      sourceName = "Link";
      try {
        const pageData = await this.automation.fetchPageContent(material.value);
        contentToAnalyze = `${pageData.title}\n\n${pageData.content}`;
      } catch (e: any) {
        throw new Error(`링크 분석 실패: ${e.message}`);
      }
    } else if (material.type === "file") {
      sourceName = "File";
      try {
        contentToAnalyze = await fileManager.parseFileContent(material.value);
      } catch (e: any) {
        throw new Error(`파일 읽기 실패: ${e.message}`);
      }
    } else if (material.type === "text") {
      sourceName = "Text";
      contentToAnalyze = material.value;
    }

    if (!contentToAnalyze) {
      throw new Error("분석할 콘텐츠 내용이 비어있습니다.");
    }

    // 2. 스타일 자동 선택
    const dynamicSelection = aiService.autoSelectCombination(
      contentToAnalyze.substring(0, 1000)
    );

    // 3. AI 생성
    const virtualIssue = {
      title: material.title,
      source: sourceName,
      contentSnippet: contentToAnalyze.substring(0, 500),
      link: material.type === "link" ? material.value : undefined, // 링크 타입 소재의 경우 링크 포함
    };

    const { title, content, imageKeyword } = await aiService.generatePost(
      [virtualIssue],
      "블로그 형식으로 자연스럽게 작성해주세요.",
      "dynamic-auto",
      dynamicSelection
    );

    if (!content || content.length < 100) {
      throw new Error("AI 콘텐츠 생성 실패 (내용 부족)");
    }

    // 4. 이미지 처리
    let finalContent = content;
    const usedImageUrls = new Set<string>();

    if (imageKeyword && imageKeyword !== "blog") {
      try {
        sendLogToRenderer(this.mainWindow, `대표 이미지 검색: ${imageKeyword}`);
        const imgUrl = await this.automation.fetchImageFromGoogle(
          imageKeyword,
          usedImageUrls
        );
        if (imgUrl) {
          finalContent =
            `<div class="image-container"><img src="${imgUrl}" alt="${imageKeyword}"/></div>` +
            finalContent;
        }
      } catch (e) {
        logger.warn("이미지 검색 실패 (무시하고 진행):", e);
      }
    }

    // 5. AI 기반 카테고리 자동 분류
    this.updateStage("generating-content", "AI가 적절한 카테고리를 분석 중...");
    const determinedCategory = await aiService.classifyCategory(content);

    logger.info(`🗂️ 카테고리 결정: "${title}" -> [${determinedCategory}]`);
    sendLogToRenderer(this.mainWindow, `🗂️ 카테고리: ${determinedCategory}`);

    // 6. 저장
    const filePath = await fileManager.savePost(
      determinedCategory,
      title,
      finalContent,
      "html"
    );

    // 7. [변경] 다중 플랫폼 발행 호출
    await this.publishToPlatforms(
      filePath,
      title,
      determinedCategory,
      finalContent
    );

    // [NEW] 소재가 링크 타입이면 히스토리에 저장
    if (material && material.type === "link") {
      addToPublishedHistory(material.value);
    }

    // 8. 성공 시 소재 리스트에서 제거
    const currentMaterials = store.get("materials") || [];
    store.set(
      "materials",
      currentMaterials.filter((m) => m.id !== materialId)
    );
  }

  /**
   * RSS 피드 일괄 처리 (기존 API 호환성 유지)
   */
  public async processRssQueue(rssLinks: string[]): Promise<any> {
    if (this.isProcessing) {
      return { success: false, error: "이미 작업이 진행 중입니다." };
    }

    if (rssLinks.length === 0) {
      return { success: false, error: "선택된 RSS 항목이 없습니다." };
    }

    // RSS 피드 가져오기
    const rssService = new RssService();
    const allFeeds = await rssService.fetchAllFeeds(false);
    const targets = allFeeds.filter((feed) => rssLinks.includes(feed.link));

    if (targets.length === 0) {
      return { success: false, error: "선택된 RSS 항목을 찾을 수 없습니다." };
    }

    // 각 피드를 JobQueue에 추가
    targets.forEach((feed) => {
      jobQueue.addJob("PUBLISH_RSS", {
        rssLink: feed.link,
        feedItem: feed,
      });
    });

    // 즉시 처리 시작
    await this.processQueue();

    return {
      success: true,
      message: `${targets.length}개의 RSS 발행 작업을 큐에 추가했습니다.`,
    };
  }

  /**
   * 선택된 소재 일괄 처리 (기존 API 호환성 유지)
   */
  public async processMaterialQueue(selectedIds: string[]): Promise<any> {
    if (this.isProcessing) {
      return { success: false, error: "이미 작업이 진행 중입니다." };
    }

    const materials = store.get("materials") || [];
    const targets = materials.filter((m) => selectedIds.includes(m.id));

    if (targets.length === 0) {
      return { success: false, error: "선택된 유효한 소재가 없습니다." };
    }

    // 각 소재를 JobQueue에 추가
    targets.forEach((material) => {
      jobQueue.addJob("PUBLISH_MATERIAL", {
        materialId: material.id,
      });
    });

    // 즉시 처리 시작
    await this.processQueue();

    return {
      success: true,
      message: `${targets.length}개의 소재 발행 작업을 큐에 추가했습니다.`,
    };
  }

  public cancelCurrentPublish(): {
    success: boolean;
    message: string;
  } {
    if (!this.isProcessing) {
      return { success: false, message: "진행 중인 발행이 없습니다." };
    }

    if (!this.canCancelCurrentStage(this.currentStage)) {
      return {
        success: false,
        message: `현재 단계(${this.currentStage})에서는 취소할 수 없습니다.`,
      };
    }

    this.isCancelled = true;

    this.automation.cancelCurrentOperation();

    if (this.currentJobId) {
      jobQueue.updateJobStatus(this.currentJobId, "FAILED", "사용자 취소");
    }

    this.updateStage("cancelled", "발행이 취소되었습니다.");

    return { success: true, message: "발행 취소 요청이 처리되었습니다." };
  }

  public async runOneClickPublish(options?: {
    mode: "random" | "queue";
  }): Promise<{
    success: boolean;
    title?: string;
    usedPrompt?: string;
    usedPersona?: string;
    error?: string;
  }> {
    if (this.isProcessing) {
      return { success: false, error: "이미 발행이 진행 중입니다." };
    }

    this.isProcessing = true;
    this.isCancelled = false;
    this.updateStage("checking-auth", "원클릭 발행을 시작합니다...");

    try {
      const rssService = new RssService();
      const aiService = new AiService();
      const fileManager = new FileManager();

      if (this.isCancelled) {
        return { success: false, error: "발행이 취소되었습니다." };
      }

      this.updateStage("checking-auth", "로그인 상태 확인 중...");
      const loginResult = await this.automation.ensureLoggedInForPublish();

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
      const selectedIssue = shuffled[0];
      const selectedIssues = [selectedIssue];

      sendLogToRenderer(
        this.mainWindow,
        `선택된 이슈: ${selectedIssue.title.substring(0, 50)}...`
      );
      sendLogToRenderer(this.mainWindow, `출처: ${selectedIssue.source}`);

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      this.updateStage(
        "selecting-style",
        "소재에 맞는 글쓰기 스타일을 선택하고 있습니다..."
      );

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

      this.updateStage(
        "generating-content",
        `AI가 "${
          dynamicSelection.persona?.name || "기본"
        }" 스타일로 콘텐츠 생성 중... (30초~1분 소요)`
      );

      const { title, content, imageKeyword, usedPrompt, usedPersona } =
        await aiService.generatePost(
          selectedIssues,
          "독자의 관심을 끌고 실용적인 정보를 제공하는 블로그 글을 작성해주세요. 자연스러운 한국어로 작성하고 AI가 쓴 것처럼 보이지 않게 해주세요.",
          "dynamic-auto",
          dynamicSelection
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
          const heroImageUrl = await this.automation.fetchImageFromGoogle(
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
        finalContent = await this.automation.processImageTags(
          finalContent,
          usedImageUrls
        );
      } catch (e) {
        logger.warn("이미지 태그 처리 실패:", e);
      }

      this.updateStage(
        "generating-content",
        "AI가 적절한 카테고리를 분석 중..."
      );
      const determinedCategory = await aiService.classifyCategory(content);

      logger.info(`🗂️ 스케줄러 카테고리 결정: [${determinedCategory}]`);
      sendLogToRenderer(this.mainWindow, `🗂️ 카테고리: ${determinedCategory}`);

      const filePath = await fileManager.savePost(
        determinedCategory,
        title,
        finalContent,
        "html"
      );

      if (this.isCancelled) {
        this.updateStage("cancelled", "발행이 취소되었습니다.");
        return { success: false, error: "발행이 취소되었습니다." };
      }

      this.updateStage(
        "publishing",
        `글을 발행하는 중... (${determinedCategory})`
      );

      // [변경] 다중 플랫폼 발행 호출
      // publishToPlatforms를 호출하되, 여기서는 fileManager.markPostAsPublished가 내부적으로 호출됨
      await this.publishToPlatforms(
        filePath,
        title,
        determinedCategory,
        finalContent
      );

      const schedulerConfig = store.get("scheduler");
      store.set("scheduler", {
        ...schedulerConfig,
        lastRun: Date.now(),
        totalPublished: (schedulerConfig.totalPublished || 0) + 1,
      });

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
      this.isProcessing = false;
      this.isCancelled = false;
    }
  }
}
