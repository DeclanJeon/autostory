import { ollamaInstaller, InstalledModelInfo } from "../utils/ollamaInstaller";
import {
  ollamaConfig,
  getOllamaApiUrl,
  AVAILABLE_MODELS,
  ModelInfo,
} from "../config/ollamaConfig";
import { logger } from "../utils/logger";
import store from "../config/store";
import {
  getSystemInfo,
  getModelRecommendations,
  SystemInfo,
} from "../utils/systemInfo";
import http from "http";

const fetch = require("node-fetch");

export interface LocalAiResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface GenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface ModelWithRecommendation extends ModelInfo {
  isInstalled: boolean;
  recommendationScore: number;
  recommendationReason: string;
  installedPath?: string;
  installedSize?: string;
}

export class LocalAiService {
  private static instance: LocalAiService;
  private cachedSystemInfo: SystemInfo | null = null;

  private constructor() {}

  public static getInstance(): LocalAiService {
    if (!LocalAiService.instance) {
      LocalAiService.instance = new LocalAiService();
    }
    return LocalAiService.instance;
  }

  public async ensureReady(): Promise<boolean> {
    if (!(await ollamaInstaller.isInstalled())) {
      logger.warn("Ollama not installed");
      return false;
    }

    if (!(await ollamaInstaller.isRunning())) {
      const started = await ollamaInstaller.startServer();
      if (!started) {
        logger.error("Failed to start Ollama server");
        return false;
      }
    }

    return true;
  }

  public async getSystemInfo(): Promise<SystemInfo> {
    if (!this.cachedSystemInfo) {
      this.cachedSystemInfo = await getSystemInfo();
    }
    return this.cachedSystemInfo;
  }

  public async refreshSystemInfo(): Promise<SystemInfo> {
    this.cachedSystemInfo = await getSystemInfo();
    return this.cachedSystemInfo;
  }

  public async generate(
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<LocalAiResponse> {
    const ready = await this.ensureReady();
    if (!ready) {
      return { success: false, error: "Ollama 서버가 준비되지 않았습니다." };
    }

    const settings = store.get("settings");
    const model =
      options.model || settings.localAiModel || ollamaConfig.defaultModel;

    try {
      const requestBody: any = {
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 4096,
        },
      };

      if (options.systemPrompt) {
        requestBody.system = options.systemPrompt;
      }

      const response = await fetch(`${getOllamaApiUrl()}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        timeout: 300000,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.response) {
        throw new Error("Empty response from model");
      }

      return {
        success: true,
        content: data.response,
      };
    } catch (error: any) {
      logger.error(`Local AI generation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  public async chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options: GenerationOptions = {}
  ): Promise<LocalAiResponse> {
    const ready = await this.ensureReady();
    if (!ready) {
      return { success: false, error: "Ollama 서버가 준비되지 않았습니다." };
    }

    const settings = store.get("settings");
    const model =
      options.model || settings.localAiModel || ollamaConfig.defaultModel;

    try {
      const response = await fetch(`${getOllamaApiUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 4096,
          },
        }),
        timeout: 300000,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return {
        success: true,
        content: data.message?.content || "",
      };
    } catch (error: any) {
      logger.error(`Local AI chat failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  public async extractKeyword(text: string): Promise<string> {
    const result = await this.generate(
      `다음 텍스트에서 가장 중요한 키워드 1개만 추출해주세요. 키워드만 출력하세요.\n\n텍스트: ${text.substring(
        0,
        300
      )}`,
      { temperature: 0.3, maxTokens: 50 }
    );

    return result.success && result.content ? result.content.trim() : "blog";
  }

  public async pullModel(
    modelName: string,
    onProgress?: (progress: any) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const ready = await this.ensureReady();
      if (!ready) {
        return { success: false, error: "Ollama 서버가 준비되지 않았습니다." };
      }

      logger.info(`Starting model pull: ${modelName}`);

      const result = await this.pullModelWithHttp(modelName, onProgress);

      if (result) {
        const localAiConfig = store.get("localAi");
        const installedModels = localAiConfig.installedModels || [];
        if (!installedModels.includes(modelName)) {
          store.set("localAi", {
            ...localAiConfig,
            installedModels: [...installedModels, modelName],
            lastUsed: Date.now(),
          });
        }
        logger.info(`Model ${modelName} pulled successfully`);
      }

      return { success: result };
    } catch (error: any) {
      logger.error(`Failed to pull model ${modelName}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private pullModelWithHttp(
    modelName: string,
    onProgress?: (progress: any) => void
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const postData = JSON.stringify({ name: modelName, stream: true });

        const options = {
          hostname: ollamaConfig.host,
          port: ollamaConfig.port,
          path: "/api/pull",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
          },
        };

        logger.info(`Pull request options: ${JSON.stringify(options)}`);
        logger.info(`Starting pull for model: ${modelName}`);

        const req = http.request(options, (res) => {
          logger.info(`Pull response status: ${res.statusCode}`);

          let buffer = "";
          let lastProgress = 0;
          let totalSize = 0;
          let downloadedSize = 0;
          let hasError = false;
          let errorMessage = "";
          let downloadStarted = false;

          res.on("data", (chunk) => {
            const chunkStr = chunk.toString();
            buffer += chunkStr;

            // 줄바꿈으로 분리
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // 마지막 불완전한 줄은 버퍼에 유지

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const data = JSON.parse(line);
                logger.info(`Pull data: ${JSON.stringify(data)}`);

                // 오류 처리
                if (data.error) {
                  hasError = true;
                  errorMessage = data.error;
                  logger.error(`Pull error from server: ${data.error}`);

                  if (onProgress) {
                    onProgress({
                      modelName,
                      progress: 0,
                      status: `오류: ${data.error}`,
                      error: true,
                    });
                  }
                  continue;
                }

                let progress = lastProgress;
                let status = data.status || "다운로드 중...";

                // 진행 상황 계산
                if (data.total && data.completed !== undefined) {
                  // 바이트 기반 진행률
                  totalSize = data.total;
                  downloadedSize = data.completed;
                  progress = Math.round((downloadedSize / totalSize) * 100);
                  lastProgress = progress;
                  downloadStarted = true;

                  const downloadedMB = Math.round(
                    downloadedSize / (1024 * 1024)
                  );
                  const totalMB = Math.round(totalSize / (1024 * 1024));
                  status = `다운로드 중: ${downloadedMB}MB / ${totalMB}MB`;
                } else if (data.status === "success") {
                  progress = 100;
                  status = "완료!";
                } else if (data.status?.includes("pulling")) {
                  // 레이어 다운로드 시작
                  downloadStarted = true;
                  const digest = data.digest?.substring(7, 19) || "";
                  status = `레이어 다운로드: ${digest}`;
                  if (data.completed && data.total) {
                    progress = Math.round((data.completed / data.total) * 100);
                    lastProgress = progress;
                  }
                } else if (data.status?.includes("verifying")) {
                  status = "검증 중...";
                  progress = Math.max(lastProgress, 95);
                } else if (data.status?.includes("writing")) {
                  status = "저장 중...";
                  progress = Math.max(lastProgress, 98);
                } else if (data.status?.includes("success")) {
                  status = "완료!";
                  progress = 100;
                }

                // 콜백 호출 - 항상 호출
                const progressPayload = {
                  modelName,
                  progress,
                  status,
                  digest: data.digest,
                  total: data.total,
                  completed: data.completed,
                };

                logger.info(
                  `Calling onProgress: ${JSON.stringify(progressPayload)}`
                );

                if (onProgress) {
                  onProgress(progressPayload);
                }
              } catch (parseError) {
                logger.debug(
                  `JSON parse error for line: ${line.substring(0, 100)}`
                );
              }
            }
          });

          res.on("end", () => {
            logger.info(`Pull stream ended for ${modelName}`);

            // 남은 버퍼 처리
            if (buffer.trim()) {
              try {
                const finalData = JSON.parse(buffer);
                if (finalData.error) {
                  hasError = true;
                  errorMessage = finalData.error;
                } else if (
                  finalData.status === "success" ||
                  finalData.status?.includes("success")
                ) {
                  if (onProgress) {
                    onProgress({
                      modelName,
                      progress: 100,
                      status: "완료!",
                    });
                  }
                }
              } catch (e) {
                logger.debug(`Final buffer parse error: ${e}`);
              }
            }

            // 다운로드가 시작되지 않았다면 오류로 처리
            if (!downloadStarted && !hasError) {
              hasError = true;
              errorMessage =
                "다운로드가 시작되지 않았습니다. 모델 이름을 확인하세요.";
              logger.warn(`Download never started for ${modelName}`);
            }

            if (hasError) {
              if (onProgress) {
                onProgress({
                  modelName,
                  progress: 0,
                  status: `오류: ${errorMessage}`,
                  error: true,
                });
              }
              resolve(false);
            } else {
              // 최종 완료 콜백
              if (onProgress) {
                onProgress({
                  modelName,
                  progress: 100,
                  status: "완료!",
                });
              }
              resolve(true);
            }
          });

          res.on("error", (err) => {
            logger.error(`Pull response error: ${err.message}`);
            if (onProgress) {
              onProgress({
                modelName,
                progress: 0,
                status: `오류: ${err.message}`,
                error: true,
              });
            }
            resolve(false);
          });
        });

        req.on("error", (err) => {
          logger.error(`Pull request error: ${err.message}`);
          if (onProgress) {
            onProgress({
              modelName,
              progress: 0,
              status: `연결 오류: ${err.message}`,
              error: true,
            });
          }
          resolve(false);
        });

        req.on("timeout", () => {
          logger.error("Pull request timeout");
          req.destroy();
          if (onProgress) {
            onProgress({
              modelName,
              progress: 0,
              status: "시간 초과",
              error: true,
            });
          }
          resolve(false);
        });

        // 1시간 타임아웃
        req.setTimeout(3600000);

        req.write(postData);
        req.end();

        logger.info(`Pull request sent for ${modelName}`);
      } catch (error: any) {
        logger.error(`Pull setup error: ${error.message}`);
        if (onProgress) {
          onProgress({
            modelName,
            progress: 0,
            status: `오류: ${error.message}`,
            error: true,
          });
        }
        resolve(false);
      }
    });
  }

  public async deleteModel(
    modelName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await ollamaInstaller.deleteModel(modelName);

      if (result) {
        const localAiConfig = store.get("localAi");
        const installedModels = (localAiConfig.installedModels || []).filter(
          (m: string) => m !== modelName
        );
        store.set("localAi", {
          ...localAiConfig,
          installedModels,
        });
      }

      return { success: result };
    } catch (error: any) {
      logger.error(`Failed to delete model ${modelName}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  public async getStatus(): Promise<{
    installed: boolean;
    running: boolean;
    installedModels: string[];
    defaultModel: string;
    supportedModels: ModelWithRecommendation[];
    systemInfo: SystemInfo;
    modelsPath: string;
  }> {
    try {
      const isInstalled = await ollamaInstaller.isInstalled();
      const isRunning = isInstalled ? await ollamaInstaller.isRunning() : false;
      const systemInfo = await this.getSystemInfo();

      let installedModels: string[] = [];
      let installedModelsDetails: Map<
        string,
        { size: number; modifiedAt: string }
      > = new Map();

      if (isRunning) {
        const modelsData =
          await ollamaInstaller.getInstalledModelsWithDetails();
        installedModels = modelsData.map((m) => m.name);
        modelsData.forEach((m) => {
          installedModelsDetails.set(m.name, {
            size: m.size,
            modifiedAt: m.modifiedAt,
          });
        });

        const localAiConfig = store.get("localAi");
        store.set("localAi", {
          ...localAiConfig,
          installed: true,
          installedModels,
          lastUsed: Date.now(),
        });
      } else if (isInstalled) {
        const localAiConfig = store.get("localAi");
        installedModels = localAiConfig.installedModels || [];

        if (!localAiConfig.installed) {
          store.set("localAi", {
            ...localAiConfig,
            installed: true,
          });
        }
      }

      const settings = store.get("settings");

      const recommendations = getModelRecommendations(
        systemInfo,
        AVAILABLE_MODELS
      );

      const modelsWithRecommendation: ModelWithRecommendation[] =
        AVAILABLE_MODELS.map((model) => {
          const rec = recommendations.get(model.id) || {
            recommended: false,
            reason: "",
            score: 0,
          };

          const isModelInstalled = installedModels.some(
            (installed) =>
              installed === model.id ||
              installed.startsWith(model.id.split(":")[0])
          );

          const details = installedModelsDetails.get(model.id);

          return {
            ...model,
            isInstalled: isModelInstalled,
            recommended: rec.recommended,
            recommendationScore: rec.score,
            recommendationReason: rec.reason,
            installedPath: isModelInstalled
              ? ollamaConfig.modelsPath
              : undefined,
            installedSize: details ? this.formatBytes(details.size) : undefined,
          };
        }).sort((a, b) => {
          if (a.isInstalled && !b.isInstalled) return -1;
          if (!a.isInstalled && b.isInstalled) return 1;
          return b.recommendationScore - a.recommendationScore;
        });

      logger.info(
        `LocalAI Status - installed: ${isInstalled}, running: ${isRunning}, models: ${
          installedModels.length
        }, modelsList: ${JSON.stringify(installedModels)}`
      );

      return {
        installed: isInstalled,
        running: isRunning,
        installedModels,
        defaultModel: settings.localAiModel || ollamaConfig.defaultModel,
        supportedModels: modelsWithRecommendation,
        systemInfo,
        modelsPath: ollamaConfig.modelsPath,
      };
    } catch (error: any) {
      logger.error(`Failed to get Local AI status: ${error.message}`);
      const systemInfo = await this.getSystemInfo();

      return {
        installed: false,
        running: false,
        installedModels: [],
        defaultModel: ollamaConfig.defaultModel,
        supportedModels: AVAILABLE_MODELS.map((m) => ({
          ...m,
          isInstalled: false,
          recommendationScore: 0,
          recommendationReason: "상태 확인 실패",
        })),
        systemInfo,
        modelsPath: ollamaConfig.modelsPath,
      };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  public async listAvailableModels(): Promise<ModelInfo[]> {
    return AVAILABLE_MODELS;
  }
}

export const localAiService = LocalAiService.getInstance();
