import { ipcMain, dialog } from "electron";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs-extra";
import { AutomationService } from "../services/AutomationService";
import { RssService } from "../services/RssService";
import { AiService } from "../services/AiService";
import { FileManager } from "../services/FileManager";
import { TemplateManager } from "../services/TemplateManager";
import {
  SchedulerService,
  ScheduleInterval,
} from "../services/SchedulerService";
import { secureConfig } from "../services/SecureConfigService";
import { jobQueue } from "../services/JobQueueService";
import { logger } from "../utils/logger";
import store, { UsageManager, LastBatchSelection } from "../config/store";
import { ollamaInstaller, InstallProgress } from "../utils/ollamaInstaller";
import { localAiService } from "../services/LocalAiService";
import { ollamaConfig } from "../config/ollamaConfig";

let schedulerInstance: SchedulerService | null = null;

export const registerHandlers = (mainWindow: any) => {
  const automation = AutomationService.getInstance();
  automation.setMainWindow(mainWindow);
  const rssService = new RssService();
  const aiService = new AiService();
  const fileManager = new FileManager();
  const templateManager = new TemplateManager();

  schedulerInstance = new SchedulerService(mainWindow);

  // [보안] 기존 설정을 보안 스토리지로 마이그레이션
  secureConfig.migrateToSecureStorage();
  logger.info("SecureConfigService migration check completed");

  // [수정] 설정 저장 핸들러 (보안 적용)
  ipcMain.handle("save-settings", (_event, settings) => {
    // 민감한 키 분리 저장
    if (settings.aiApiKey) {
      secureConfig.setSecureItem("aiApiKey", settings.aiApiKey);
    }
    if (settings.openrouterApiKey) {
      secureConfig.setSecureItem("openrouterApiKey", settings.openrouterApiKey);
    }
    if (settings.pexelsApiKey) {
      secureConfig.setSecureItem("pexelsApiKey", settings.pexelsApiKey);
    }

    // 민감한 키 제외하고 일반 설정 저장
    const publicSettings = { ...settings };
    delete publicSettings.aiApiKey;
    delete publicSettings.openrouterApiKey;
    delete publicSettings.pexelsApiKey;

    store.set("settings", publicSettings);
    return { success: true };
  });

  // [수정] 설정 조회 핸들러 (복호화 적용)
  ipcMain.handle("get-settings", async () => {
    return await secureConfig.getFullSettings();
  });

  ipcMain.handle("start-login", async () => {
    return await automation.login();
  });

  ipcMain.handle("check-auth-status", async () => {
    try {
      const authData = store.get("auth");
      if (!authData || !authData.lastLogin) {
        return false;
      }

      const now = Date.now();
      const hoursSinceLogin = (now - authData.lastLogin) / (1000 * 60 * 60);

      if (hoursSinceLogin > 24) {
        return false;
      }

      await automation.initBrowser();
      return await automation.checkCurrentLoginStatus();
    } catch (error) {
      console.error("Auth status check failed:", error);
      return false;
    }
  });

  ipcMain.handle(
    "start-write",
    async (_event, { title, content, category, tags }) => {
      try {
        const filePath = await fileManager.savePost(
          category,
          title,
          content,
          "html"
        );
        await automation.writePostFromHtmlFile(filePath, title, category);
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
  );

  ipcMain.handle(
    "fetch-feeds",
    async (_event, { days = 3, forceRefresh = false }) => {
      try {
        const allFeeds = await rssService.fetchAllFeeds(forceRefresh);
        const filtered = rssService.filterByPeriod(allFeeds, days);
        return filtered;
      } catch (error) {
        console.error(error);
        return [];
      }
    }
  );

  ipcMain.handle("fetch-recent-issues", async (_event, { limit = 5 }) => {
    try {
      const allFeeds = await rssService.fetchAllFeeds(false);
      const recentFeeds = rssService.filterByPeriod(allFeeds, 1);
      return recentFeeds.slice(0, limit).map((item: any) => ({
        title: item.title || "",
        source: item.source || "",
        contentSnippet: item.contentSnippet || "",
        link: item.link || "",
      }));
    } catch (error) {
      console.error(error);
      return [];
    }
  });

  ipcMain.handle(
    "list-models",
    async (_event, apiKey: string, provider?: string, showAll?: boolean) => {
      try {
        return await aiService.listModels(apiKey, provider, showAll);
      } catch (error) {
        console.error(error);
        return [];
      }
    }
  );

  ipcMain.handle("get-post-images", async (_event, postPath: string) => {
    return await fileManager.getPostImages(postPath);
  });

  ipcMain.handle(
    "upload-post-image",
    async (_event, { postPath, filePath }) => {
      try {
        await fileManager.savePostImage(postPath, filePath);

        // Analyze Image for keywords
        const imageName = path.basename(filePath);
        const keywords = await aiService.analyzeImage(filePath);

        // Save keywords to metadata
        await fileManager.updateImageMetadata(postPath, imageName, keywords);

        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle(
    "delete-post-image",
    async (_event, { postPath, imageName }) => {
      try {
        await fileManager.deletePostImage(postPath, imageName);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle("list-posts", async () => {
    return await fileManager.listPosts();
  });

  ipcMain.handle("read-post", async (_event, filePath: string) => {
    return await fileManager.readPost(filePath);
  });

  // [신규] 포스트 삭제 핸들러
  ipcMain.handle("delete-post", async (_event, filePath: string) => {
    try {
      await fileManager.deletePost(filePath);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // [NEW] 이미지 처리 모드 지원 (IPC)
  ipcMain.handle(
    "process-file-with-images",
    async (event, { filePath, options }) => {
      try {
        const fullText = await fileManager.parseFileContent(filePath);
        if (!fullText) throw new Error("파일 내용을 읽을 수 없습니다.");

        // PDF인 경우 이미지 추출 시도
        let extractedImages: string[] = [];
        if (filePath.toLowerCase().endsWith(".pdf")) {
          extractedImages = await fileManager.extractImagesFromPdf(filePath);
        }

        // 이미지 분석 및 프롬프트 생성 (옵션이 켜져있고 추출된 이미지가 있는 경우)
        let generatedImages: any[] = [];
        if (options?.useAiImage && extractedImages.length > 0) {
          // 시간 관계상 최대 3장만 분석/생성
          for (const imgPath of extractedImages.slice(0, 3)) {
            const prompt = await aiService.analyzeImageForPrompt(imgPath);
            // AI 이미지 생성 (Mock or Real)
            const genUrl = await aiService.generateImageFromPrompt(prompt);

            generatedImages.push({
              original: imgPath,
              generated: genUrl,
              prompt: prompt,
            });
          }
        }

        return {
          success: true,
          text: fullText,
          extractedImages, // 원본 이미지 경로들
          generatedImages, // AI가 생성한 이미지 정보들
        };
      } catch (e: any) {
        logger.error(`이미지 처리 중 실패: ${e.message}`);
        return { success: false, error: e.message };
      }
    }
  );

  // [핵심 수정] 파일 업로드 및 처리 핸들러
  ipcMain.handle(
    "upload-and-process-file",
    async (event, { filePath, title, tags, category, autoPublish }) => {
      try {
        logger.info(`📂 파일 처리 시작: ${filePath}`);

        // 1. 파일 내용 파싱 (여기서 OCR 데이터 다운로드 프롬프트가 뜰 수 있음)
        // FileManager가 내부적으로 사용자에게 다이얼로그를 띄우고, 거절 시 에러를 throw합니다.
        const fullText = await fileManager.parseFileContent(filePath);

        if (!fullText || fullText.trim().length === 0) {
          throw new Error("파일에서 텍스트를 추출할 수 없습니다. (빈 내용)");
        }

        const progressCallback = (msg: string) => {
          // 렌더러 프로세스가 살아있을 때만 전송
          if (!event.sender.isDestroyed()) {
            event.sender.send("file-process-progress", msg);
          }
        };

        // 2. AI 시리즈 생성
        const generatedFiles = await aiService.generateSeriesFromContent(
          fullText,
          { title, tags, category },
          progressCallback
        );

        // 3. 자동 발행 (옵션)
        if (autoPublish && generatedFiles.length > 0) {
          progressCallback("🚀 자동 발행을 시작합니다...");

          // [CHECK] 티스토리 발행 가능 여부 확인
          const settings = store.get("settings");
          const tistoryId = settings.blogName;

          if (!tistoryId) {
            throw new Error("설정에 티스토리 블로그 주소가 없습니다.");
          }

          if (!UsageManager.checkLimit("tistory", tistoryId)) {
            throw new Error(
              `티스토리 일일 발행 한도(15회)를 초과했습니다. (${tistoryId})`
            );
          }

          const loginResult = await automation.login();

          if (!loginResult) {
            throw new Error("로그인 실패: 자동 발행을 중단합니다.");
          }

          for (let i = 0; i < generatedFiles.length; i++) {
            const path = generatedFiles[i];
            const partNum = i + 1;
            const total = generatedFiles.length;

            // 발행 직전 다시 한번 체크 (루프 도중 한도 초과 가능성)
            if (!UsageManager.checkLimit("tistory", tistoryId)) {
              progressCallback(`[${partNum}] 중단: 일일 한도 초과`);
              break;
            }

            progressCallback(
              `[${partNum}/${total}] 발행 중... (브라우저 제어)`
            );

            try {
              const content = await fileManager.readPost(path);
              const { title: postTitle } = fileManager.extractTitleAndBody(
                path,
                content
              );

              await automation.writePostFromHtmlFile(path, postTitle, category);
              fileManager.markPostAsPublished(path);

              // [INCREMENT] 카운트 증가
              UsageManager.incrementUsage("tistory", tistoryId);

              logger.info(`✅ 발행 완료: ${postTitle}`);

              if (i < total - 1) {
                const waitTime = 30;
                progressCallback(`다음 글 대기 중... (${waitTime}초)`);
                await new Promise((resolve) =>
                  setTimeout(resolve, waitTime * 1000)
                );
              }
            } catch (pubError: any) {
              logger.error(`❌ 발행 실패 (${path}): ${pubError.message}`);
              progressCallback(
                `[${partNum}/${total}] 발행 오류: ${pubError.message}`
              );
              // 하나 실패해도 다음 글로 진행할지 여부는 정책에 따라 결정 (현재는 진행)
            }
          }
          progressCallback("🎉 모든 작업이 완료되었습니다!");
        }

        return { success: true, files: generatedFiles };
      } catch (error: any) {
        logger.error(`❌ 업로드 처리 실패: ${error.message}`);
        // 사용자가 취소했거나, OCR 실패 등의 구체적인 메시지를 반환
        return { success: false, error: error.message };
      }
    }
  );

  // [신규] 링크 분석 및 글 생성 핸들러
  ipcMain.handle(
    "process-link-and-generate",
    async (event, { url, category }) => {
      try {
        // 1. 링크 스크래핑
        const { title: pageTitle, content: pageContent } =
          await automation.fetchPageContent(url);

        // 2. 프롬프트/페르소나 자동 선택
        const analysisContent =
          pageTitle + " " + pageContent.substring(0, 1000);
        let analysisResult =
          templateManager.autoSelectCombination(analysisContent);

        // [Adaptive Logic]
        if (analysisResult.matchScore < 3.0) {
          logger.info(
            `링크 매칭 점수 낮음 (${analysisResult.matchScore}), 적응형 템플릿 생성 시도...`
          );
          const adaptiveResult = await aiService.generateAdaptiveTemplates(
            analysisContent
          );
          if (adaptiveResult) {
            analysisResult = adaptiveResult;
          }
        }

        const isYouTube =
          url.includes("youtube.com") || url.includes("youtu.be");

        // 3. 가상의 Issue 생성
        const virtualIssue = {
          title: pageTitle,
          source: isYouTube ? "YouTube" : "Link",
          contentSnippet: pageContent.substring(0, 5000), // 너무 길면 자름
          link: url,
        };

        event.sender.send(
          "file-process-progress",
          "AI가 콘텐츠를 분석하고 글을 작성하고 있습니다..."
        );

        // 4. AI 생성
        const instruction = isYouTube
          ? "이 글은 YouTube 영상의 내용을 바탕으로 작성되었습니다. 영상의 핵심 내용을 요약하고, 독자가 흥미를 느낄 수 있도록 블로그 글 형식으로 재구성하세요."
          : "이 글은 링크된 웹페이지의 내용을 바탕으로 작성되었습니다. 원문의 내용을 충실히 반영하되, 블로그 글 형식으로 재구성하세요.";

        const { title, content } = await aiService.generatePost(
          [virtualIssue],
          instruction,
          "dynamic-auto",
          analysisResult
        );

        // 5. 저장
        const filePath = await fileManager.savePost(
          category,
          title,
          content,
          "html"
        );

        return { success: true, filePath, title };
      } catch (error: any) {
        logger.error(`링크 처리 실패: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
  );

  // ============================================================
  // 템플릿 관련 (기존 + 확장)
  // ============================================================

  /**
   * 모든 템플릿 조회 (기존 호환성 유지)
   */
  ipcMain.handle("list-templates", () => {
    return templateManager.getAllTemplates();
  });

  /**
   * [신규] 타입별 템플릿 조회
   */
  ipcMain.handle("list-templates-by-type", (_event, type: string) => {
    if (!["layout", "prompt", "persona"].includes(type)) {
      return [];
    }
    return templateManager.getTemplatesByType(
      type as "layout" | "prompt" | "persona"
    );
  });

  /**
   * [신규] 프롬프트만 조회
   */
  ipcMain.handle("get-prompts", () => {
    return templateManager.getPrompts();
  });

  /**
   * [신규] 페르소나만 조회
   */
  ipcMain.handle("get-personas", () => {
    return templateManager.getPersonas();
  });

  /**
   * [신규] 레이아웃만 조회
   */
  ipcMain.handle("get-layouts", () => {
    return templateManager.getLayouts();
  });

  /**
   * [신규] 피드 기반 프롬프트/페르소나 자동 선택
   */
  ipcMain.handle("auto-select-combination", (_event, feedContent: string) => {
    return templateManager.autoSelectCombination(feedContent);
  });

  /**
   * 템플릿 추가
   */
  ipcMain.handle("add-template", (_event, template) => {
    return templateManager.addTemplate(template);
  });

  /**
   * 템플릿 수정
   */
  ipcMain.handle("update-template", (_event, { id, updates }) => {
    return templateManager.updateTemplate(id, updates);
  });

  /**
   * 템플릿 삭제
   */
  ipcMain.handle("delete-template", (_event, id) => {
    return templateManager.deleteTemplate(id);
  });

  ipcMain.handle(
    "generate-content",
    async (
      _event,
      { issues, instructions, templateId, category, tags, autoPublish = true }
    ) => {
      try {
        logger.info("AI 콘텐츠 생성 시작...");

        // 동적 자동 모드인 경우 조합 자동 선택
        let dynamicSelection = undefined;
        if (
          templateId === "dynamic-auto" ||
          templateId === "auto-analysis-mode"
        ) {
          const feedContent = issues
            .map((i: any) => `${i.title} ${i.contentSnippet || ""}`)
            .join(" ");
          dynamicSelection = templateManager.autoSelectCombination(feedContent);

          // [Adaptive Logic] 매칭 점수가 낮으면(3.0 미만) 새로운 프롬프트/페르소나 생성
          if (dynamicSelection.matchScore < 3.0) {
            logger.info(
              `매칭 점수 낮음 (${dynamicSelection.matchScore}), 적응형 템플릿 생성 시도...`
            );
            const adaptiveResult = await aiService.generateAdaptiveTemplates(
              feedContent
            );
            if (adaptiveResult) {
              dynamicSelection = adaptiveResult;
            }
          }

          logger.info(
            `자동 선택 - 프롬프트: ${dynamicSelection.prompt?.name}, 페르소나: ${dynamicSelection.persona?.name}`
          );
        }

        const { title, content, imageKeyword, usedPrompt, usedPersona } =
          await aiService.generatePost(
            issues,
            instructions,
            templateId === "auto-analysis-mode" ? "dynamic-auto" : templateId,
            dynamicSelection
          );

        if (!title || !content || content.length < 50) {
          return {
            success: false,
            error: "AI 콘텐츠 생성 실패",
          };
        }

        let finalContent = content;
        const usedImageUrls = new Set<string>();

        if (
          imageKeyword &&
          imageKeyword !== "blog" &&
          imageKeyword.trim() !== ""
        ) {
          try {
            const heroImageUrl = await automation.fetchImageFromGoogle(
              imageKeyword,
              usedImageUrls
            );
            if (heroImageUrl) {
              usedImageUrls.add(heroImageUrl);
              finalContent =
                `<div class="image-container" style="margin-bottom: 40px;"><img src="${heroImageUrl}" alt="${imageKeyword}" /></div>` +
                finalContent;
            }
          } catch (e) {
            logger.warn("대표 이미지 삽입 실패");
          }
        }

        try {
          finalContent = await automation.processImageTags(
            finalContent,
            usedImageUrls
          );
        } catch (e) {
          logger.warn("이미지 태그 처리 실패");
        }

        const filePath = await fileManager.savePost(
          category,
          title,
          finalContent,
          "html"
        );

        if (autoPublish) {
          const loginResult = await automation.login();
          if (!loginResult) {
            return {
              success: false,
              error: "로그인 실패",
              filePath,
              title,
            };
          }

          await automation.writePostFromHtmlFile(filePath, title, category);
          fileManager.markPostAsPublished(filePath);

          return {
            success: true,
            filePath,
            title,
            published: true,
            usedPrompt,
            usedPersona,
          };
        }

        return {
          success: true,
          filePath,
          title,
          published: false,
          usedPrompt,
          usedPersona,
        };
      } catch (error: any) {
        logger.error(`콘텐츠 생성 오류: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle("optimize-template", async (_event, content: string) => {
    try {
      const optimized = await aiService.optimizeTemplate(content);
      return { success: true, content: optimized };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    "generate-template-from-prompt",
    async (_event, { prompt, templateName, templateDescription }) => {
      try {
        const template = await aiService.generateTemplateFromPrompt(
          prompt,
          templateName,
          templateDescription
        );
        // 생성된 템플릿 타입 업데이트
        const savedTemplate = await templateManager.addTemplate({
          ...template,
          templateType: "prompt", // 생성된 템플릿은 기본적으로 prompt
          category: "general",
          tone: "friendly",
          tags: [],
          priority: 50,
          description: template.description || undefined, // description을 선택적으로 처리
        });
        return { success: true, templateId: savedTemplate.id };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle("publish-latest-post", async () => {
    try {
      const loginResult = await automation.login();
      if (!loginResult) {
        return { success: false, error: "로그인 실패" };
      }

      const posts = await fileManager.listPosts();
      const pendingPosts = posts.filter((p: any) => !p.isPublished);

      if (pendingPosts.length === 0) {
        return { success: false, error: "발행 대기 중인 글이 없습니다." };
      }

      const targetPost = pendingPosts[0];
      const content = await fileManager.readPost(targetPost.path);
      const { title } = fileManager.extractTitleAndBody(
        targetPost.path,
        content
      );

      await automation.writePostFromHtmlFile(targetPost.path, title, "");
      fileManager.markPostAsPublished(targetPost.path);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(
    "publish-post",
    async (_event, { filePath, category, tags }) => {
      try {
        const content = await fileManager.readPost(filePath);
        const { title } = fileManager.extractTitleAndBody(filePath, content);

        const loginResult = await automation.login();
        if (!loginResult) {
          return { success: false, error: "로그인 실패" };
        }

        await automation.writePostFromHtmlFile(filePath, title, category);
        fileManager.markPostAsPublished(filePath);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle("test-image-search", async (_event, { text }) => {
    try {
      const keyword = await aiService.extractKeyword(text);
      const imageUrls = await automation.scrapeGoogleImages(keyword);
      return { success: true, keyword, imageUrls, count: imageUrls.length };
    } catch (error: any) {
      return { success: false, error: error.message, imageUrls: [], count: 0 };
    }
  });

  // [스마트 핸들러] 원클릭 발행 핸들러 (RSS/Material 라우팅 추가)
  ipcMain.handle("one-click-publish", async (_event, options) => {
    if (!schedulerInstance) {
      return { success: false, error: "스케줄러가 초기화되지 않았습니다." };
    }

    const mode = options?.mode || "random";

    // 큐 모드일 때 데이터 타입에 따라 분기 처리
    if (
      mode === "queue" &&
      options?.selectedIds &&
      options.selectedIds.length > 0
    ) {
      const firstId = options.selectedIds[0];

      // URL 형식이면 RSS 큐로 처리 (http로 시작)
      if (firstId.startsWith("http")) {
        logger.info(
          `Routing to RSS Queue (count: ${options.selectedIds.length})`
        );
        return await schedulerInstance.processRssQueue(options.selectedIds);
      }
      // 아니면 Material 큐로 처리 (UUID 등)
      else {
        logger.info(
          `Routing to Material Queue (count: ${options.selectedIds.length})`
        );
        return await schedulerInstance.processMaterialQueue(
          options.selectedIds,
          options.homeTheme
        );
      }
    }

    // 랜덤 모드 (기존 동작)
    else {
      return await schedulerInstance.runOneClickPublish({ mode: "random" });
    }
  });

  // [신규] 다중 RSS 피드 발행 핸들러
  ipcMain.handle("publish-multiple-rss", async (_event, { rssLinks }) => {
    if (!schedulerInstance) {
      return { success: false, error: "스케줄러가 초기화되지 않았습니다." };
    }
    return await schedulerInstance.processRssQueue(rssLinks);
  });

  ipcMain.handle("get-scheduler-status", () => {
    if (!schedulerInstance) {
      return {
        enabled: false,
        intervalMinutes: 60,
        lastRun: 0,
        nextRun: null,
        totalPublished: 0,
        isRunning: false,
      };
    }
    return schedulerInstance.getStatus();
  });

  ipcMain.handle(
    "start-scheduler",
    (_event, intervalMinutes: ScheduleInterval) => {
      if (!schedulerInstance) {
        return { success: false, error: "스케줄러가 초기화되지 않았습니다." };
      }
      return { success: schedulerInstance.startSchedule(intervalMinutes) };
    }
  );

  ipcMain.handle("stop-scheduler", () => {
    if (!schedulerInstance) {
      return { success: false, error: "스케줄러가 초기화되지 않았습니다." };
    }
    return { success: schedulerInstance.stopSchedule() };
  });

  // 발행 취소 핸들러
  // 발행 취소 핸들러
  ipcMain.handle("cancel-publish", () => {
    if (!schedulerInstance) {
      return { success: false, error: "스케줄러가 초기화되지 않았습니다." };
    }
    return { success: schedulerInstance.cancelCurrentJob() };
  });

  // 로그인 상태 변경 이벤트 리스너 등록
  ipcMain.handle("get-login-state", async () => {
    const automation = AutomationService.getInstance();
    return automation.getLoginState();
  });

  // ============ 🤖 Local AI 핸들러 추가 (누락된 부분) ============

  // 1. 상태 확인
  ipcMain.handle("local-ai-status", async () => {
    return await localAiService.getStatus();
  });

  // 2. Ollama 설치
  ipcMain.handle("local-ai-install", async (event) => {
    try {
      // 설치 진행 상황을 Renderer로 전송하기 위한 콜백 설정
      const success = await ollamaInstaller.install((progress) => {
        event.sender.send("local-ai-install-progress", progress);
      });

      if (success) {
        const localAiConfig = store.get("localAi");
        store.set("localAi", {
          ...localAiConfig,
          installed: true,
        });

        logger.info("Ollama installation completed and stored");
      }

      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 3. Ollama 서버 시작
  ipcMain.handle("local-ai-start", async () => {
    try {
      await ollamaInstaller.startServer();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 4. Ollama 서버 중지
  ipcMain.handle("local-ai-stop", async () => {
    try {
      await ollamaInstaller.stopServer();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 5. 모델 Pull (다운로드)
  ipcMain.handle("local-ai-pull-model", async (event, modelName) => {
    try {
      logger.info(`IPC: Starting pull for model ${modelName}`);

      const result = await localAiService.pullModel(
        modelName,
        (progressData) => {
          // 진행 상황을 renderer로 전송
          logger.info(
            `Sending progress to renderer: ${JSON.stringify(progressData)}`
          );

          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send("local-ai-model-progress", progressData);
          }
        }
      );

      logger.info(`Pull result for ${modelName}: ${JSON.stringify(result)}`);
      return result;
    } catch (error: any) {
      logger.error(`Pull handler error: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // 6. 모델 삭제
  ipcMain.handle("local-ai-delete-model", async (_event, modelName) => {
    return await localAiService.deleteModel(modelName);
  });

  // 7. 채팅/생성 (Generate/Chat)
  ipcMain.handle("local-ai-chat", async (_event, { messages, options }) => {
    return await localAiService.chat(messages, options);
  });

  // (Optional) Generate 단독 호출이 필요하다면 추가
  ipcMain.handle("local-ai-generate", async (_event, { prompt, options }) => {
    // chat 인터페이스를 재사용하거나 별도 generate 메서드 호출
    return await localAiService.generate(prompt, options);
  });

  // 8. 시스템 정보 조회
  ipcMain.handle("local-ai-system-info", async () => {
    return await localAiService.getSystemInfo();
  });

  // 9. 시스템 정보 새로고침
  ipcMain.handle("local-ai-refresh-system-info", async () => {
    return await localAiService.refreshSystemInfo();
  });

  // 10. 사용 가능한 모델 목록 조회
  ipcMain.handle("local-ai-list-available-models", async () => {
    return await localAiService.listAvailableModels();
  });

  // 11. 버전 정보 확인
  ipcMain.handle("local-ai-check-update", async () => {
    return await ollamaInstaller.checkForUpdate();
  });

  // 12. 업데이트 실행
  ipcMain.handle("local-ai-update", async (event) => {
    try {
      const success = await ollamaInstaller.update((progress) => {
        event.sender.send("local-ai-install-progress", progress);
      });

      if (success) {
        await ollamaInstaller.startServer();
      }

      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ============================================================
  // [신규] 시리즈 생성 상세 진행 이벤트 핸들러
  // ============================================================

  ipcMain.handle("get-series-generation-status", async () => {
    // 현재 진행 중인 시리즈 생성 상태 반환 (향후 확장용)
    return {
      isGenerating: false,
      currentPart: 0,
      totalParts: 0,
      currentTitle: "",
    };
  });

  // ============================================================
  // [신규] 소재 관리 핸들러
  // ============================================================

  /**
   * 소재 추가
   */
  ipcMain.handle("add-material", async (_event, data) => {
    try {
      const materials = store.get("materials") || [];
      // 중복 체크
      if (materials.some((m: any) => m.value === data.value)) {
        return { success: false, error: "이미 리스트에 존재하는 소재입니다." };
      }

      const newMaterial = {
        id: uuidv4(),
        type: data.type,
        value: data.value,
        title: data.title || "제목 없음",
        category: data.category || "General",
        tags: data.tags || [],
        addedAt: Date.now(),
        status: "pending",
      };

      store.set("materials", [...materials, newMaterial]);
      logger.info(`소재 추가됨: ${newMaterial.title} (${newMaterial.type})`);
      return { success: true, message: "소재가 저장되었습니다." };
    } catch (e: any) {
      logger.error(`소재 추가 실패: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  /**
   * 소재 목록 조회
   */
  ipcMain.handle("get-materials", () => {
    return store.get("materials") || [];
  });

  /**
   * 소재 삭제
   */
  ipcMain.handle("delete-material", (_event, id) => {
    try {
      const materials = store.get("materials") || [];
      store.set(
        "materials",
        materials.filter((m: any) => m.id !== id)
      );
      logger.info(`소재 삭제됨: ${id}`);
      return { success: true };
    } catch (e: any) {
      logger.error(`소재 삭제 실패: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // [신규] 작업 큐 관련 핸들러
  // ============================================================

  /**
   * 작업 큐 상태 조회
   */
  ipcMain.handle("get-job-queue-status", () => {
    const jobs = jobQueue.getAllJobs();
    return {
      total: jobs.length,
      pending: jobQueue.getPendingCount(),
      processing: jobQueue.getProcessingCount(),
      completed: jobQueue.getCompletedCount(),
      failed: jobQueue.getFailedCount(),
      jobs: jobs.filter(
        (j) => j.status === "PENDING" || j.status === "PROCESSING"
      ),
    };
  });

  /**
   * 모든 작업 조회
   */
  ipcMain.handle("get-all-jobs", () => {
    return jobQueue.getAllJobs();
  });

  /**
   * 특정 상태의 작업만 조회
   */
  ipcMain.handle("get-jobs-by-status", (_event, status) => {
    return jobQueue.getJobsByStatus(status);
  });

  /**
   * 작업 삭제
   */
  ipcMain.handle("delete-job", (_event, id) => {
    try {
      jobQueue.deleteJob(id);
      return { success: true };
    } catch (e: any) {
      logger.error(`작업 삭제 실패: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  /**
   * 작업 큐 초기화
   */
  ipcMain.handle("clear-job-queue", () => {
    try {
      jobQueue.clearAllJobs();
      logger.info("작업 큐 초기화됨");
      return { success: true };
    } catch (e: any) {
      logger.error(`작업 큐 초기화 실패: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  /**
   * 실패한 작업 재시도 (PENDING 상태로 변경)
   */
  ipcMain.handle("retry-failed-jobs", () => {
    try {
      const jobs = jobQueue.getJobsByStatus("FAILED");
      jobs.forEach((job) => {
        jobQueue.updateJobStatus(job.id, "PENDING");
      });
      logger.info(`${jobs.length}개 실패 작업 재시용됨`);
      return { success: true, count: jobs.length };
    } catch (e: any) {
      logger.error(`작업 재시도 실패: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  /**
   * 오래된 작업 정리
   */
  ipcMain.handle("cleanup-stale-jobs", (_event, retentionMs = 86400000) => {
    try {
      jobQueue.cleanupStaleJobs(retentionMs);
      return { success: true };
    } catch (e: any) {
      logger.error(`작업 정리 실패: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  // ============================================================
  // [NEW] 네이버 관련 핸들러
  // ============================================================

  /**
   * 네이버 로그인 핸들러
   */
  // TODO: loginNaver 메서드가 AutomationService에 없음 - 구현 필요
  // ipcMain.handle("start-naver-login", async () => {
  //   return await automation.loginNaver();
  // });

  // ============================================================
  // [NEW] RSS 내보내기/불러오기 핸들러
  // ============================================================

  /**
   * RSS 피드 내보내기 (.md 파일 저장)
   */
  ipcMain.handle("export-rss-feeds", async (_event, content: string) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: "RSS 피드 내보내기",
        defaultPath: "rss_feeds.md",
        filters: [{ name: "Markdown Files", extensions: ["md", "txt"] }],
      });

      if (canceled || !filePath) {
        return { success: false, error: "취소됨" };
      }

      await fs.writeFile(filePath, content, "utf-8");
      return { success: true, filePath };
    } catch (error: any) {
      logger.error(`RSS Export failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  /**
   * RSS 피드 가져오기 (.md 파일 읽기)
   */
  ipcMain.handle("import-rss-feeds", async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "RSS 피드 불러오기",
        properties: ["openFile"],
        filters: [{ name: "Markdown/Text Files", extensions: ["md", "txt"] }],
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: "취소됨" };
      }

      const content = await fs.readFile(filePaths[0], "utf-8");
      return { success: true, content };
    } catch (error: any) {
      logger.error(`RSS Import failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  /**
   * 다중 플랫폼 발행 핸들러 (UsageManager 적용)
   */
  ipcMain.handle(
    "publish-post-multi",
    async (_event, { filePath, platforms, category, tags }) => {
      const fileManager = new FileManager();
      const settings = store.get("settings");
      const results = {
        tistory: false,
        naver: false,
        reservation: false,
        reservationDate: null as string | null,
        errors: [] as string[],
      };

      // [CHECK] 날짜 변경 체크 (데이터 정합성 보장)
      UsageManager.ensureStructureAndDate();

      try {
        const content = await fileManager.readPost(filePath);
        const { title, body } = fileManager.extractTitleAndBody(
          filePath,
          content
        );

        // 1. 티스토리 발행
        if (platforms.includes("tistory")) {
          const tistoryId = settings.blogName;

          if (!tistoryId) {
            results.errors.push("티스토리 설정(블로그 이름)이 없습니다.");
          } else {
            try {
              await automation.login(); // 선 로그인 시도

              // [CHECK] 한도 체크
              const canPublishNow = UsageManager.checkLimit(
                "tistory",
                tistoryId
              );
              let reservationDate: Date | undefined = undefined;

              if (!canPublishNow) {
                logger.info(
                  `티스토리 한도 초과 (${tistoryId}). 예약 발행으로 전환합니다.`
                );

                // 내일 오전 7~10시 사이 랜덤 예약
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(
                  7 + Math.floor(Math.random() * 3),
                  Math.floor(Math.random() * 60),
                  0,
                  0
                );

                reservationDate = tomorrow;
                results.reservation = true;
                results.reservationDate = tomorrow.toLocaleString();
              }

              // 발행 실행 (즉시 또는 예약)
              await automation.writePostFromHtmlFile(
                filePath,
                title,
                category,
                undefined,
                reservationDate
              );

              results.tistory = true;

              // [INCREMENT] 즉시 발행인 경우에만 카운트 증가
              if (!reservationDate) {
                UsageManager.incrementUsage("tistory", tistoryId);
              }
            } catch (e: any) {
              logger.error(`Tistory Publish Error: ${e.message}`);
              results.errors.push(`티스토리: ${e.message}`);
            }
          }
        }

        // 2. 네이버 발행
        if (platforms.includes("naver")) {
          try {
            if (!settings.naverEnabled) {
              throw new Error("네이버 발행이 비활성화되어 있습니다.");
            }

            const blogId = settings.naverBlogId;
            if (!blogId) {
              throw new Error("네이버 블로그 ID가 설정되지 않았습니다.");
            }

            // [CHECK] 한도 체크
            if (!UsageManager.checkLimit("naver", blogId)) {
              throw new Error(
                `네이버 일일 발행 한도(100개)를 초과했습니다. (${blogId})`
              );
            }

            logger.info(`네이버 발행 시작: ${blogId} / ${title}`);

            const targetCategory = category || "IT";

            await automation.writeToNaver(blogId, title, body, targetCategory);

            // [INCREMENT] 카운트 증가
            UsageManager.incrementUsage("naver", blogId);

            results.naver = true;
            logger.info("네이버 발행 성공!");
          } catch (e: any) {
            logger.error(`Naver Publish Error: ${e.message}`);
            results.errors.push(`네이버: ${e.message}`);
          }
        }

        // 성공 여부 마킹
        if (results.tistory || results.naver) {
          fileManager.markPostAsPublished(filePath);
        }

        return { success: true, results };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  /**
   * 대시보드 통계 API 수정 (UsageManager 적용)
   * 현재 설정된 계정의 카운트만 필터링하여 반환
   */
  ipcMain.handle("get-daily-stats", () => {
    const settings = store.get("settings");
    const tistoryId = settings.blogName || "";
    const naverId = settings.naverBlogId || "";

    // UsageManager가 데이터 정합성(날짜 등)을 먼저 체크함
    const stats = UsageManager.getAllStats();

    return {
      // 현재 활성화된 블로그의 카운트만 보냄 (UI 단순화)
      tistoryCount: tistoryId ? stats.tistory[tistoryId] || 0 : 0,
      naverCount: naverId ? stats.naver[naverId] || 0 : 0,
      lastResetDate: stats.lastResetDate,
    };
  });

  // ============================================================
  // [NEW] 홈주제 선택 핸들러
  // ============================================================

  /**
   * 홈주제 목록 조회
   */
  ipcMain.handle("get-home-themes", () => {
    // 티스토리에서 제공하는 홈주제 목록 반환
    return [
      "선택 안 함",
      // 여행·맛집
      "- 국내여행",
      "- 해외여행",
      "- 캠핑·등산",
      "- 맛집",
      "- 카페·디저트",
      // 리빙·스타일
      "- 생활정보",
      "- 인테리어",
      "- 패션·뷰티",
      "- 요리",
      // 가족·연애
      "- 일상",
      "- 연애·결혼",
      "- 육아",
      "- 해외생활",
      "- 군대",
      "- 반려동물",
      // 직장·자기계발
      "- IT 인터넷",
      "- 모바일",
      "- 과학",
      "- IT 제품리뷰",
      "- 경영·직장",
      // 시사·지식
      "- 정치",
      "- 사회",
      "- 교육",
      "- 국제",
      "- 경제",
      // 도서·창작
      "- 책",
      "- 창작",
      // 엔터테인먼트
      "- TV",
      "- 스타",
      "- 영화",
      "- 음악",
      "- 만화·애니",
      "- 공연·전시·축제",
      // 취미·건강
      "- 취미",
      "- 건강",
      "- 스포츠일반",
      "- 축구",
      "- 야구",
      "- 농구",
      "- 배구",
      "- 골프",
      "- 자동차",
      "- 게임",
      "- 사진",
    ];
  });

  /**
   * 홈주제 선택 (발행 전)
   * 글을 발행할 때 홈주제를 선택합니다.
   */
  ipcMain.handle(
    "select-home-theme-before-publish",
    async (_event, { title, content, selectedTheme }) => {
      try {
        const loginResult = await automation.login();
        if (!loginResult) {
          return { success: false, error: "로그인 실패" };
        }

        // 홈주제 선택 실행 (AutomationService의 내부 메서드 활용)
        // 현재 writePostFromHtmlFile 내에서 자동으로 호출되므로
        // 별도의 홈주제 선택은 에디터에 직접 접근하여 수행해야 함

        // 본문 내용에서 추출 (에디터가 아직 초기화되지 않았을 경우)
        const editorContent = content || "";

        // 홈주제 선택 결과 반환
        return {
          success: true,
          theme: selectedTheme,
        };
      } catch (e: any) {
        logger.error(`홈주제 선택 실패: ${e.message}`);
        return { success: false, error: e.message };
      }
    }
  );

  /**
   * 글 소재 랜덤 선택 시 홈주제 반환 (AI 분석)
   */
  ipcMain.handle(
    "get-suggested-home-theme",
    async (_event, { title, content }) => {
      try {
        // AI 분석으로 적절한 홈주제 추천
        // 현재는 키워드 기반 매칭만 지원
        // 추후 AI 분석으로 개선 가능

        // HOME_TOPIC_KEYWORDS를 사용하여 분석
        const fullText = `${title} ${content}`.toLowerCase();

        // 각 홈주제별 점수 계산
        const { HOME_TOPIC_KEYWORDS } = await import(
          "../config/tistorySelectors"
        );
        const scores: Map<string, number> = new Map();

        const themes = [
          "- IT 인터넷",
          "- 모바일",
          "- 과학",
          "- IT 제품리뷰",
          "- 경영·직장",
          "- 정치",
          "- 사회",
          "- 교육",
          "- 국제",
          "- 경제",
          "- 책",
          "- 창작",
          "- TV",
          "- 스타",
          "- 영화",
          "- 음악",
          "- 만화·애니",
          "- 공연·전시·축제",
          "- 취미",
          "- 건강",
          "- 스포츠일반",
          "- 축구",
          "- 야구",
          "- 농구",
          "- 배구",
          "- 골프",
          "- 자동차",
          "- 게임",
          "- 사진",
          "- 국내여행",
          "- 해외여행",
          "- 캠핑·등산",
          "- 맛집",
          "- 카페·디저트",
          "- 생활정보",
          "- 인테리어",
          "- 패션·뷰티",
          "- 요리",
          "- 일상",
          "- 연애·결혼",
          "- 육아",
          "- 해외생활",
          "- 군대",
          "- 반려동물",
        ];

        for (const [themeKey, keywords] of Object.entries(
          HOME_TOPIC_KEYWORDS
        )) {
          const cleanKey = themeKey.replace(/^-\s*/, "").trim();
          let score = 0;

          for (const keyword of keywords) {
            const regex = new RegExp(keyword.toLowerCase(), "gi");
            const matches = fullText.match(regex);
            if (matches) {
              score += matches.length;
            }
          }

          if (score > 0) {
            scores.set(cleanKey, score);
          }
        }

        // 점수가 가장 높은 홈주제 선택
        if (scores.size > 0) {
          const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
          const bestTheme = sorted[0]?.[0];

          if (bestTheme && themes.includes(`- ${bestTheme}`)) {
            return { success: true, theme: `-${bestTheme}` };
          }
        }

        // 매칭 실패 시 기본값
        return { success: true, theme: "- IT 인터넷" };
      } catch (e: any) {
        logger.error(`홈주제 추천 실패: ${e.message}`);
        return { success: false, error: e.message };
      }
    }
  );
};

// ============================================================
// [NEW] 스마트 리트(Smart Retry)를 위한 핸들러
// ============================================================

/**
 * 마지막 배치 선택 저장
 */
ipcMain.handle("save-last-batch-selection", async (_event, ids) => {
  try {
    const settings = store.get("settings");
    const selection: LastBatchSelection = {
      ids,
      timestamp: Date.now(),
    };

    if (settings) {
      settings.lastBatchSelection = selection;
      store.set("settings", settings);
      logger.info(`마지막 배치 저장됨 (${ids.length}개)`);
    } else {
      store.set("settings", { lastBatchSelection: selection });
    }

    return { success: true };
  } catch (e: any) {
    logger.error(`배치 저장 실패: ${e.message}`);
    return { success: false, error: e.message };
  }
});

/**
 * 마지막 배치 선택 불러오기
 */
ipcMain.handle("get-last-batch-selection", async () => {
  const settings = store.get("settings");
  return settings?.lastBatchSelection || null;
});

// [신규] 앱 종료 시 스케줄러 리소스 정리 함수
export const cleanupScheduler = () => {
  if (schedulerInstance) {
    console.log("Cleaning up scheduler resources...");
    schedulerInstance.stopSchedule(); // 여기서 powerSaveBlocker.stop()이 호출됨
  }
};
