import fs from "fs-extra";
import path from "path";
import { app, dialog } from "electron";
import { logger } from "../utils/logger";
import store from "../config/store";
import { createWorker } from "tesseract.js";
import https from "https"; // 다운로드를 위해 추가
const { createCanvas, Canvas, Image, ImageData } = require("@napi-rs/canvas");

// [Polyfill] Canvas related objects for Node.js environment (Required for pdfjs-dist & tesseract.js)
(global as any).Canvas = Canvas;
(global as any).Image = Image;
(global as any).ImageData = ImageData;

// [Type Definition] Polyfill for Promise.withResolvers
declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: any) => void;
    };
  }
}

// [Polyfill] DOMMatrix for Node.js environment
if (typeof global.DOMMatrix === "undefined") {
  (global as any).DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(init?: string | number[]) {
      if (Array.isArray(init)) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    translate(x: number, y: number) {
      return this;
    }
    scale(x: number, y: number) {
      return this;
    }
    multiply(other: any) {
      return this;
    }
    toString() {
      return (
        "matrix(" +
        this.a +
        ", " +
        this.b +
        ", " +
        this.c +
        ", " +
        this.d +
        ", " +
        this.e +
        ", " +
        this.f +
        ")"
      );
    }
  };
}

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return {
      canvas: canvas,
      context: context,
    };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

// [OPTIMIZATION] 전역 캐시 변수 추가
let postsCache: any[] | null = null;
let lastCacheTime = 0;
const POSTS_CACHE_DURATION = 5000; // 5초 (잦은 갱신 방지)

export class FileManager {
  private baseDir: string;
  private tessDataDir: string;

  constructor() {
    // 앱 데이터 폴더 내 'posts' 디렉토리 사용
    this.baseDir = path.join(app.getPath("userData"), "posts");
    // Tesseract 언어 데이터 저장 경로 (캐싱용)
    this.tessDataDir = app.getPath("userData");
  }

  // [OPTIMIZATION] 캐시 무효화 메소드
  private invalidateCache() {
    postsCache = null;
    lastCacheTime = 0;
  }

  public async savePost(
    category: string,
    title: string,
    content: string,
    format: "md" | "html" = "html"
  ): Promise<string> {
    try {
      const categoryDir = path.join(this.baseDir, category || "General");
      await fs.ensureDir(categoryDir);

      let safeTitle = title
        .replace(/[^\w\uac00-\ud7af\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);

      if (!safeTitle || safeTitle.length === 0) {
        safeTitle = "untitled_post";
      }

      const dateStr = new Date().toISOString().split("T")[0];
      const extension = format === "html" ? "html" : "md";
      const fileName = `${dateStr}_${safeTitle}.${extension}`;
      const filePath = path.join(categoryDir, fileName);

      let fileContent: string;

      if (format === "html") {
        fileContent = this.wrapWithHtmlTemplate(title, content);
      } else {
        fileContent = `# ${title}\n\n${content}`;
      }

      await fs.writeFile(filePath, fileContent, "utf-8");
      logger.info(`파일 저장 완료: ${fileName}`);

      // [OPTIMIZATION] 저장 시 캐시 초기화
      this.invalidateCache();

      return filePath;
    } catch (error) {
      logger.error(`파일 저장 실패: ${error}`);
      throw error;
    }
  }

  private wrapWithHtmlTemplate(title: string, content: string): string {
    // 1. 전문적인 색상 팔레트 정의
    const colorPalette = [
      "#6c5ce7", // Original Purple
      "#0984e3", // Electron Blue
      "#00b894", // Mint Green
      "#d63031", // Alizarin Red (Accent) - Maybe too strong for main theme? Let's stick to cooler/neutral tones for main.
      "#e17055", // Orange
      "#e84393", // Coral
      "#2d3436", // Dark Gray (Classic)
      "#00cec9", // Robin's Egg Blue
      "#6ab04c", // Pure Apple
      "#4834d4", // Deep Cove
      "#be2edd", // Middle Blue
      "#22a6b3", // Turbo
    ];

    // 2. 랜덤 색상 선택
    const themeColor =
      colorPalette[Math.floor(Math.random() * colorPalette.length)];

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800;900&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
      font-size: 17px;
      line-height: 2.0;
      color: #2d3436;
      padding: 40px;
      max-width: 100%;
      background: transparent;
    }
    
    /* 헤드라인 스타일 - 1.7배 */
    .headline, h1 {
      font-size: 1.7em !important;
      font-weight: 800 !important;
      color: #1a1a2e !important;
      line-height: 1.4 !important;
      margin-bottom: 30px !important;
      letter-spacing: -1px;
    }
    
    h2 {
      font-size: 1.5em;
      font-weight: 700;
      color: #1a1a2e;
      margin-top: 60px;
      margin-bottom: 25px;
      padding-bottom: 15px;
      border-bottom: 2px solid #1a1a2e;
    }
    
    h3 {
      font-size: 1.3em;
      font-weight: 700;
      color: #2d3436;
      margin-top: 50px;
      margin-bottom: 20px;
      padding-left: 15px;
      border-left: 4px solid ${themeColor};
    }
    
    h4 {
      font-size: 1.15em;
      font-weight: 600;
      color: #2d3436;
      margin-top: 40px;
      margin-bottom: 15px;
    }
    
    p {
      margin-bottom: 24px;
      letter-spacing: -0.03em;
      word-break: keep-all;
    }
    
    /* 핵심 강조 스타일 - 1.2배 */
    strong {
      font-size: 1.2em !important;
      font-weight: 700 !important;
      color: #e63946 !important;
    }
    
    /* 강조 단락 - 기울임 + 상하 보더 + 패딩 */
    .emphasis-block, .highlight-paragraph {
      font-style: italic;
      padding: 25px 0;
      margin: 30px 0;
      border-top: 1px solid #ddd;
      border-bottom: 1px solid #ddd;
      color: #555;
      font-size: 1.05em;
      line-height: 1.9;
    }
    
    /* 인용문 스타일 - 배경색 없이 보더만 */
    blockquote {
      margin: 40px 0;
      padding: 0 0 0 25px;
      border-left: 4px solid ${themeColor};
      color: #555;
      font-size: 1.05em;
      line-height: 1.9;
      font-style: italic;
    }
    
    /* 목차 스타일 - 배경색 대신 보더 */
    .toc {
      padding: 25px 30px;
      margin: 40px 0;
      border: 2px solid #e9ecef;
      border-radius: 8px;
    }
    
    .toc h3 {
      margin: 0 0 20px 0;
      padding: 0;
      border: none;
      font-size: 1.2em;
      color: #1a1a2e;
    }
    
    .toc ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .toc li {
      padding: 10px 0;
      border-bottom: 1px dashed #ddd;
    }
    
    .toc li:last-child {
      border-bottom: none;
    }
    
    .toc a {
      color: #2d3436;
      text-decoration: none;
      font-weight: 500;
    }
    
    .toc a:hover {
      color: ${themeColor};
    }
    
    /* 요약 박스 - 배경색 대신 보더 */
    .summary-box {
      border-left: 5px solid ${themeColor};
      padding: 20px 25px;
      margin-bottom: 50px;
    }
    
    .summary-box p {
      margin: 0;
      font-size: 1.3em;
      color: #2d3436;
      font-weight: 600;
      line-height: 1.6;
      font-style: italic;
    }
    
    /* 서론/마무리 강조 - 기울임 + 보더 */
    .intro-text {
      font-style: italic;
      padding: 20px 0;
      margin: 30px 0;
      border-top: 1px solid #ddd;
      border-bottom: 1px solid #ddd;
      color: #555;
      line-height: 1.9;
    }
    
    .conclusion-text {
      font-style: italic;
      padding: 20px 0;
      margin: 30px 0;
      border-top: 2px solid #2d3436;
      border-bottom: 2px solid #2d3436;
      color: #2d3436;
      font-weight: 500;
      line-height: 1.9;
    }
    
    /* CTA 영역 */
    .cta-box {
      padding: 25px 0;
      margin: 40px 0;
      border-top: 2px solid #1a1a2e;
      border-bottom: 2px solid #1a1a2e;
      text-align: center;
    }
    
    .cta-box p {
      margin: 0;
      font-size: 1.1em;
      font-weight: 600;
      color: #1a1a2e;
    }
    
    /* 이미지 스타일 */
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 40px auto;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    
    figure {
      margin: 40px 0;
      text-align: center;
    }
    
    figcaption {
      margin-top: 12px;
      font-size: 0.9em;
      color: #868e96;
      font-style: italic;
    }
    
    hr {
      margin: 60px 0;
      border: none;
      border-top: 1px dashed #ccc;
    }
    
    /* 리스트 스타일 */
    ul, ol {
      margin: 20px 0 30px 25px;
    }
    
    li {
      margin-bottom: 12px;
      line-height: 1.8;
    }
    
    /* 이미지 컨테이너 */
    .image-container {
      display: flex;
      justify-content: center;
      margin: 40px 0;
    }
    
    /* 숫자 강조 */
    .number-highlight {
      font-size: 1.3em;
      font-weight: 800;
      color: #e63946;
    }
    
    /* 키워드 태그 - 배경색 대신 보더 */
    .keyword-tag {
      display: inline-block;
      border: 1px solid ${themeColor};
      color: ${themeColor};
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.9em;
      font-weight: 500;
      margin: 0 5px 10px 0;
    }
    
    /* 팁/노트 박스 - 보더만 사용 */
    .tip-box, .note-box {
      margin: 30px 0;
      padding: 20px 25px;
      border: 1px solid #ddd;
      border-left: 4px solid ${themeColor};
      border-radius: 0 8px 8px 0;
    }
    
    .tip-box p, .note-box p {
      margin: 0;
      font-style: italic;
      color: #555;
    }
    
    /* 코드 스타일 */
    code {
      font-family: 'Fira Code', monospace;
      font-size: 0.9em;
      color: #e63946;
      padding: 2px 6px;
      border: 1px solid #eee;
      border-radius: 4px;
    }
    
    pre {
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow-x: auto;
      margin: 30px 0;
    }
    
    pre code {
      border: none;
      padding: 0;
      color: #2d3436;
    }
  </style>
</head>
<body>
${content}
</body>
</html>`;
  }

  // [OPTIMIZATION] 캐싱 및 병렬 처리 적용
  public async listPosts(): Promise<any[]> {
    const now = Date.now();

    // 캐시가 유효하면 즉시 반환
    if (postsCache && now - lastCacheTime < POSTS_CACHE_DURATION) {
      return postsCache;
    }

    try {
      await fs.ensureDir(this.baseDir);
      const categories = await fs.readdir(this.baseDir);
      let results: any[] = [];
      const publishedPosts = store.get("publishedPosts") || [];

      // 병렬 처리: 모든 카테고리를 동시에 스캔
      const categoryPromises = categories.map(async (category) => {
        const categoryPath = path.join(this.baseDir, category);
        try {
          const stat = await fs.stat(categoryPath);
          if (stat.isDirectory()) {
            const files = await fs.readdir(categoryPath);
            // 병렬 처리: 폴더 내 파일들도 동시에 스캔
            const filePromises = files.map(async (file) => {
              if (file.endsWith(".md") || file.endsWith(".html")) {
                const filePath = path.join(categoryPath, file);
                try {
                  const fileStat = await fs.stat(filePath);
                  return {
                    name: file,
                    path: filePath,
                    category: category,
                    createdAt: fileStat.birthtime.toISOString(),
                    isPublished: publishedPosts.includes(filePath),
                    format: file.endsWith(".html") ? "html" : "md",
                  };
                } catch {
                  return null;
                }
              }
              return null;
            });

            const categoryFiles = await Promise.all(filePromises);
            return categoryFiles.filter((f) => f !== null);
          }
        } catch {
          return [];
        }
        return [];
      });

      const allFiles = await Promise.all(categoryPromises);
      results = allFiles.flat();

      const sortedResults = results.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // 캐시 업데이트
      postsCache = sortedResults;
      lastCacheTime = now;

      return sortedResults;
    } catch (error) {
      logger.error(`파일 목록 조회 실패: ${error}`);
      return [];
    }
  }

  public async readPost(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      logger.error(`글 읽기 실패: ${error}`);
      throw error;
    }
  }

  public async deletePost(filePath: string): Promise<void> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath);

        // publishedPosts 스토어에서도 제거
        const published = store.get("publishedPosts") || [];
        const newPublished = published.filter((p: string) => p !== filePath);
        store.set("publishedPosts", newPublished);

        logger.info(`파일 삭제 완료: ${filePath}`);

        // [OPTIMIZATION] 삭제 시 캐시 초기화
        this.invalidateCache();
      }
    } catch (error) {
      logger.error(`파일 삭제 실패: ${error}`);
      throw error;
    }
  }

  public async parseFileContent(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === ".pdf") {
        let pdfjsLib: any;
        const potentialPaths = [
          "pdfjs-dist/legacy/build/pdf.js",
          "pdfjs-dist/build/pdf.js",
          "pdfjs-dist/es5/build/pdf.js",
          "pdfjs-dist",
        ];

        for (const p of potentialPaths) {
          try {
            pdfjsLib = require(p);
            logger.info(`Loaded pdfjs-dist from: ${p}`);
            break;
          } catch (e) {
            // continue
          }
        }

        if (!pdfjsLib) {
          throw new Error(
            "pdfjs-dist 모듈을 찾을 수 없습니다. (모든 경로 시도 실패)"
          );
        }

        logger.info(`PDF.js loaded. Reading: ${path.basename(filePath)}`);

        const data = new Uint8Array(await fs.readFile(filePath));

        const loadingTask = pdfjsLib.getDocument({
          data,
          useSystemFonts: true,
          disableFontFace: true,
          disableWorker: true,
          verbosity: 0,
        });

        const doc = await loadingTask.promise;
        logger.info(`PDF opened. Total pages: ${doc.numPages}`);

        let fullText = "";

        // 1. 텍스트 레이어 추출 시도
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          fullText += pageText + "\n\n";
        }

        // 2. 텍스트가 없으면 OCR 시도
        if (fullText.trim().length < 50) {
          logger.info(
            "텍스트 레이어가 없습니다. OCR(광학 문자 인식)을 시작합니다..."
          );

          // [핵심] 언어 파일 확인 및 다운로드
          await this.ensureTrainedData("kor");
          await this.ensureTrainedData("eng");

          logger.info("OCR 엔진 초기화 중...");

          const worker = await createWorker("kor+eng", 1, {
            cachePath: this.tessDataDir,
            logger: (m: any) => {
              // 다운로드 로그는 우리가 직접 처리하므로, 인식 로그만 봅니다.
              if (m.status === "recognizing text") {
                logger.info(`OCR 인식 중: ${(m.progress * 100).toFixed(0)}%`);
              }
            },
          });

          fullText = ""; // 초기화

          for (let i = 1; i <= doc.numPages; i++) {
            try {
              const page = await doc.getPage(i);
              const viewport = page.getViewport({ scale: 1.5 }); // 해상도 향상
              const canvasFactory = new NodeCanvasFactory();
              const { canvas, context } = canvasFactory.create(
                viewport.width,
                viewport.height
              );

              await page.render({
                canvasContext: context,
                viewport: viewport,
                canvasFactory: canvasFactory,
              }).promise;

              const imageBuffer = canvas.toBuffer("image/png");
              const {
                data: { text },
              } = await worker.recognize(imageBuffer);

              fullText += text + "\n\n";

              logger.info(`OCR Progress: ${i}/${doc.numPages} pages processed`);

              // 메모리 해제
              canvasFactory.destroy({ canvas, context });
            } catch (ocrError) {
              logger.error(`Page ${i} OCR failed: ${ocrError}`);
            }
          }

          await worker.terminate();
        }

        if (fullText.trim().length === 0) {
          throw new Error("PDF에서 텍스트를 추출할 수 없습니다. (OCR 실패)");
        }

        return fullText.trim();
      } else {
        // txt, md, html 등은 텍스트로 읽기
        return await fs.readFile(filePath, "utf-8");
      }
    } catch (error) {
      logger.error(`파일 파싱 실패 (${filePath}): ${error}`);
      throw new Error(`파일 내용을 읽을 수 없습니다: ${error}`);
    }
  }

  public markPostAsPublished(filePath: string): void {
    const published = store.get("publishedPosts") || [];
    if (!published.includes(filePath)) {
      store.set("publishedPosts", [...published, filePath]);
    }
  }

  public extractTitleAndBody(
    filePath: string,
    content: string
  ): { title: string; body: string } {
    if (filePath.endsWith(".html")) {
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

      return {
        title: titleMatch ? titleMatch[1] : "제목 없음",
        body: bodyMatch ? bodyMatch[1].trim() : content,
      };
    } else {
      const lines = content.split("\n");
      if (lines[0].startsWith("# ")) {
        return {
          title: lines[0].replace("# ", "").trim(),
          body: lines.slice(1).join("\n").trim(),
        };
      }
      return {
        title: "제목 없음",
        body: content,
      };
    }
  }

  /**
   * [NEW] Tesseract 언어 데이터 파일 확인 및 다운로드
   */
  private async ensureTrainedData(lang: string): Promise<void> {
    const fileName = `${lang}.traineddata`;
    const filePath = path.join(this.tessDataDir, fileName);

    if (await fs.pathExists(filePath)) {
      logger.info(`OCR 데이터 확인됨: ${fileName}`);
      return;
    }

    logger.warn(
      `OCR 데이터 누락: ${fileName}. 사용자에게 다운로드를 요청합니다.`
    );

    // 사용자에게 다이얼로그로 물어봄
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["다운로드", "취소"],
      defaultId: 0,
      cancelId: 1,
      title: "OCR 추가 데이터 필요",
      message: `'${lang}' 언어 인식을 위한 데이터 파일이 필요합니다.`,
      detail:
        "해당 언어팩(약 2~4MB)이 없으면 PDF 내용을 읽을 수 없습니다. GitHub에서 다운로드하시겠습니까?",
      noLink: true,
    });

    if (response === 1) {
      // 취소 버튼
      throw new Error(
        `OCR 데이터(${lang}) 다운로드가 취소되어 작업을 진행할 수 없습니다.`
      );
    }

    // 다운로드 시작
    logger.info(`다운로드 시작: ${fileName}`);
    // tessdata_fast가 용량이 작고 빠름 (데스크탑용으로 적합)
    const url = `https://github.com/tesseract-ocr/tessdata_fast/raw/main/${fileName}`;

    await this.downloadFile(url, filePath);
    logger.info(`다운로드 완료: ${fileName}`);
  }

  /**
   * [NEW] 파일 다운로드 유틸리티
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      const request = https.get(url, (response) => {
        // 리다이렉트 처리 (GitHub raw 링크는 리다이렉트 될 수 있음)
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (response.headers.location) {
            return this.downloadFile(response.headers.location, destPath)
              .then(resolve)
              .catch(reject);
          }
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(`다운로드 실패: HTTP Status ${response.statusCode}`)
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      });

      request.on("error", (err) => {
        fs.unlink(destPath).catch(() => {}); // 에러 시 파일 삭제
        reject(err);
      });

      file.on("error", (err) => {
        fs.unlink(destPath).catch(() => {});
        reject(err);
      });
    });
  }
}
