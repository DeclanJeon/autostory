import path from "path";
import { app } from "electron";
import os from "os";

export interface OllamaConfig {
  binaryPath: string;
  modelsPath: string;
  host: string;
  port: number;
  defaultModel: string;
  supportedModels: ModelInfo[];
}

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

export type ModelCategory =
  | "general"
  | "coding"
  | "creative"
  | "multilingual"
  | "vision"
  | "embedding"
  | "specialized";

const platform = os.platform();
const arch = os.arch();

const getBinaryName = (): string => {
  switch (platform) {
    case "win32":
      return "ollama.exe";
    case "darwin":
      return "ollama";
    case "linux":
      return "ollama";
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

export const getLatestOllamaVersion = async (): Promise<string> => {
  try {
    const response = await fetch(
      "https://api.github.com/repos/ollama/ollama/releases/latest",
      {
        headers: {
          "User-Agent": "AutoTistory-AI-Writer",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const version = data.tag_name?.replace(/^v/, "") || "0.13.5";
    return version;
  } catch (error) {
    console.error("Failed to fetch latest version:", error);
    return "0.13.5";
  }
};

const getOllamaDownloadUrl = (
  version: string
): {
  url: string;
  type: "binary" | "tgz" | "zip";
} => {
  const baseUrl = `https://github.com/ollama/ollama/releases/download/v${version}`;

  switch (platform) {
    case "win32":
      return {
        url: `${baseUrl}/ollama-windows-amd64.zip`,
        type: "zip",
      };
    case "darwin":
      return {
        url:
          arch === "arm64"
            ? `${baseUrl}/ollama-darwin`
            : `${baseUrl}/ollama-darwin`,
        type: "binary",
      };
    case "linux":
      return {
        url:
          arch === "arm64"
            ? `${baseUrl}/ollama-linux-arm64.tgz`
            : `${baseUrl}/ollama-linux-amd64.tgz`,
        type: "tgz",
      };
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "gemma3:1b",
    name: "Gemma 3 1B",
    size: "815MB",
    sizeBytes: 815 * 1024 * 1024,
    description: "Google의 초경량 모델. 빠른 응답, 간단한 작업에 적합",
    recommended: false,
    category: "general",
    parameters: "1B",
    contextLength: 32768,
    minRamGB: 2,
    minVramGB: 1,
    quantization: "Q4_K_M",
    languages: ["en", "ko", "ja", "zh"],
    useCases: ["간단한 질의응답", "텍스트 분류", "요약"],
  },
  {
    id: "gemma3:4b",
    name: "Gemma 3 4B (기본)",
    size: "3.3GB",
    sizeBytes: 3.3 * 1024 * 1024 * 1024,
    description: "Google의 경량 고성능 모델. 한국어 지원 우수, 균형잡힌 성능",
    recommended: true,
    category: "general",
    parameters: "4B",
    contextLength: 32768,
    minRamGB: 8,
    minVramGB: 4,
    quantization: "Q4_K_M",
    languages: ["en", "ko", "ja", "zh", "de", "fr", "es"],
    useCases: ["블로그 작성", "번역", "코드 생성", "대화"],
  },
  {
    id: "gemma3:12b",
    name: "Gemma 3 12B",
    size: "8.1GB",
    sizeBytes: 8.1 * 1024 * 1024 * 1024,
    description: "더 높은 품질의 출력. 더 많은 VRAM 필요",
    recommended: false,
    category: "general",
    parameters: "12B",
    contextLength: 32768,
    minRamGB: 16,
    minVramGB: 10,
    quantization: "Q4_K_M",
    languages: ["en", "ko", "ja", "zh", "de", "fr", "es"],
    useCases: ["고품질 콘텐츠 생성", "복잡한 분석", "창작"],
  },
  {
    id: "llama3.2:1b",
    name: "Llama 3.2 1B",
    size: "1.3GB",
    sizeBytes: 1.3 * 1024 * 1024 * 1024,
    description: "Meta의 초경량 모델. 매우 빠른 추론 속도",
    recommended: false,
    category: "general",
    parameters: "1B",
    contextLength: 128000,
    minRamGB: 4,
    minVramGB: 2,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["빠른 응답", "간단한 작업", "임베딩"],
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    size: "2.0GB",
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    description: "Meta의 경량 모델. 빠른 응답",
    recommended: false,
    category: "general",
    parameters: "3B",
    contextLength: 128000,
    minRamGB: 6,
    minVramGB: 3,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["빠른 질의응답", "텍스트 처리", "요약"],
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 8B",
    size: "4.7GB",
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    description: "Meta의 범용 고성능 모델. 영어 최적화",
    recommended: false,
    category: "general",
    parameters: "8B",
    contextLength: 128000,
    minRamGB: 10,
    minVramGB: 6,
    quantization: "Q4_K_M",
    languages: ["en", "de", "fr", "es", "it", "pt"],
    useCases: ["범용 대화", "콘텐츠 생성", "분석"],
  },
  {
    id: "llama3.1:70b",
    name: "Llama 3.1 70B",
    size: "40GB",
    sizeBytes: 40 * 1024 * 1024 * 1024,
    description: "Meta의 대형 모델. 최고 품질, 고사양 필요",
    recommended: false,
    category: "general",
    parameters: "70B",
    contextLength: 128000,
    minRamGB: 64,
    minVramGB: 48,
    quantization: "Q4_K_M",
    languages: ["en", "de", "fr", "es", "it", "pt"],
    useCases: ["전문 콘텐츠", "복잡한 추론", "고품질 번역"],
  },
  {
    id: "qwen2.5:0.5b",
    name: "Qwen 2.5 0.5B",
    size: "398MB",
    sizeBytes: 398 * 1024 * 1024,
    description: "Alibaba의 초소형 모델. 매우 빠름",
    recommended: false,
    category: "multilingual",
    parameters: "0.5B",
    contextLength: 32768,
    minRamGB: 2,
    minVramGB: 1,
    quantization: "Q4_K_M",
    languages: ["en", "zh", "ko", "ja"],
    useCases: ["빠른 응답", "간단한 작업"],
  },
  {
    id: "qwen2.5:3b",
    name: "Qwen 2.5 3B",
    size: "1.9GB",
    sizeBytes: 1.9 * 1024 * 1024 * 1024,
    description: "Alibaba의 경량 다국어 모델. 중국어/한국어 우수",
    recommended: false,
    category: "multilingual",
    parameters: "3B",
    contextLength: 32768,
    minRamGB: 6,
    minVramGB: 3,
    quantization: "Q4_K_M",
    languages: ["en", "zh", "ko", "ja", "vi", "th"],
    useCases: ["다국어 번역", "아시아권 콘텐츠"],
  },
  {
    id: "qwen2.5:7b",
    name: "Qwen 2.5 7B",
    size: "4.7GB",
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    description: "Alibaba 모델. 다국어 지원 우수",
    recommended: false,
    category: "multilingual",
    parameters: "7B",
    contextLength: 32768,
    minRamGB: 10,
    minVramGB: 6,
    quantization: "Q4_K_M",
    languages: ["en", "zh", "ko", "ja", "vi", "th", "ar"],
    useCases: ["다국어 콘텐츠", "번역", "분석"],
  },
  {
    id: "qwen2.5:14b",
    name: "Qwen 2.5 14B",
    size: "9.0GB",
    sizeBytes: 9.0 * 1024 * 1024 * 1024,
    description: "Alibaba의 고성능 다국어 모델",
    recommended: false,
    category: "multilingual",
    parameters: "14B",
    contextLength: 32768,
    minRamGB: 18,
    minVramGB: 12,
    quantization: "Q4_K_M",
    languages: ["en", "zh", "ko", "ja", "vi", "th", "ar"],
    useCases: ["고품질 다국어 콘텐츠", "복잡한 번역"],
  },
  {
    id: "qwen2.5-coder:3b",
    name: "Qwen 2.5 Coder 3B",
    size: "1.9GB",
    sizeBytes: 1.9 * 1024 * 1024 * 1024,
    description: "코딩 특화 경량 모델",
    recommended: false,
    category: "coding",
    parameters: "3B",
    contextLength: 32768,
    minRamGB: 6,
    minVramGB: 3,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["코드 생성", "코드 리뷰", "디버깅"],
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    size: "4.7GB",
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    description: "코딩 특화 모델. 다양한 언어 지원",
    recommended: false,
    category: "coding",
    parameters: "7B",
    contextLength: 32768,
    minRamGB: 10,
    minVramGB: 6,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["코드 생성", "리팩토링", "문서화"],
  },
  {
    id: "codellama:7b",
    name: "Code Llama 7B",
    size: "3.8GB",
    sizeBytes: 3.8 * 1024 * 1024 * 1024,
    description: "Meta의 코드 특화 모델",
    recommended: false,
    category: "coding",
    parameters: "7B",
    contextLength: 16384,
    minRamGB: 8,
    minVramGB: 5,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["코드 완성", "코드 생성", "디버깅"],
  },
  {
    id: "codellama:13b",
    name: "Code Llama 13B",
    size: "7.4GB",
    sizeBytes: 7.4 * 1024 * 1024 * 1024,
    description: "Meta의 고성능 코드 모델",
    recommended: false,
    category: "coding",
    parameters: "13B",
    contextLength: 16384,
    minRamGB: 16,
    minVramGB: 10,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["복잡한 코드 생성", "아키텍처 설계"],
  },
  {
    id: "deepseek-coder:6.7b",
    name: "DeepSeek Coder 6.7B",
    size: "3.8GB",
    sizeBytes: 3.8 * 1024 * 1024 * 1024,
    description: "DeepSeek의 코딩 특화 모델. 뛰어난 코드 품질",
    recommended: false,
    category: "coding",
    parameters: "6.7B",
    contextLength: 16384,
    minRamGB: 8,
    minVramGB: 5,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["코드 생성", "코드 분석", "리뷰"],
  },
  {
    id: "mistral:7b",
    name: "Mistral 7B",
    size: "4.1GB",
    sizeBytes: 4.1 * 1024 * 1024 * 1024,
    description: "빠르고 효율적인 범용 모델",
    recommended: false,
    category: "general",
    parameters: "7B",
    contextLength: 32768,
    minRamGB: 10,
    minVramGB: 6,
    quantization: "Q4_K_M",
    languages: ["en", "fr", "de", "es", "it"],
    useCases: ["범용 대화", "콘텐츠 생성", "분석"],
  },
  {
    id: "mixtral:8x7b",
    name: "Mixtral 8x7B (MoE)",
    size: "26GB",
    sizeBytes: 26 * 1024 * 1024 * 1024,
    description: "Mixture of Experts 모델. 높은 성능, 고사양 필요",
    recommended: false,
    category: "general",
    parameters: "8x7B",
    contextLength: 32768,
    minRamGB: 48,
    minVramGB: 32,
    quantization: "Q4_K_M",
    languages: ["en", "fr", "de", "es", "it"],
    useCases: ["전문 콘텐츠", "복잡한 추론", "다중 작업"],
  },
  {
    id: "phi3:mini",
    name: "Phi-3 Mini",
    size: "2.3GB",
    sizeBytes: 2.3 * 1024 * 1024 * 1024,
    description: "Microsoft 소형 모델. 효율적인 추론",
    recommended: false,
    category: "general",
    parameters: "3.8B",
    contextLength: 4096,
    minRamGB: 6,
    minVramGB: 3,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["빠른 응답", "간단한 작업", "교육용"],
  },
  {
    id: "phi3:medium",
    name: "Phi-3 Medium",
    size: "7.9GB",
    sizeBytes: 7.9 * 1024 * 1024 * 1024,
    description: "Microsoft 중형 모델. 균형잡힌 성능",
    recommended: false,
    category: "general",
    parameters: "14B",
    contextLength: 4096,
    minRamGB: 16,
    minVramGB: 10,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["범용 작업", "분석", "추론"],
  },
  {
    id: "llava:7b",
    name: "LLaVA 7B",
    size: "4.5GB",
    sizeBytes: 4.5 * 1024 * 1024 * 1024,
    description: "비전-언어 모델. 이미지 이해 가능",
    recommended: false,
    category: "vision",
    parameters: "7B",
    contextLength: 4096,
    minRamGB: 10,
    minVramGB: 6,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["이미지 분석", "이미지 설명", "시각적 질의응답"],
  },
  {
    id: "llava:13b",
    name: "LLaVA 13B",
    size: "8.0GB",
    sizeBytes: 8.0 * 1024 * 1024 * 1024,
    description: "고성능 비전-언어 모델",
    recommended: false,
    category: "vision",
    parameters: "13B",
    contextLength: 4096,
    minRamGB: 16,
    minVramGB: 10,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["상세 이미지 분석", "복잡한 시각적 추론"],
  },
  {
    id: "nomic-embed-text",
    name: "Nomic Embed Text",
    size: "274MB",
    sizeBytes: 274 * 1024 * 1024,
    description: "텍스트 임베딩 전용 모델",
    recommended: false,
    category: "embedding",
    parameters: "137M",
    contextLength: 8192,
    minRamGB: 2,
    minVramGB: 1,
    quantization: "F16",
    languages: ["en"],
    useCases: ["텍스트 임베딩", "유사도 검색", "RAG"],
  },
  {
    id: "mxbai-embed-large",
    name: "MxBai Embed Large",
    size: "670MB",
    sizeBytes: 670 * 1024 * 1024,
    description: "고품질 임베딩 모델",
    recommended: false,
    category: "embedding",
    parameters: "335M",
    contextLength: 512,
    minRamGB: 2,
    minVramGB: 1,
    quantization: "F16",
    languages: ["en"],
    useCases: ["문서 임베딩", "검색", "클러스터링"],
  },
  {
    id: "yi:6b",
    name: "Yi 6B",
    size: "3.5GB",
    sizeBytes: 3.5 * 1024 * 1024 * 1024,
    description: "01.AI의 고품질 중국어/영어 모델",
    recommended: false,
    category: "multilingual",
    parameters: "6B",
    contextLength: 4096,
    minRamGB: 8,
    minVramGB: 5,
    quantization: "Q4_K_M",
    languages: ["en", "zh"],
    useCases: ["중국어 콘텐츠", "번역", "대화"],
  },
  {
    id: "yi:34b",
    name: "Yi 34B",
    size: "19GB",
    sizeBytes: 19 * 1024 * 1024 * 1024,
    description: "01.AI의 대형 고성능 모델",
    recommended: false,
    category: "multilingual",
    parameters: "34B",
    contextLength: 4096,
    minRamGB: 40,
    minVramGB: 24,
    quantization: "Q4_K_M",
    languages: ["en", "zh"],
    useCases: ["고품질 콘텐츠", "복잡한 추론", "전문 번역"],
  },
  {
    id: "solar:10.7b",
    name: "Solar 10.7B",
    size: "6.1GB",
    sizeBytes: 6.1 * 1024 * 1024 * 1024,
    description: "Upstage의 한국어 특화 모델",
    recommended: false,
    category: "multilingual",
    parameters: "10.7B",
    contextLength: 4096,
    minRamGB: 12,
    minVramGB: 8,
    quantization: "Q4_K_M",
    languages: ["en", "ko"],
    useCases: ["한국어 콘텐츠", "번역", "요약"],
  },
  {
    id: "openchat:7b",
    name: "OpenChat 7B",
    size: "4.1GB",
    sizeBytes: 4.1 * 1024 * 1024 * 1024,
    description: "대화 최적화 오픈소스 모델",
    recommended: false,
    category: "general",
    parameters: "7B",
    contextLength: 8192,
    minRamGB: 10,
    minVramGB: 6,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["대화", "질의응답", "챗봇"],
  },
  {
    id: "neural-chat:7b",
    name: "Neural Chat 7B",
    size: "4.1GB",
    sizeBytes: 4.1 * 1024 * 1024 * 1024,
    description: "Intel의 대화 최적화 모델",
    recommended: false,
    category: "general",
    parameters: "7B",
    contextLength: 8192,
    minRamGB: 10,
    minVramGB: 6,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["대화", "고객 서비스", "챗봇"],
  },
  {
    id: "stablelm2:1.6b",
    name: "StableLM 2 1.6B",
    size: "1.0GB",
    sizeBytes: 1.0 * 1024 * 1024 * 1024,
    description: "Stability AI의 경량 모델",
    recommended: false,
    category: "general",
    parameters: "1.6B",
    contextLength: 4096,
    minRamGB: 4,
    minVramGB: 2,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["빠른 응답", "간단한 작업"],
  },
  {
    id: "orca-mini:3b",
    name: "Orca Mini 3B",
    size: "1.9GB",
    sizeBytes: 1.9 * 1024 * 1024 * 1024,
    description: "Microsoft 연구 기반 경량 모델",
    recommended: false,
    category: "general",
    parameters: "3B",
    contextLength: 2048,
    minRamGB: 6,
    minVramGB: 3,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["추론", "질의응답", "분석"],
  },
  {
    id: "wizard-vicuna-uncensored:13b",
    name: "Wizard Vicuna 13B",
    size: "7.4GB",
    sizeBytes: 7.4 * 1024 * 1024 * 1024,
    description: "제한 없는 대화 모델",
    recommended: false,
    category: "creative",
    parameters: "13B",
    contextLength: 2048,
    minRamGB: 16,
    minVramGB: 10,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["창작", "역할극", "스토리텔링"],
  },
  {
    id: "dolphin-mixtral:8x7b",
    name: "Dolphin Mixtral 8x7B",
    size: "26GB",
    sizeBytes: 26 * 1024 * 1024 * 1024,
    description: "제한 없는 MoE 모델. 고품질 출력",
    recommended: false,
    category: "creative",
    parameters: "8x7B",
    contextLength: 32768,
    minRamGB: 48,
    minVramGB: 32,
    quantization: "Q4_K_M",
    languages: ["en"],
    useCases: ["창작 콘텐츠", "고급 역할극", "스토리"],
  },
];

export const ollamaConfig: OllamaConfig = {
  binaryPath: path.join(app.getPath("userData"), "ollama", getBinaryName()),
  modelsPath: path.join(app.getPath("userData"), "ollama", "models"),
  host: "127.0.0.1",
  port: 11434,
  defaultModel: "gemma3:4b",
  supportedModels: AVAILABLE_MODELS,
};

export const getOllamaDownloadInfo = async () => {
  const version = await getLatestOllamaVersion();
  const downloadInfo = getOllamaDownloadUrl(version);
  return {
    ...downloadInfo,
    version,
    platform,
    arch,
  };
};

export const getOllamaApiUrl = () =>
  `http://${ollamaConfig.host}:${ollamaConfig.port}`;

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  general: "범용",
  coding: "코딩",
  creative: "창작",
  multilingual: "다국어",
  vision: "비전",
  embedding: "임베딩",
  specialized: "특수",
};

export const CATEGORY_COLORS: Record<ModelCategory, string> = {
  general: "bg-blue-100 text-blue-700",
  coding: "bg-green-100 text-green-700",
  creative: "bg-purple-100 text-purple-700",
  multilingual: "bg-orange-100 text-orange-700",
  vision: "bg-pink-100 text-pink-700",
  embedding: "bg-gray-100 text-gray-700",
  specialized: "bg-yellow-100 text-yellow-700",
};
