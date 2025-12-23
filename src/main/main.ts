import { app, BrowserWindow } from "electron";
import path from "path";
import { registerHandlers } from "./ipc/handlers";
import store from "./config/store";
import { ollamaInstaller } from "./utils/ollamaInstaller";

// Linux Sandbox 관련 명령줄 인자 처리
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer"); // 간혹 도움됨
}

let mainWindow: BrowserWindow | null = null;

const createWindow = async () => {
  const currentSettings = store.get("settings");
  const updatedSettings = { ...currentSettings };

  if (
    currentSettings.aiModel === "gemini-1.5-flash" ||
    !currentSettings.aiModel
  ) {
    console.log("Migrating AI Model to gemini-2.5-flash");
    updatedSettings.aiModel = "gemini-2.5-flash";
  }

  if (currentSettings.aiProvider === "openrouter") {
    const problematicModels = [
      "amazon/nova-2-lite-v1:free",
      "meta-llama/llama-3.2-3b-instruct:free",
    ];

    if (problematicModels.includes(currentSettings.aiModel)) {
      console.log(
        `Migrating OpenRouter Model from ${currentSettings.aiModel} to xiaomi/mimo-v2-flash:free`
      );
      updatedSettings.aiModel = "xiaomi/mimo-v2-flash:free";
    }
  }

  if (!currentSettings.aiProvider) {
    console.log("Setting default AI provider to gemini");
    updatedSettings.aiProvider = "gemini";
  }

  // 로컬 AI 설정 마이그레이션
  if (!currentSettings.localAiModel) {
    console.log("Setting default local AI model to gemma3:4b");
    updatedSettings.localAiModel = "gemma3:4b";
  }

  store.set("settings", updatedSettings);

  console.log("Current Settings:", {
    provider: store.get("settings").aiProvider,
    model: store.get("settings").aiModel,
    localAiModel: store.get("settings").localAiModel,
  });

  // 로컬 AI 설정 확인 및 서버 자동 시작
  const settings = store.get("settings");
  if (settings.aiProvider === "local") {
    const isInstalled = await ollamaInstaller.isInstalled();
    if (isInstalled) {
      console.log("Starting Ollama server...");
      await ollamaInstaller.startServer();
    }
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // [수정됨] dist/main/main.js 기준 -> ../renderer/index.html
    // vite.config.ts에서 outDir: 'dist/renderer'로 설정했으므로 이 경로가 맞습니다.
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  registerHandlers(mainWindow);
};

app.whenReady().then(createWindow);

// 앱 종료 시 Ollama 서버 정리
app.on("before-quit", async () => {
  await ollamaInstaller.stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
