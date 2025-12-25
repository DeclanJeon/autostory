import { safeStorage } from "electron";
import store from "../config/store";
import { logger } from "../utils/logger";

/**
 * 보안 설정 관리 서비스
 * 민감한 데이터(API Key 등)는 OS Keychain에 암호화하여 저장합니다.
 */
export class SecureConfigService {
  private static instance: SecureConfigService;

  private constructor() {}

  public static getInstance(): SecureConfigService {
    if (!SecureConfigService.instance) {
      SecureConfigService.instance = new SecureConfigService();
    }
    return SecureConfigService.instance;
  }

  /**
   * 민감한 데이터를 암호화하여 저장
   */
  public setSecureItem(key: string, value: string): boolean {
    if (!safeStorage.isEncryptionAvailable()) {
      logger.warn(
        "SafeStorage is not available on this OS. Using fallback storage."
      );
      // Fallback: 일반 스토어에 저장 (경고 후)
      (store as any).set(`secure.${key}`, value);
      return false;
    }

    try {
      const buffer = safeStorage.encryptString(value);
      // 버퍼를 hex 문자열로 변환하여 저장
      (store as any).set(`secure.${key}`, buffer.toString("hex"));
      logger.info(`Encrypted and stored secure item: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Encryption failed for ${key}: ${error}`);
      // Fallback으로 일반 스토어에 저장
      (store as any).set(`secure.${key}`, value);
      return false;
    }
  }

  /**
   * 암호화된 데이터를 복호화하여 조회
   */
  public getSecureItem(key: string): string | null {
    const encryptedHex = (store as any).get(`secure.${key}`) as string;
    if (!encryptedHex) return null;

    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback 저장소에서 시도
      return encryptedHex;
    }

    try {
      const buffer = Buffer.from(encryptedHex, "hex");
      const decrypted = safeStorage.decryptString(buffer);
      logger.debug(`Decrypted secure item: ${key}`);
      return decrypted;
    } catch (error) {
      logger.error(`Decryption failed for ${key}: ${error}`);
      // 복호화 실패 시 null 반환 (보안상)
      return null;
    }
  }

  /**
   * 민감한 아이템 삭제
   */
  public deleteSecureItem(key: string): void {
    (store as any).delete(`secure.${key}`);
    logger.info(`Deleted secure item: ${key}`);
  }

  /**
   * 일반 설정과 보안 설정을 통합하여 반환
   */
  public async getFullSettings(): Promise<any> {
    const plainSettings: any = (store as any).get("settings") || {};

    // 민감한 키 복호화 주입
    const aiApiKey = this.getSecureItem("aiApiKey");
    const openrouterApiKey = this.getSecureItem("openrouterApiKey");
    const pexelsApiKey = this.getSecureItem("pexelsApiKey");

    return {
      ...plainSettings,
      // 보안 저장소에 있으면 그 값을 사용, 없으면 일반 저장소 값 사용
      aiApiKey: aiApiKey || plainSettings.aiApiKey || "",
      openrouterApiKey:
        openrouterApiKey || plainSettings.openrouterApiKey || "",
      pexelsApiKey: pexelsApiKey || plainSettings.pexelsApiKey || "",
    };
  }

  /**
   * 기존 평문 저장된 API 키를 보안 스토리지로 마이그레이션
   * 앱 업그레이드 시 한 번만 실행되어야 합니다.
   */
  public migrateToSecureStorage(): void {
    const plainSettings: any = (store as any).get("settings") || {};
    const keysToMigrate = ["aiApiKey", "openrouterApiKey", "pexelsApiKey"];

    let migratedCount = 0;

    keysToMigrate.forEach((key) => {
      const value = plainSettings[key];
      if (value && typeof value === "string" && value.length > 0) {
        // 보안 스토어에 없고, 일반 스토어에 있는 경우만 마이그레이션
        const alreadyEncrypted = (store as any).get(`secure.${key}`);
        if (!alreadyEncrypted) {
          this.setSecureItem(key, value);
          // 일반 스토어에서 삭제
          delete plainSettings[key];
          (store as any).set("settings", plainSettings);
          migratedCount++;
        }
      }
    });

    if (migratedCount > 0) {
      logger.info(`Migrated ${migratedCount} API keys to secure storage`);
    }
  }
}

export const secureConfig = SecureConfigService.getInstance();
