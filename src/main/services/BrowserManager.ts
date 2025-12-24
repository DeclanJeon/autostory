import fs from "fs-extra";
import path from "path";
import { app } from "electron";
import https from "https";
import extract from "extract-zip";
import * as tar from "tar";
import { logger } from "../utils/logger";

// Playwright 1.49.0 대응 Chromium Revision (Build 1148 / 131.0.x)
// 이 버전은 주기적으로 업데이트가 필요할 수 있습니다.
const CHROMIUM_REVISION = "1148";

export interface DownloadProgress {
  total: number;
  current: number;
  percent: number;
  status: string;
}

/**
 * 브라우저 관리자 클래스
 *
 * OS별 브라우저 다운로드, 설치, 경로 관리를 담당합니다.
 *
 * @class BrowserManager
 */
export class BrowserManager {
  private static instance: BrowserManager;
  private basePath: string;
  private browserPath: string;

  private constructor() {
    // OS별 권한 문제 방지를 위해 userData(AppData/Application Support) 내부에 저장
    this.basePath = path.join(app.getPath("userData"), "browsers");
    this.browserPath = path.join(
      this.basePath,
      `chromium-${CHROMIUM_REVISION}`
    );
  }

  /**
   * 싱글톤 인스턴스를 반환합니다.
   *
   * @static
   * @returns {BrowserManager} 싱글톤 인스턴스
   */
  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * 현재 플랫폼에 맞는 브라우저 실행 파일 경로를 반환합니다.
   *
   * @public
   * @returns {string} 실행 파일의 절대 경로
   */
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

  /**
   * 브라우저가 이미 설치되어 있는지 확인합니다.
   *
   * @public
   * @returns {Promise<boolean>} 설치되어 있으면 true
   */
  public async isInstalled(): Promise<boolean> {
    const execPath = this.getExecutablePath();
    return fs.pathExists(execPath);
  }

  /**
   * 현재 플랫폼에 맞는 다운로드 URL을 반환합니다.
   *
   * @private
   * @returns {string} 다운로드 URL
   */
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
   * 브라우저를 다운로드하고 설치합니다.
   *
   * @public
   * @param {(progress: DownloadProgress) => void} onProgress - 다운로드 진행 상황 콜백
   * @returns {Promise<void>}
   */
  public async install(
    onProgress: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (await this.isInstalled()) {
      return;
    }

    const url = this.getDownloadUrl();
    const fileName = path.basename(url);
    const downloadPath = path.join(this.basePath, fileName);

    await fs.ensureDir(this.basePath);
    logger.info(`Starting browser download: ${url}`);

    // 1. 다운로드
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(downloadPath);
      const request = https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers["content-length"] || "0", 10);
        let current = 0;

        response.on("data", (chunk) => {
          current += chunk.length;
          const percent = total > 0 ? Math.round((current / total) * 100) : 0;

          onProgress({
            total,
            current,
            percent,
            status: "브라우저 엔진 다운로드 중...",
          });
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      });

      request.on("error", (err) => {
        fs.unlink(downloadPath).catch(() => {});
        reject(err);
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

    try {
      if (fileName.endsWith(".zip")) {
        await extract(downloadPath, { dir: this.browserPath });
      } else {
        // Linux (.zip이 아닐 경우 대비, 보통 CDN은 zip을 주지만 예외처리)
        if (fileName.endsWith(".tgz") || fileName.endsWith(".tar.gz")) {
          await tar.extract({ file: downloadPath, cwd: this.basePath });
        } else {
          // Linux zip 처리
          await extract(downloadPath, { dir: this.browserPath });
        }
      }

      // 실행 권한 부여 (Mac/Linux)
      if (process.platform !== "win32") {
        const execPath = this.getExecutablePath();
        if (await fs.pathExists(execPath)) {
          await fs.chmod(execPath, 0o755);
        }
      }

      logger.info("Browser installed successfully.");
    } catch (error) {
      logger.error(`Extraction failed: ${error}`);
      throw error;
    } finally {
      await fs.unlink(downloadPath).catch(() => {});
    }
  }
}

/**
 * 싱글톤 인스턴스 내보내기
 */
export const browserManager = BrowserManager.getInstance();
