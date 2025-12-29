// 완전한 타입 정의 파일

/**
 * 소재 아이템 타입 정의
 */
export interface MaterialItem {
  id: string;
  type: "link" | "file" | "text" | "post"; // [NEW] post 타입 추가
  value: string; // URL, 파일 경로, 또는 텍스트 내용
  title: string;
  addedAt: number;
  category: string;
  tags: string[];
  status: "pending" | "processed" | "failed";
}

export type TemplateType = "layout" | "prompt" | "persona";

export type TemplateCategory =
  | "tech"
  | "business"
  | "lifestyle"
  | "news"
  | "tutorial"
  | "review"
  | "general";

export type WritingTone =
  | "formal"
  | "casual"
  | "humorous"
  | "analytical"
  | "enthusiastic"
  | "professional"
  | "friendly";

/**
 * 확장된 템플릿 인터페이스
 */
export interface ExtendedTemplate {
  id: string;
  name: string;
  content: string;
  description: string;
  templateType: TemplateType;
  category?: TemplateCategory;
  tags?: string[];
  tone?: WritingTone;
  isDefault?: boolean;
  priority?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 기존 Template 인터페이스 (하위 호환성)
 */
export interface Template {
  id: string;
  name: string;
  content: string;
  description?: string;
}

/**
 * 자동 선택 결과
 */
export interface AutoSelectResult {
  prompt: ExtendedTemplate | null;
  persona: ExtendedTemplate | null;
  matchScore: number;
  matchReason: string;
}

export interface Settings {
  blogName: string;
  writeRedirectUrl: string;
  aiApiKey: string;
  aiProvider: "gemini" | "openrouter" | "local";
  aiModel?: string;
  localAiModel: string;
  localAiEnabled: boolean;
  openrouterApiKey?: string;
  rssUrls: string[];
  targetLanguage?: string;
  unsplashAccessKey?: string;
  pexelsApiKey?: string;
  // [NEW] 네이버 블로그 설정
  naverBlogId: string;
  naverEnabled: boolean;
  // [NEW] 티스토리 블로그 설정
  tistoryEnabled: boolean;
}

export interface PromptHistory {
  id: string;
  timestamp: number;
  issues: Array<{
    title: string;
    source: string;
    contentSnippet: string;
  }>;
  instructions: string;
  templateId: string;
  templateUsed: string;
  usedPrompt?: string;
  usedPersona?: string;
  generatedContent: {
    title: string;
    content: string;
  };
  category?: string;
}

export interface RecentIssue {
  title: string;
  source: string;
  contentSnippet: string;
  link: string;
}

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

export interface PublishProgress {
  stage: PublishStage;
  message: string;
  canCancel: boolean;
  startTime?: number;
}

export interface SchedulerStatus {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: number;
  nextRun: number | null;
  totalPublished: number;
  isRunning: boolean;
  currentStage?: PublishStage;
  currentMessage?: string;
}

export type ModelCategory =
  | "general"
  | "coding"
  | "creative"
  | "multilingual"
  | "vision"
  | "embedding"
  | "specialized";

export interface ModelInfo {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  recommended: boolean;
  category: ModelCategory;
  parameters: string;
  contextLength: number;
  minRamGB: number;
  minVramGB: number;
  quantization: string;
  languages: string[];
  useCases: string[];
}

export interface ModelWithRecommendation extends ModelInfo {
  isInstalled: boolean;
  recommendationScore: number;
  recommendationReason: string;
  installedPath?: string;
  installedSize?: string;
}

export interface SystemInfo {
  totalRamGB: number;
  freeRamGB: number;
  cpuCores: number;
  cpuModel: string;
  platform: string;
  arch: string;
  gpu: GpuInfo | null;
}

export interface GpuInfo {
  name: string;
  vramGB: number;
  driver: string;
  cudaAvailable: boolean;
}

export interface LocalAiStatus {
  installed: boolean;
  running: boolean;
  installedModels: string[];
  defaultModel: string;
  supportedModels: ModelWithRecommendation[];
  systemInfo: SystemInfo;
  modelsPath?: string;
}

export interface InstallProgress {
  stage:
    | "checking"
    | "downloading"
    | "extracting"
    | "verifying"
    | "complete"
    | "error";
  progress: number;
  message: string;
}

export interface VersionInfo {
  current: string | null;
  latest: string;
  updateAvailable: boolean;
}

export interface ModelProgress {
  modelName: string;
  progress: number;
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: boolean;
}

/**
 * 콘텐츠 생성 결과
 */
export interface GenerateContentResult {
  success: boolean;
  filePath?: string;
  title?: string;
  subtitle?: string; // [최종]
  published?: boolean;
  usedPrompt?: string;
  usedPersona?: string;
  homeTheme?: string; // [NEW] 홈주제
  error?: string;
}

/**
 * 원클릭 발행 옵션
 */
export interface OneClickPublishOptions {
  mode: "random" | "queue";
  selectedIds?: string[];
  homeTheme?: string;
}

/**
 * 원클릭 발행 결과
 * [수정됨] message 필드 추가 (일괄 처리 결과 요약용)
 */
export interface OneClickPublishResult {
  success: boolean;
  title?: string;
  usedPrompt?: string;
  usedPersona?: string;
  message?: string; // [NEW] 일괄 처리 완료 메시지
  error?: string;
}

/**
 * 시리즈 생성 결과
 */
export interface SeriesGenerationResult {
  success: boolean;
  files?: string[];
  titles?: Array<{
    partNumber: number;
    fullTitle: string;
    baseTitle: string;
    subtitle: string;
  }>;
  publishResults?: Array<{
    partNumber: number;
    title: string;
    success: boolean;
    error?: string;
  }>;
  published?: boolean;
  error?: string;
}

/**
 * 시리즈 생성 진행 상태
 */
export interface SeriesProgress {
  partNumber: number;
  totalParts: number;
  currentTitle: string;
  subtitle: string;
  stage: "analyzing" | "generating" | "saving" | "publishing" | "complete";
}

/**
 * 시리즈 생성 상태
 */
export interface SeriesGenerationStatus {
  isGenerating: boolean;
  currentPart: number;
  totalParts: number;
  currentTitle: string;
}

declare global {
  interface Window {
    electronAPI: {
      // 설정
      getSettings: () => Promise<Settings>;
      saveSettings: (settings: Settings) => Promise<{ success: boolean }>;

      // 인증
      startLogin: () => Promise<boolean>;
      checkAuthStatus: () => Promise<boolean>;
      getLoginState: () => Promise<
        "logged-in" | "logged-out" | "logging-in" | "unknown"
      >;

      // 글쓰기
      startWrite: (data: any) => Promise<any>;

      // RSS 피드
      fetchFeeds: (params: {
        days: number;
        forceRefresh: boolean;
      }) => Promise<any[]>;
      fetchRecentIssues: (params: { limit: number }) => Promise<RecentIssue[]>;

      // AI 모델
      listModels: (
        apiKey: string,
        provider?: string,
        showAll?: boolean
      ) => Promise<string[]>;

      // 포스트
      listPosts: () => Promise<any[]>;
      readPost: (filePath: string) => Promise<string>;
      deletePost: (
        filePath: string
      ) => Promise<{ success: boolean; error?: string }>;

      // ============================================================
      // 템플릿 관련 (확장)
      // ============================================================

      /** 모든 템플릿 조회 */
      listTemplates: () => Promise<ExtendedTemplate[]>;

      /** 타입별 템플릿 조회 */
      listTemplatesByType: (type: TemplateType) => Promise<ExtendedTemplate[]>;

      /** 프롬프트만 조회 */
      getPrompts: () => Promise<ExtendedTemplate[]>;

      /** 페르소나만 조회 */
      getPersonas: () => Promise<ExtendedTemplate[]>;

      /** 레이아웃만 조회 */
      getLayouts: () => Promise<ExtendedTemplate[]>;

      /** 피드 기반 프롬프트/페르소나 자동 선택 */
      autoSelectCombination: (feedContent: string) => Promise<AutoSelectResult>;

      /** 템플릿 추가 */
      addTemplate: (
        template: Omit<ExtendedTemplate, "id">
      ) => Promise<ExtendedTemplate>;

      /** 템플릿 수정 */
      updateTemplate: (
        id: string,
        updates: Partial<Omit<ExtendedTemplate, "id">>
      ) => Promise<boolean>;

      /** 템플릿 삭제 */
      deleteTemplate: (id: string) => Promise<boolean>;

      /** 템플릿 AI 최적화 */
      optimizeTemplate: (
        content: string
      ) => Promise<{ success: boolean; content?: string; error?: string }>;

      /** 프롬프트로 템플릿 생성 */
      generateTemplateFromPrompt: (
        prompt: string,
        templateName: string,
        templateDescription?: string
      ) => Promise<{ success: boolean; templateId?: string; error?: string }>;

      // 콘텐츠 생성
      generateContent: (data: any) => Promise<GenerateContentResult>;

      // 링크 분석 및 글 생성
      processLinkAndGenerate: (data: {
        url: string;
        category: string;
      }) => Promise<{
        success: boolean;
        filePath?: string;
        title?: string;
        error?: string;
      }>;

      // 발행
      publishLatestPost: () => Promise<{ success: boolean; error?: string }>;
      publishPost: (
        filePath: string,
        category: string
      ) => Promise<{ success: boolean; error?: string }>;

      // ============================================================
      // [NEW] 네이버 관련 API
      // ============================================================

      /**
       * 네이버 로그인
       */
      startNaverLogin: () => Promise<{
        success: boolean;
        state: "logged-in" | "logged-out" | "logging-in" | "unknown";
        error?: string;
      }>;

      /**
       * 다중 플랫폼 발행
       */
      publishPostMulti: (data: {
        filePath: string;
        platforms: string[]; // ['tistory', 'naver']
        category: string;
        tags?: string[];
      }) => Promise<{
        success: boolean;
        results?: {
          tistory: boolean;
          naver: boolean;
          reservation: boolean;
          reservationDate: string | null;
          errors: string[];
        };
        error?: string;
      }>;

      // 이미지 테스트
      testImageSearch: (params: { text: string }) => Promise<{
        success: boolean;
        keyword?: string;
        imageUrls?: string[];
        imageUrl?: string;
        count?: number;
        error?: string;
      }>;

      // 원클릭 발행 (옵션 추가)
      oneClickPublish: (
        options?: OneClickPublishOptions
      ) => Promise<OneClickPublishResult>;

      // 스케줄러
      getSchedulerStatus: () => Promise<SchedulerStatus>;
      startScheduler: (
        intervalMinutes: number
      ) => Promise<{ success: boolean; error?: string }>;
      stopScheduler: () => Promise<{ success: boolean; error?: string }>;

      // 발행 취소
      cancelPublish: () => Promise<{ success: boolean; message: string }>;

      // 로컬 AI
      localAiStatus: () => Promise<LocalAiStatus>;
      localAiInstall: () => Promise<{ success: boolean }>;
      localAiStart: () => Promise<{ success: boolean }>;
      localAiStop: () => Promise<{ success: boolean }>;
      localAiPullModel: (modelName: string) => Promise<{ success: boolean }>;
      localAiDeleteModel: (modelName: string) => Promise<{ success: boolean }>;
      localAiGenerate: (
        prompt: string,
        options?: any
      ) => Promise<{ success: boolean; content?: string; error?: string }>;
      localAiChat: (
        messages: any[],
        options?: any
      ) => Promise<{ success: boolean; content?: string; error?: string }>;
      localAiSystemInfo: () => Promise<SystemInfo>;
      localAiRefreshSystemInfo: () => Promise<SystemInfo>;
      localAiListAvailableModels: () => Promise<ModelInfo[]>;
      localAiCheckUpdate: () => Promise<VersionInfo>;
      localAiUpdate: () => Promise<{ success: boolean; error?: string }>;

      // ============================================================
      // [NEW] 시리즈 생성 관련 API
      // ============================================================

      /**
       * 파일 객체에서 경로 추출 (보안상 렌더러에서 직접 접근 불가할 경우 대비)
       */
      getFilePath: (file: File) => string;

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
      }) => Promise<SeriesGenerationResult>;

      // [NEW] 프리뷰용 핸들러 (선택 사항)
      processFileWithImages: (data: {
        filePath: string;
        options: { useAiImage: boolean };
      }) => Promise<any>;

      /**
       * 파일 처리 진행 상황 리스너
       */
      onFileProcessProgress: (
        callback: (event: any, msg: string) => void
      ) => () => void;

      /**
       * 시리즈 생성 진행 리스너
       */
      onSeriesGenerationProgress: (
        callback: (event: any, data: SeriesProgress) => void
      ) => () => void;

      /**
       * 시리즈 생성 상태 조회
       */
      getSeriesGenerationStatus: () => Promise<SeriesGenerationStatus>;

      // 이벤트 리스너
      onLocalAiInstallProgress: (
        callback: (event: any, progress: InstallProgress) => void
      ) => () => void;
      onLocalAiModelProgress: (
        callback: (event: any, data: ModelProgress) => void
      ) => () => void;
      onLogMessage: (
        callback: (event: any, message: string) => void
      ) => () => void;
      onPublishStageChange: (
        callback: (event: any, data: PublishProgress) => void
      ) => () => void;
      onLoginStateChange: (
        callback: (event: any, data: { state: string; message: string }) => void
      ) => () => void;

      // ============================================================
      // [NEW] 일일 통계 조회 API
      // ============================================================

      /**
       * 일일 발행량 통계 조회
       */
      getDailyStats: () => Promise<{
        tistoryCount: number;
        lastResetDate: string;
      }>;

      // ============================================================
      // 소재 관리 API (NEW)
      // ============================================================
      addMaterial: (data: {
        type: "link" | "file" | "text";
        value: string;
        title: string;
        category?: string;
        tags?: string[];
      }) => Promise<{ success: boolean; message?: string; error?: string }>;

      getMaterials: () => Promise<MaterialItem[]>;

      deleteMaterial: (id: string) => Promise<{ success: boolean }>;

      // ============================================================
      // RSS 내보내기/불러오기 (NEW)
      // ============================================================
      exportRssFeeds: (content: string) => Promise<{
        success: boolean;
        filePath?: string;
        error?: string;
      }>;

      importRssFeeds: () => Promise<{
        success: boolean;
        content?: string;
        error?: string;
      }>;

      // ============================================================
      // 브라우저 다운로드
      // ============================================================
      onBrowserDownloadStart: (callback: () => void) => () => void;
      onBrowserDownloadProgress: (
        callback: (
          event: any,
          data: {
            total: number;
            current: number;
            percent: number;
            status: string;
          }
        ) => void
      ) => () => void;
      onBrowserDownloadComplete: (callback: () => void) => () => void;
      onBrowserDownloadError: (
        callback: (event: any, msg: string) => void
      ) => () => void;

      // ============================================================
      // [NEW] 홈주제 선택 관련 API
      // ============================================================
      getHomeThemes: () => Promise<string[]>;
      selectHomeThemeBeforePublish: (data: {
        title: string;
        content: string;
        selectedTheme: string;
      }) => Promise<{
        success: boolean;
        theme: string;
      }>;
      getSuggestedHomeTheme: (data: {
        title: string;
        content: string;
      }) => Promise<{
        success: boolean;
        theme: string;
      }>;
    };
  }
}

export {};
