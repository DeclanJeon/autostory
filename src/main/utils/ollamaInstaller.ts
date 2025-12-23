import fs from "fs-extra";
import path from "path";
import { app } from "electron";
import { spawn, ChildProcess, execSync } from "child_process";
import {
  ollamaConfig,
  getOllamaDownloadInfo,
  getLatestOllamaVersion,
} from "../config/ollamaConfig";
import { logger } from "./logger";
import https from "https";
import http from "http";
import zlib from "zlib";
import * as tar from "tar";
import store from "../config/store";

// extract-zip는 동적 import

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

export interface InstalledModelInfo {
  name: string;
  size: number;
  modifiedAt: string;
  digest: string;
}

export interface VersionInfo {
  current: string | null;
  latest: string;
  updateAvailable: boolean;
}

export type ProgressCallback = (progress: InstallProgress) => void;

export class OllamaInstaller {
  private static instance: OllamaInstaller;
  private ollamaProcess: ChildProcess | null = null;
  private cachedVersion: string | null = null;

  private constructor() {}

  public static getInstance(): OllamaInstaller {
    if (!OllamaInstaller.instance) {
      OllamaInstaller.instance = new OllamaInstaller();
    }
    return OllamaInstaller.instance;
  }

  public async isInstalled(): Promise<boolean> {
    try {
      const exists = await fs.pathExists(ollamaConfig.binaryPath);
      if (!exists) return false;

      const stats = await fs.stat(ollamaConfig.binaryPath);
      return stats.size > 1000000;
    } catch (error) {
      return false;
    }
  }

  public async getCurrentVersion(): Promise<string | null> {
    if (!(await this.isInstalled())) {
      return null;
    }

    try {
      const result = execSync(`"${ollamaConfig.binaryPath}" --version`, {
        encoding: "utf-8",
        timeout: 5000,
      });

      const versionMatch = result.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        this.cachedVersion = versionMatch[1];
        return this.cachedVersion;
      }
      return null;
    } catch (error) {
      logger.warn(`Failed to get Ollama version: ${error}`);

      const localAiConfig = store.get("localAi") as any;
      if (localAiConfig?.installedVersion) {
        return localAiConfig.installedVersion;
      }

      return null;
    }
  }

  public async checkForUpdate(): Promise<VersionInfo> {
    const current = await this.getCurrentVersion();
    const latest = await getLatestOllamaVersion();

    let updateAvailable = false;

    if (current && latest) {
      updateAvailable = this.compareVersions(latest, current) > 0;
    }

    return {
      current,
      latest,
      updateAvailable,
    };
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  public async isRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(
          `http://${ollamaConfig.host}:${ollamaConfig.port}/api/tags`
        );

        const req = http.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: "GET",
            timeout: 2000,
          },
          (res) => {
            resolve(res.statusCode === 200);
          }
        );

        req.on("error", () => {
          resolve(false);
        });

        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });

        req.end();
      } catch {
        resolve(false);
      }
    });
  }

  public async install(
    onProgress?: ProgressCallback,
    forceReinstall: boolean = false
  ): Promise<boolean> {
    const ollamaDir = path.dirname(ollamaConfig.binaryPath);

    try {
      if (await this.isRunning()) {
        onProgress?.({
          stage: "checking",
          progress: 5,
          message: "실행 중인 Ollama 서버 중지 중...",
        });
        await this.stopServer();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (forceReinstall && (await fs.pathExists(ollamaConfig.binaryPath))) {
        onProgress?.({
          stage: "checking",
          progress: 10,
          message: "기존 설치 제거 중...",
        });
        await fs.remove(ollamaConfig.binaryPath);
      }

      await fs.ensureDir(ollamaDir);
      await fs.ensureDir(ollamaConfig.modelsPath);

      onProgress?.({
        stage: "checking",
        progress: 15,
        message: "최신 버전 확인 중...",
      });

      const downloadInfo = await getOllamaDownloadInfo();
      const { url, type, version } = downloadInfo;

      logger.info(`Downloading Ollama v${version} from: ${url}`);

      onProgress?.({
        stage: "downloading",
        progress: 20,
        message: `Ollama v${version} 다운로드 시작...`,
      });

      const buffer = await this.downloadFile(url, (progress) => {
        const adjustedProgress = 20 + Math.round(progress * 0.5);
        onProgress?.({
          stage: "downloading",
          progress: adjustedProgress,
          message: `다운로드 중... ${progress}%`,
        });
      });

      onProgress?.({
        stage: "extracting",
        progress: 75,
        message: "압축 해제 중...",
      });

      if (type === "zip") {
        const zipPath = path.join(ollamaDir, "ollama.zip");
        await fs.writeFile(zipPath, buffer);

        try {
          const extractZip = require("extract-zip");
          await extractZip(zipPath, { dir: ollamaDir });
        } catch (e) {
          logger.error(`Zip extraction failed: ${e}`);
          throw e;
        }

        await fs.remove(zipPath);
      } else if (type === "tgz") {
        const tgzPath = path.join(ollamaDir, "ollama.tgz");
        await fs.writeFile(tgzPath, buffer);

        try {
          await this.extractTgz(tgzPath, ollamaDir);
        } catch (e) {
          logger.error(`Tgz extraction failed: ${e}`);
          throw e;
        }

        await fs.remove(tgzPath);

        const extractedBinary = path.join(ollamaDir, "bin", "ollama");
        if (await fs.pathExists(extractedBinary)) {
          await fs.move(extractedBinary, ollamaConfig.binaryPath, {
            overwrite: true,
          });
          const binDir = path.join(ollamaDir, "bin");
          if (await fs.pathExists(binDir)) {
            await fs.remove(binDir);
          }
        }

        await fs.chmod(ollamaConfig.binaryPath, 0o755);
      } else {
        await fs.writeFile(ollamaConfig.binaryPath, buffer);
        await fs.chmod(ollamaConfig.binaryPath, 0o755);
      }

      onProgress?.({
        stage: "verifying",
        progress: 95,
        message: "설치 확인 중...",
      });

      const installed = await this.isInstalled();
      if (!installed) {
        throw new Error("Installation verification failed");
      }

      const localAiConfig = store.get("localAi") as any;
      store.set("localAi", {
        ...localAiConfig,
        installed: true,
        installedVersion: version,
        lastUpdated: Date.now(),
      });

      onProgress?.({
        stage: "complete",
        progress: 100,
        message: `Ollama v${version} 설치 완료!`,
      });

      logger.info(`Ollama v${version} installed successfully`);
      return true;
    } catch (error: any) {
      logger.error(`Ollama installation failed: ${error.message}`);
      onProgress?.({
        stage: "error",
        progress: 0,
        message: `설치 실패: ${error.message}`,
      });
      return false;
    }
  }

  public async update(onProgress?: ProgressCallback): Promise<boolean> {
    const versionInfo = await this.checkForUpdate();

    if (!versionInfo.updateAvailable) {
      onProgress?.({
        stage: "complete",
        progress: 100,
        message: `이미 최신 버전입니다 (v${versionInfo.current})`,
      });
      return true;
    }

    onProgress?.({
      stage: "checking",
      progress: 0,
      message: `v${versionInfo.current} → v${versionInfo.latest} 업데이트 시작...`,
    });

    return await this.install(onProgress, true);
  }

  private async extractTgz(tgzPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(tgzPath);
      const gunzip = zlib.createGunzip();

      readStream
        .pipe(gunzip)
        .pipe(
          tar.extract({
            cwd: destDir,
            strip: 0,
          })
        )
        .on("finish", () => {
          resolve();
        })
        .on("error", (err) => {
          reject(err);
        });

      readStream.on("error", reject);
      gunzip.on("error", reject);
    });
  }

  private async downloadFile(
    url: string,
    onProgress?: (progress: number) => void
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      const makeRequest = (requestUrl: string, redirectCount: number = 0) => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        try {
          const urlObj = new URL(requestUrl);
          const client = urlObj.protocol === "https:" ? https : http;

          const requestOptions: any = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: "GET",
            timeout: 300000,
            headers: {
              "User-Agent": "AutoTistory-AI-Writer/1.0",
            },
          };

          const req = client.request(requestOptions, (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              logger.info(`Redirecting to: ${res.headers.location}`);
              makeRequest(res.headers.location, redirectCount + 1);
              return;
            }

            if (
              res.statusCode &&
              (res.statusCode < 200 || res.statusCode >= 300)
            ) {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
              return;
            }

            const contentLength = parseInt(
              res.headers["content-length"] || "0"
            );
            const chunks: Buffer[] = [];
            let downloadedBytes = 0;

            res.on("data", (chunk: Buffer) => {
              chunks.push(chunk);
              downloadedBytes += chunk.length;

              if (contentLength > 0) {
                const progress = Math.round(
                  (downloadedBytes / contentLength) * 100
                );
                onProgress?.(progress);
              }
            });

            res.on("end", () => {
              resolve(Buffer.concat(chunks));
            });

            res.on("error", (err) => {
              reject(err);
            });
          });

          req.on("error", reject);
          req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timeout"));
          });

          req.end();
        } catch (error) {
          reject(error);
        }
      };

      makeRequest(url);
    });
  }

  public async startServer(): Promise<boolean> {
    if (await this.isRunning()) {
      logger.info("Ollama server already running");
      return true;
    }

    if (!(await this.isInstalled())) {
      logger.error("Ollama not installed");
      return false;
    }

    try {
      const env = {
        ...process.env,
        OLLAMA_HOST: `${ollamaConfig.host}:${ollamaConfig.port}`,
        OLLAMA_MODELS: ollamaConfig.modelsPath,
      };

      this.ollamaProcess = spawn(ollamaConfig.binaryPath, ["serve"], {
        env,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.ollamaProcess.stdout?.on("data", (data) => {
        logger.info(`Ollama: ${data.toString().trim()}`);
      });

      this.ollamaProcess.stderr?.on("data", (data) => {
        logger.warn(`Ollama stderr: ${data.toString().trim()}`);
      });

      this.ollamaProcess.on("exit", (code) => {
        logger.info(`Ollama process exited with code ${code}`);
        this.ollamaProcess = null;
      });

      await this.waitForServer(30000);
      logger.info("Ollama server started successfully");
      return true;
    } catch (error: any) {
      logger.error(`Failed to start Ollama: ${error.message}`);
      return false;
    }
  }

  private async waitForServer(timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isRunning()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Ollama server startup timeout");
  }

  public async stopServer(): Promise<void> {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill("SIGTERM");
      this.ollamaProcess = null;
      logger.info("Ollama server stopped");
    }
  }

  public async getInstalledModels(): Promise<string[]> {
    try {
      const response = await fetch(
        `http://${ollamaConfig.host}:${ollamaConfig.port}/api/tags`
      );
      if (!response.ok) return [];

      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  public async getInstalledModelsWithDetails(): Promise<InstalledModelInfo[]> {
    try {
      const response = await fetch(
        `http://${ollamaConfig.host}:${ollamaConfig.port}/api/tags`
      );
      if (!response.ok) return [];

      const data = await response.json();
      const models = (data.models || []).map((m: any) => ({
        name: m.name,
        size: m.size || 0,
        modifiedAt: m.modified_at || "",
        digest: m.digest || "",
      }));

      logger.info(
        `getInstalledModelsWithDetails result: ${JSON.stringify(models)}`
      );
      return models;
    } catch (error) {
      logger.error(`getInstalledModelsWithDetails error: ${error}`);
      return [];
    }
  }

  public async pullModel(
    modelName: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(
          `http://${ollamaConfig.host}:${ollamaConfig.port}/api/pull`
        );

        const postData = JSON.stringify({ name: modelName, stream: true });

        const req = http.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            },
          },
          (res) => {
            let buffer = "";

            res.on("data", (chunk) => {
              buffer += chunk.toString();
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const data = JSON.parse(line);
                  if (data.total && data.completed) {
                    const progress = Math.round(
                      (data.completed / data.total) * 100
                    );
                    onProgress?.(progress, data.status || "다운로드 중...");
                  } else if (data.status) {
                    onProgress?.(0, data.status);
                  }
                } catch {}
              }
            });

            res.on("end", () => {
              logger.info(`Model ${modelName} pulled successfully`);
              resolve(true);
            });

            res.on("error", (err) => {
              logger.error(`Pull stream error: ${err.message}`);
              resolve(false);
            });
          }
        );

        req.on("error", (err) => {
          logger.error(`Failed to pull model ${modelName}: ${err.message}`);
          resolve(false);
        });

        req.write(postData);
        req.end();
      } catch (error: any) {
        logger.error(`Failed to pull model ${modelName}: ${error.message}`);
        resolve(false);
      }
    });
  }

  public async deleteModel(modelName: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(
          `http://${ollamaConfig.host}:${ollamaConfig.port}/api/delete`
        );

        const postData = JSON.stringify({ name: modelName });

        const req = http.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            },
          },
          (res) => {
            resolve(res.statusCode === 200);
          }
        );

        req.on("error", () => {
          resolve(false);
        });

        req.write(postData);
        req.end();
      } catch {
        resolve(false);
      }
    });
  }
}

export const ollamaInstaller = OllamaInstaller.getInstance();
