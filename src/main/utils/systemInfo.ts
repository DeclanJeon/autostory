import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";

const execAsync = promisify(exec);

export interface SystemInfo {
  totalRamGB: number;
  freeRamGB: number;
  cpuCores: number;
  cpuModel: string;
  platform: string;
  arch: string;
  gpu: GpuInfo | null;
}

export interface GpuInfo {
  name: string;
  vramGB: number;
  driver: string;
  cudaAvailable: boolean;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const cpus = os.cpus();

  const baseInfo: SystemInfo = {
    totalRamGB: Math.round((totalRam / (1024 * 1024 * 1024)) * 10) / 10,
    freeRamGB: Math.round((freeRam / (1024 * 1024 * 1024)) * 10) / 10,
    cpuCores: cpus.length,
    cpuModel: cpus[0]?.model || "Unknown",
    platform: os.platform(),
    arch: os.arch(),
    gpu: null,
  };

  try {
    const gpuInfo = await detectGpu();
    baseInfo.gpu = gpuInfo;
  } catch (error) {
    logger.warn("GPU detection failed:", error);
  }

  return baseInfo;
}

async function detectGpu(): Promise<GpuInfo | null> {
  const platform = os.platform();

  try {
    if (platform === "win32") {
      return await detectWindowsGpu();
    } else if (platform === "linux") {
      return await detectLinuxGpu();
    } else if (platform === "darwin") {
      return await detectMacGpu();
    }
  } catch (error) {
    logger.debug("GPU detection error:", error);
  }

  return null;
}

async function detectWindowsGpu(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execAsync(
      "wmic path win32_VideoController get name,adapterram,driverversion /format:csv"
    );

    const lines = stdout
      .trim()
      .split("\n")
      .filter((line) => line.trim());
    if (lines.length < 2) return null;

    const dataLine = lines[1];
    const parts = dataLine.split(",");

    if (parts.length >= 4) {
      const adapterRam = parseInt(parts[1]) || 0;
      const driverVersion = parts[2] || "Unknown";
      const name = parts[3] || "Unknown GPU";

      const vramGB = Math.round((adapterRam / (1024 * 1024 * 1024)) * 10) / 10;
      const isNvidia = name.toLowerCase().includes("nvidia");

      return {
        name,
        vramGB: vramGB || (await estimateVramFromName(name)),
        driver: driverVersion,
        cudaAvailable: isNvidia,
      };
    }
  } catch (error) {
    logger.debug("Windows GPU detection failed:", error);
  }

  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits"
    );
    const parts = stdout
      .trim()
      .split(",")
      .map((s) => s.trim());

    if (parts.length >= 3) {
      return {
        name: parts[0],
        vramGB: Math.round((parseInt(parts[1]) / 1024) * 10) / 10,
        driver: parts[2],
        cudaAvailable: true,
      };
    }
  } catch (error) {
    logger.debug("nvidia-smi failed:", error);
  }

  return null;
}

async function detectLinuxGpu(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits"
    );
    const parts = stdout
      .trim()
      .split(",")
      .map((s) => s.trim());

    if (parts.length >= 3) {
      return {
        name: parts[0],
        vramGB: Math.round((parseInt(parts[1]) / 1024) * 10) / 10,
        driver: parts[2],
        cudaAvailable: true,
      };
    }
  } catch (error) {
    logger.debug("nvidia-smi failed, trying lspci:", error);
  }

  try {
    const { stdout } = await execAsync("lspci | grep -i vga");
    const lines = stdout.trim().split("\n");

    for (const line of lines) {
      if (line.toLowerCase().includes("nvidia")) {
        const name = line.split(":").pop()?.trim() || "NVIDIA GPU";
        return {
          name,
          vramGB: await estimateVramFromName(name),
          driver: "Unknown",
          cudaAvailable: true,
        };
      } else if (
        line.toLowerCase().includes("amd") ||
        line.toLowerCase().includes("radeon")
      ) {
        const name = line.split(":").pop()?.trim() || "AMD GPU";
        return {
          name,
          vramGB: await estimateVramFromName(name),
          driver: "Unknown",
          cudaAvailable: false,
        };
      }
    }
  } catch (error) {
    logger.debug("lspci failed:", error);
  }

  return null;
}

async function detectMacGpu(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execAsync("system_profiler SPDisplaysDataType");

    const lines = stdout.split("\n");
    let chipsetModel = "";
    let vram = 0;

    for (const line of lines) {
      if (line.includes("Chipset Model:")) {
        chipsetModel = line.split(":")[1]?.trim() || "";
      }
      if (line.includes("VRAM")) {
        const match = line.match(/(\d+)\s*(MB|GB)/i);
        if (match) {
          const value = parseInt(match[1]);
          const unit = match[2].toUpperCase();
          vram = unit === "GB" ? value : value / 1024;
        }
      }
    }

    if (chipsetModel) {
      const isAppleSilicon =
        chipsetModel.toLowerCase().includes("apple") ||
        chipsetModel.toLowerCase().includes("m1") ||
        chipsetModel.toLowerCase().includes("m2") ||
        chipsetModel.toLowerCase().includes("m3") ||
        chipsetModel.toLowerCase().includes("m4");

      if (isAppleSilicon && vram === 0) {
        const totalRam = os.totalmem() / (1024 * 1024 * 1024);
        vram = Math.round(totalRam * 0.75 * 10) / 10;
      }

      return {
        name: chipsetModel,
        vramGB: vram,
        driver: "Metal",
        cudaAvailable: false,
      };
    }
  } catch (error) {
    logger.debug("Mac GPU detection failed:", error);
  }

  return null;
}

async function estimateVramFromName(name: string): Promise<number> {
  const lowerName = name.toLowerCase();

  const vramPatterns: [RegExp, number][] = [
    [/rtx\s*4090/i, 24],
    [/rtx\s*4080/i, 16],
    [/rtx\s*4070\s*ti\s*super/i, 16],
    [/rtx\s*4070\s*ti/i, 12],
    [/rtx\s*4070\s*super/i, 12],
    [/rtx\s*4070/i, 12],
    [/rtx\s*4060\s*ti/i, 8],
    [/rtx\s*4060/i, 8],
    [/rtx\s*3090/i, 24],
    [/rtx\s*3080\s*ti/i, 12],
    [/rtx\s*3080/i, 10],
    [/rtx\s*3070\s*ti/i, 8],
    [/rtx\s*3070/i, 8],
    [/rtx\s*3060\s*ti/i, 8],
    [/rtx\s*3060/i, 12],
    [/rtx\s*3050/i, 8],
    [/gtx\s*1660/i, 6],
    [/gtx\s*1650/i, 4],
    [/gtx\s*1080\s*ti/i, 11],
    [/gtx\s*1080/i, 8],
    [/gtx\s*1070/i, 8],
    [/gtx\s*1060/i, 6],
    [/rx\s*7900\s*xtx/i, 24],
    [/rx\s*7900\s*xt/i, 20],
    [/rx\s*7800\s*xt/i, 16],
    [/rx\s*7700\s*xt/i, 12],
    [/rx\s*7600/i, 8],
    [/rx\s*6900/i, 16],
    [/rx\s*6800/i, 16],
    [/rx\s*6700/i, 12],
    [/rx\s*6600/i, 8],
    [/m3\s*max/i, 48],
    [/m3\s*pro/i, 18],
    [/m3/i, 10],
    [/m2\s*ultra/i, 76],
    [/m2\s*max/i, 38],
    [/m2\s*pro/i, 19],
    [/m2/i, 10],
    [/m1\s*ultra/i, 64],
    [/m1\s*max/i, 32],
    [/m1\s*pro/i, 16],
    [/m1/i, 8],
  ];

  for (const [pattern, vram] of vramPatterns) {
    if (pattern.test(lowerName)) {
      return vram;
    }
  }

  return 4;
}

export function getModelRecommendations(
  systemInfo: SystemInfo,
  models: Array<{
    id: string;
    minRamGB: number;
    minVramGB: number;
    category: string;
  }>
): Map<string, { recommended: boolean; reason: string; score: number }> {
  const recommendations = new Map<
    string,
    { recommended: boolean; reason: string; score: number }
  >();

  const availableRam = systemInfo.totalRamGB;
  const availableVram = systemInfo.gpu?.vramGB || 0;
  const hasGpu = systemInfo.gpu !== null;

  for (const model of models) {
    let score = 0;
    let reasons: string[] = [];
    let recommended = false;

    const ramMargin = availableRam - model.minRamGB;
    const vramMargin = hasGpu ? availableVram - model.minVramGB : 0;

    if (ramMargin >= 4) {
      score += 30;
      reasons.push("충분한 RAM");
    } else if (ramMargin >= 0) {
      score += 15;
      reasons.push("RAM 최소 요구사항 충족");
    } else {
      score -= 50;
      reasons.push(
        `RAM 부족 (필요: ${model.minRamGB}GB, 보유: ${availableRam}GB)`
      );
    }

    if (hasGpu) {
      if (vramMargin >= 2) {
        score += 40;
        reasons.push("충분한 VRAM");
      } else if (vramMargin >= 0) {
        score += 20;
        reasons.push("VRAM 최소 요구사항 충족");
      } else {
        score -= 30;
        reasons.push(
          `VRAM 부족 (필요: ${model.minVramGB}GB, 보유: ${availableVram}GB)`
        );
      }

      if (systemInfo.gpu?.cudaAvailable) {
        score += 10;
        reasons.push("CUDA 가속 가능");
      }
    } else {
      if (model.minVramGB <= 4) {
        score += 10;
        reasons.push("CPU 모드로 실행 가능");
      } else {
        score -= 20;
        reasons.push("GPU 없이 느릴 수 있음");
      }
    }

    if (model.category === "general") {
      score += 5;
    }

    if (score >= 50) {
      recommended = true;
    }

    recommendations.set(model.id, {
      recommended,
      reason: reasons.join(", "),
      score,
    });
  }

  return recommendations;
}
