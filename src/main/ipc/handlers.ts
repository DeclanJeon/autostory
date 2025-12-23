import { ipcMain } from "electron";
import { AutomationService } from "../services/AutomationService";
import { RssService } from "../services/RssService";
import { AiService } from "../services/AiService";
import { FileManager } from "../services/FileManager";
import { TemplateManager } from "../services/TemplateManager";
import {
  SchedulerService,
  ScheduleInterval,
} from "../services/SchedulerService";
import { logger } from "../utils/logger";
import store from "../config/store";
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

  ipcMain.handle("save-settings", (_event, settings) => {
    store.set("settings", settings);
    return { success: true };
  });

  ipcMain.handle("get-settings", () => {
    return store.get("settings");
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
    async (_event, { title, content, category }) => {
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
          const loginResult = await automation.login();

          if (!loginResult) {
            throw new Error("로그인 실패: 자동 발행을 중단합니다.");
          }

          for (let i = 0; i < generatedFiles.length; i++) {
            const path = generatedFiles[i];
            const partNum = i + 1;
            const total = generatedFiles.length;

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
      { issues, instructions, templateId, category, autoPublish = true }
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

  ipcMain.handle("publish-post", async (_event, { filePath, category }) => {
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
  });

  ipcMain.handle("test-image-search", async (_event, { text }) => {
    try {
      const keyword = await aiService.extractKeyword(text);
      const imageUrls = await automation.scrapeGoogleImages(keyword);
      return { success: true, keyword, imageUrls, count: imageUrls.length };
    } catch (error: any) {
      return { success: false, error: error.message, imageUrls: [], count: 0 };
    }
  });

  ipcMain.handle("one-click-publish", async () => {
    if (!schedulerInstance) {
      return { success: false, error: "스케줄러가 초기화되지 않았습니다." };
    }
    return await schedulerInstance.runOneClickPublish();
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
  ipcMain.handle("cancel-publish", () => {
    if (!schedulerInstance) {
      return { success: false, error: "스케줄러가 초기화되지 않았습니다." };
    }
    return schedulerInstance.cancelCurrentPublish();
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
};
