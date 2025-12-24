import fs from "fs-extra";
import path from "path";
import { app } from "electron";
import https from "https";
import http from "http";
import extract from "extract-zip";
import * as tar from "tar";
import { logger } from "../utils/logger";

// Playwright 1.49.0 대응 Chromium Revision (Build 1148 / 131.0.x)
const CHROMIUM_REVISION = "1148";

export interface DownloadProgress {
  total: number;
  current: number;
  percent: number;
  status: string;
}

export class BrowserManager {
  private static instance: BrowserManager;
  private basePath: string;
  private browserPath: string;

  private constructor() {
    this.basePath = path.join(app.getPath("userData"), "browsers");
    this.browserPath = path.join(
      this.basePath,
      `chromium-${CHROMIUM_REVISION}`
    );
  }

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  public getExecutablePath(): string {
    const platform = process.platform;
    if (platform === "win32") {
      return path.join(this.browserPath, "chrome-win", "chrome.exe");
    } else if (platform === "darwin") {
      return path.join(
        this.browserPath,
        "chrome-mac",
        "Chromium.app",
        "Contents",
        "MacOS",
        "Chromium"
      );
    } else {
      return path.join(this.browserPath, "chrome-linux", "chrome");
    }
  }

  public async isInstalled(): Promise<boolean> {
    const execPath = this.getExecutablePath();
    return fs.pathExists(execPath);
  }

  private getDownloadUrl(): string {
    const platform = process.platform;
    const baseUrl = `https://playwright.azureedge.net/builds/chromium/${CHROMIUM_REVISION}`;

    if (platform === "win32") {
      return `${baseUrl}/chromium-win64.zip`;
    } else if (platform === "darwin") {
      const isArm64 = process.arch === "arm64";
      return isArm64
        ? `${baseUrl}/chromium-mac-arm64.zip`
        : `${baseUrl}/chromium-mac.zip`;
    } else {
      return `${baseUrl}/chromium-linux.zip`;
    }
  }

  /**
   * [FIX] 리다이렉트를 지원하는 다운로드 헬퍼 함수
   */
  private downloadFile(
    url: string,
    destination: string,
    onProgress: (current: number, total: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destination);

      const handleRequest = (requestUrl: string) => {
        logger.info(`Downloading from: ${requestUrl}`);

        https
          .get(requestUrl, (response) => {
            // 리다이렉트 처리 (301, 302)
            if (
              response.statusCode &&
              response.statusCode >= 300 &&
              response.statusCode < 400 &&
              response.headers.location
            ) {
              logger.info(`Redirecting to: ${response.headers.location}`);
              return handleRequest(response.headers.location);
            }

            if (response.statusCode !== 200) {
              file.close();
              fs.unlink(destination).catch(() => {}); // 에러 시 파일 삭제
              reject(
                new Error(
                  `Download failed with HTTP status code: ${response.statusCode}`
                )
              );
              return;
            }

            const total = parseInt(
              response.headers["content-length"] || "0",
              10
            );
            let current = 0;

            response.on("data", (chunk) => {
              current += chunk.length;
              onProgress(current, total);
              file.write(chunk);
            });

            response.on("end", () => {
              // [FIX] Windows File Locking 문제 해결을 위해 close 콜백 사용
              file.end(() => {
                file.close(() => {
                  logger.info("Download stream closed successfully.");
                  resolve();
                });
              });
            });

            response.on("error", (err) => {
              file.close();
              fs.unlink(destination).catch(() => {});
              reject(err);
            });
          })
          .on("error", (err) => {
            file.close();
            fs.unlink(destination).catch(() => {});
            reject(err);
          });
      };

      handleRequest(url);
    });
  }

  public async install(
    onProgress: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (await this.isInstalled()) {
      logger.info("Browser already installed.");
      return;
    }

    const url = this.getDownloadUrl();
    const fileName = path.basename(url);
    const downloadPath = path.join(this.basePath, fileName);

    await fs.ensureDir(this.basePath);
    logger.info(`Starting browser download: ${url}`);

    try {
      // 1. 다운로드 (개선된 함수 사용)
      await this.downloadFile(url, downloadPath, (current, total) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        onProgress({
          total,
          current,
          percent,
          status: "브라우저 엔진 다운로드 중...",
        });
      });

      // 2. 압축 해제
      onProgress({
        total: 100,
        current: 100,
        percent: 100,
        status: "설치 및 최적화 중...",
      });
      logger.info("Extracting browser...");

      if (fileName.endsWith(".zip")) {
        await extract(downloadPath, { dir: this.browserPath });
      } else {
        if (fileName.endsWith(".tgz") || fileName.endsWith(".tar.gz")) {
          await tar.extract({ file: downloadPath, cwd: this.basePath });
        } else {
          await extract(downloadPath, { dir: this.browserPath });
        }
      }

      // 3. 임시 파일 정리 (Windows 권한 에러 방지를 위해 약간의 지연 후 시도)
      setTimeout(async () => {
        try {
          await fs.unlink(downloadPath);
        } catch (e) {
          logger.warn(`Failed to cleanup temp file: ${e}`);
        }
      }, 1000);

      // 4. 실행 권한 부여 (Mac/Linux)
      if (process.platform !== "win32") {
        const execPath = this.getExecutablePath();
        if (await fs.pathExists(execPath)) {
          await fs.chmod(execPath, 0o755);
        }
      }

      logger.info("Browser installed successfully.");
    } catch (error: any) {
      logger.error(`Installation failed: ${error.message}`);
      // 실패 시 다운로드 파일 정리 시도
      try {
        if (await fs.pathExists(downloadPath)) {
          await fs.unlink(downloadPath);
        }
      } catch {}
      throw error;
    }
  }
}

export const browserManager = BrowserManager.getInstance();
