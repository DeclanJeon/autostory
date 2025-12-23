import fs from "fs-extra";
import { AutomationService } from "./AutomationService";
import { FileManager } from "./FileManager";
import { logger } from "../utils/logger";

export class PublishService {
  private automation: AutomationService;
  private fileManager: FileManager;

  constructor() {
    this.automation = AutomationService.getInstance();
    this.fileManager = new FileManager();
  }

  /**
   * 저장된 HTML/마크다운 파일을 읽어 Tistory에 발행합니다.
   */
  public async publishPostFromFile(
    filePath: string,
    categoryName: string
  ): Promise<boolean> {
    try {
      const isLoggedIn = await this.automation.login();
      if (!isLoggedIn) {
        throw new Error("티스토리 로그인이 필요합니다.");
      }

      const fileContent = await fs.readFile(filePath, "utf-8");
      const { title, body } = this.fileManager.extractTitleAndBody(
        filePath,
        fileContent
      );

      logger.info(`발행 시작: ${title} (카테고리: ${categoryName})`);

      await this.automation.ensureCategoryExists(categoryName);
      await this.automation.writePostFromHtmlFile(
        filePath,
        title,
        categoryName
      );

      return true;
    } catch (error) {
      logger.error(`발행 중 오류 발생: ${error}`);
      return false;
    }
  }
}
