import { AutomationService } from "./src/main/services/AutomationService";
import { FileManager } from "./src/main/services/FileManager";
import store from "./src/main/config/store";
import { ipcMain } from "electron";

// [신규] 다중 플랫폼 발행 핸들러
const automation = AutomationService.getInstance();
const fileManager = new FileManager();

ipcMain.handle(
  "publish-post-multi",
  async (_event, { filePath, platforms, category }) => {
    const results: any = {
      tistory: false,
      naver: false,
      errors: [],
    };

    try {
      const content = await fileManager.readPost(filePath);
      const { title } = fileManager.extractTitleAndBody(filePath, content);

      // 1. 네이버 발행
      if (platforms.includes("naver")) {
        try {
          const settings = store.get("settings");
          const blogId = settings.naverBlogId;

          if (!blogId) {
            throw new Error("네이버 블로그 ID가 설정되지 않았습니다.");
          }

          await automation.writeToNaver(blogId, title, content, category);
          results.naver = true;
        } catch (e: any) {
          console.error("Naver publish error:", e);
          results.errors.push(`네이버 실패: ${e.message}`);
        }
      }

      // 2. 티스토리 발행
      if (platforms.includes("tistory")) {
        try {
          const loginResult = await automation.login();
          if (!loginResult) throw new Error("티스토리 로그인 실패");

          await automation.writePostFromHtmlFile(filePath, title, category);
          results.tistory = true;
        } catch (e: any) {
          console.error("Tistory publish error:", e);
          results.errors.push(`티스토리 실패: ${e.message}`);
        }
      }

      // 하나라도 성공하면 발행 완료로 표시
      const isSuccess = results.tistory || results.naver;
      if (isSuccess) {
        fileManager.markPostAsPublished(filePath);
      }

      return { success: isSuccess, results };
    } catch (error: any) {
      return { success: false, error: error.message, results };
    }
  }
);
