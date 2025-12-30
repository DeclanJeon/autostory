import winston from "winston";
import path from "path";
import { app } from "electron";

// Ensure userData path is available (might be an issue if called before app.ready, but usually fine)
// If running in development without electron, this might fail, but we assume electron context.
let logPath: string;
try {
  logPath = app.getPath("userData");
} catch (error) {
  // Fallback for development or when app is not available
  logPath = process.cwd();
}

// AI 관련 로그를 위한 별도 로거
export const aiLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] AI-${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logPath, "logs", "ai.log"),
    }),
  ],
});

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logPath, "logs", "app.log"),
    }),
  ],
});

/**
 * @description UI Toast 메시지 페이로드 타입
 */
export type UiToastPayload = {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
};

// 렌더러 프로세스로 로그 전송을 위한 헬퍼 (IPC 채널 예정)
export const sendLogToRenderer = (window: any, message: string) => {
  logger.info(message);
  if (window && !window.isDestroyed()) {
    window.webContents.send("log-message", `[SYSTEM] ${message}`);
  }
};

/**
 * @description UI Toast 메시지를 Renderer로 전송
 */
export const sendToastToRenderer = (
  window: any,
  payload: UiToastPayload
): void => {
  if (window && !window.isDestroyed()) {
    window.webContents.send("ui-toast", payload);
  }
};
