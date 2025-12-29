import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings: any) =>
    ipcRenderer.invoke("save-settings", settings),

  startLogin: () => ipcRenderer.invoke("start-login"),
  startWrite: (data: any) => ipcRenderer.invoke("start-write", data),

  // [신규] 파일 객체에서 경로 추출 (보안상 렌더러에서 직접 접근 불가할 경우 대비)
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  fetchFeeds: (params: { days: number; forceRefresh: boolean }) =>
    ipcRenderer.invoke("fetch-feeds", params),
  fetchRecentIssues: (params: { limit: number }) =>
    ipcRenderer.invoke("fetch-recent-issues", params),

  listModels: (apiKey: string, provider?: string, showAll?: boolean) =>
    ipcRenderer.invoke("list-models", apiKey, provider, showAll),
  listPosts: () => ipcRenderer.invoke("list-posts"),
  readPost: (filePath: string) => ipcRenderer.invoke("read-post", filePath),

  // ============================================================
  // 템플릿 관련 (확장)
  // ============================================================

  /** 모든 템플릿 조회 */
  listTemplates: () => ipcRenderer.invoke("list-templates"),

  /** [신규] 타입별 템플릿 조회 */
  listTemplatesByType: (type: "layout" | "prompt" | "persona") =>
    ipcRenderer.invoke("list-templates-by-type", type),

  /** [신규] 프롬프트만 조회 */
  getPrompts: () => ipcRenderer.invoke("get-prompts"),

  /** [신규] 페르소나만 조회 */
  getPersonas: () => ipcRenderer.invoke("get-personas"),

  /** [신규] 레이아웃만 조회 */
  getLayouts: () => ipcRenderer.invoke("get-layouts"),

  /** 피드 기반 프롬프트/페르소나 자동 선택 */
  autoSelectCombination: (feedContent: string) =>
    ipcRenderer.invoke("auto-select-combination", feedContent),

  /** 템플릿 추가 */
  addTemplate: (template: any) => ipcRenderer.invoke("add-template", template),

  /** 템플릿 수정 */
  updateTemplate: (id: string, updates: any) =>
    ipcRenderer.invoke("update-template", { id, updates }),

  /** 템플릿 삭제 */
  deleteTemplate: (id: string) => ipcRenderer.invoke("delete-template", id),

  /** 템플릿 AI 최적화 */
  optimizeTemplate: (content: string) =>
    ipcRenderer.invoke("optimize-template", content),

  /** 프롬프트로 템플릿 생성 */
  generateTemplateFromPrompt: (
    prompt: string,
    templateName: string,
    templateDescription?: string
  ) =>
    ipcRenderer.invoke("generate-template-from-prompt", {
      prompt,
      templateName,
      templateDescription,
    }),

  // 콘텐츠 생성
  generateContent: (data: any) => ipcRenderer.invoke("generate-content", data),

  // 링크 분석 및 글 생성
  processLinkAndGenerate: (data: { url: string; category: string }) =>
    ipcRenderer.invoke("process-link-and-generate", data),

  // 발행
  publishLatestPost: () => ipcRenderer.invoke("publish-latest-post"),
  publishPost: (filePath: string, category: string) =>
    ipcRenderer.invoke("publish-post", { filePath, category }),

  // ============================================================
  // [NEW] 네이버 관련 API
  // ============================================================

  /**
   * 네이버 로그인
   */
  startNaverLogin: () => ipcRenderer.invoke("start-naver-login"),

  /**
   * 다중 플랫폼 발행
   */
  publishPostMulti: (data: {
    filePath: string;
    platforms: string[];
    category: string;
    tags?: string[];
  }) => ipcRenderer.invoke("publish-post-multi", data),

  // 이미지 테스트
  testImageSearch: (params: { text: string }) =>
    ipcRenderer.invoke("test-image-search", params),

  // 원클릭 발행 (옵션 추가)
  oneClickPublish: (options?: {
    mode: "random" | "queue";
    selectedIds?: string[];
    homeTheme?: string;
  }) => ipcRenderer.invoke("one-click-publish", options),

  // ============================================================
  // 스케줄러 제어
  // ============================================================
  getSchedulerStatus: () => ipcRenderer.invoke("get-scheduler-status"),
  startScheduler: (intervalMinutes: number) =>
    ipcRenderer.invoke("start-scheduler", intervalMinutes),
  stopScheduler: () => ipcRenderer.invoke("stop-scheduler"),

  // ============================================================
  // 발행 취소
  // ============================================================
  cancelPublish: () => ipcRenderer.invoke("cancel-publish"),
  getLoginState: () => ipcRenderer.invoke("get-login-state"),

  // ============================================================
  // 로컬 AI 제어
  // ============================================================
  localAiStatus: () => ipcRenderer.invoke("local-ai-status"),
  localAiInstall: () => ipcRenderer.invoke("local-ai-install"),
  localAiStart: () => ipcRenderer.invoke("local-ai-start"),
  localAiStop: () => ipcRenderer.invoke("local-ai-stop"),
  localAiPullModel: (modelName: string) =>
    ipcRenderer.invoke("local-ai-pull-model", modelName),
  localAiDeleteModel: (modelName: string) =>
    ipcRenderer.invoke("local-ai-delete-model", modelName),
  localAiGenerate: (prompt: string, options?: any) =>
    ipcRenderer.invoke("local-ai-generate", { prompt, options }),
  localAiChat: (messages: any[], options?: any) =>
    ipcRenderer.invoke("local-ai-chat", { messages, options }),

  // 시스템 정보 관련 API 추가
  localAiSystemInfo: () => ipcRenderer.invoke("local-ai-system-info"),
  localAiRefreshSystemInfo: () =>
    ipcRenderer.invoke("local-ai-refresh-system-info"),
  localAiListAvailableModels: () =>
    ipcRenderer.invoke("local-ai-list-available-models"),
  localAiCheckUpdate: () => ipcRenderer.invoke("local-ai-check-update"),
  localAiUpdate: () => ipcRenderer.invoke("local-ai-update"),

  onLocalAiInstallProgress: (callback: (event: any, progress: any) => void) => {
    const subscription = (_event: any, progress: any) =>
      callback(_event, progress);
    ipcRenderer.on("local-ai-install-progress", subscription);
    return () =>
      ipcRenderer.removeListener("local-ai-install-progress", subscription);
  },

  onLocalAiModelProgress: (callback: (event: any, data: any) => void) => {
    console.log("Registering local-ai-model-progress listener");

    const subscription = (_event: any, data: any) => {
      console.log("preload: Received model progress:", data);
      callback(_event, data);
    };

    ipcRenderer.on("local-ai-model-progress", subscription);

    return () => {
      console.log("Removing local-ai-model-progress listener");
      ipcRenderer.removeListener("local-ai-model-progress", subscription);
    };
  },

  onLogMessage: (callback: (event: any, message: string) => void) => {
    const subscription = (_event: any, message: string) =>
      callback(_event, message);
    ipcRenderer.on("log-message", subscription);
    return () => ipcRenderer.removeListener("log-message", subscription);
  },

  onPublishStageChange: (callback: (event: any, data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(_event, data);
    ipcRenderer.on("publish-stage-change", subscription);
    return () =>
      ipcRenderer.removeListener("publish-stage-change", subscription);
  },

  onLoginStateChange: (callback: (event: any, data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(_event, data);
    ipcRenderer.on("login-state-change", subscription);
    return () => ipcRenderer.removeListener("login-state-change", subscription);
  },

  // ============================================================
  // [NEW] 시리즈 생성 관련 API
  // ============================================================

  /**
   * 파일 업로드 및 시리즈 생성
   */
  uploadAndProcessFile: (data: {
    filePath: string;
    title: string;
    tags: string[];
    category: string;
    autoPublish: boolean;
    options?: {
      useAiImage: boolean;
    };
  }) => ipcRenderer.invoke("upload-and-process-file", data),

  /**
   * 파일 처리 진행상황 리스너
   */
  onFileProcessProgress: (callback: (event: any, msg: string) => void) => {
    const subscription = (_event: any, msg: string) => callback(_event, msg);
    ipcRenderer.on("file-process-progress", subscription);
    return () =>
      ipcRenderer.removeListener("file-process-progress", subscription);
  },

  /**
   * 시리즈 생성 진행 리스너
   */
  onSeriesGenerationProgress: (
    callback: (
      event: any,
      data: {
        partNumber: number;
        totalParts: number;
        currentTitle: string;
        subtitle: string;
        stage:
          | "analyzing"
          | "generating"
          | "saving"
          | "publishing"
          | "complete";
      }
    ) => void
  ) => {
    const subscription = (_event: any, data: any) => callback(_event, data);
    ipcRenderer.on("series-generation-progress", subscription);
    return () =>
      ipcRenderer.removeListener("series-generation-progress", subscription);
  },

  /**
   * 시리즈 생성 상태 조회
   */
  getSeriesGenerationStatus: () =>
    ipcRenderer.invoke("get-series-generation-status"),

  // ============================================================
  // 브라우저 다운로드
  // ============================================================
  onBrowserDownloadStart: (callback: () => void) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on("browser-download-start", subscription);
    return () => ipcRenderer.removeAllListeners("browser-download-start");
  },
  onBrowserDownloadProgress: (callback: (event: any, data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(_event, data);
    ipcRenderer.on("browser-download-progress", subscription);
    return () => ipcRenderer.removeAllListeners("browser-download-progress");
  },
  onBrowserDownloadComplete: (callback: () => void) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on("browser-download-complete", subscription);
    return () => ipcRenderer.removeAllListeners("browser-download-complete");
  },
  onBrowserDownloadError: (callback: (event: any, msg: string) => void) => {
    const subscription = (_event: any, msg: string) => callback(_event, msg);
    ipcRenderer.on("browser-download-error", subscription);
    return () => ipcRenderer.removeAllListeners("browser-download-error");
  },

  // ============================================================
  // [NEW] RSS 내보내기/불러오기
  // ============================================================
  exportRssFeeds: (content: string) =>
    ipcRenderer.invoke("export-rss-feeds", content),
  importRssFeeds: () => ipcRenderer.invoke("import-rss-feeds"),

  // ============================================================
  // [NEW] 일일 통계 조회 API
  // ============================================================

  /**
   * 일일 발행량 통계 조회
   */
  getDailyStats: () => ipcRenderer.invoke("get-daily-stats"),

  // ============================================================
  // [NEW] 소재 관리 API
  // ============================================================
  addMaterial: (data: {
    type: "link" | "file" | "text";
    value: string;
    title: string;
    category?: string;
    tags?: string[];
  }) => ipcRenderer.invoke("add-material", data),

  getMaterials: () => ipcRenderer.invoke("get-materials"),

  deleteMaterial: (id: string) => ipcRenderer.invoke("delete-material", id),

  // ============================================================
  // [NEW] 홈주제 선택 관련 API
  // ============================================================
  getHomeThemes: () => ipcRenderer.invoke("get-home-themes"),
  selectHomeThemeBeforePublish: (data: {
    title: string;
    content: string;
    selectedTheme: string;
  }) => ipcRenderer.invoke("select-home-theme-before-publish", data),
  getSuggestedHomeTheme: (data: { title: string; content: string }) =>
    ipcRenderer.invoke("get-suggested-home-theme", data),
});
