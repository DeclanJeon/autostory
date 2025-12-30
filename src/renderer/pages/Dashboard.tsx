import React, { useEffect, useState, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import MaterialSelectionModal from "../components/MaterialSelectionModal";
import {
  Zap,
  Activity,
  CheckCircle,
  Clock,
  Home,
  Loader2,
  Play,
  Square,
  FileText,
  Image as ImageIcon,
  Send,
  UserCheck,
  Search,
  AlertCircle,
  Sparkles,
  Terminal,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";

// [TYPES]
interface DailyStats {
  tistoryCount: number;
  naverCount: number;
  lastResetDate: string;
}

type PublishStage =
  | "idle"
  | "checking-auth"
  | "waiting-login"
  | "logging-in"
  | "fetching-feeds"
  | "selecting-issues"
  | "selecting-style"
  | "generating-content"
  | "processing-images"
  | "publishing"
  | "completed"
  | "failed"
  | "cancelled";

interface SchedulerStatus {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: number;
  nextRun: number | null;
  totalPublished: number;
  isRunning: boolean;
  currentStage?: PublishStage;
  currentMessage?: string;
}

interface PublishProgress {
  stage: PublishStage;
  message: string;
  canCancel: boolean;
}

const INTERVAL_OPTIONS = [
  { value: 5, label: "5분 (Test/Rapid)" },
  { value: 10, label: "10분" },
  { value: 30, label: "30분" },
  { value: 60, label: "1시간" },
  { value: 120, label: "2시간" },
  { value: 180, label: "3시간" },
  { value: 240, label: "4시간" },
  { value: 300, label: "5시간" },
];

// [MAPPING] Progress Steps for Visualizer
const PROGRESS_STEPS = [
  {
    id: "auth",
    label: "인증 & 접속",
    icon: UserCheck,
    stages: ["checking-auth", "waiting-login", "logging-in"],
  },
  {
    id: "prep",
    label: "소재 & 설정",
    icon: Search,
    stages: ["fetching-feeds", "selecting-issues", "selecting-style"],
  },
  {
    id: "create",
    label: "AI 생성",
    icon: Sparkles,
    stages: ["generating-content"],
  },
  {
    id: "process",
    label: "이미지 처리",
    icon: ImageIcon,
    stages: ["processing-images"],
  },
  {
    id: "publish",
    label: "발행",
    icon: Send,
    stages: ["publishing"],
  },
];

const getStepStatus = (
  stepId: string,
  currentStage: PublishStage
): "pending" | "current" | "completed" | "error" => {
  if (currentStage === "idle") return "pending";
  if (currentStage === "failed" || currentStage === "cancelled") return "error";
  if (currentStage === "completed") return "completed";

  const stepIndex = PROGRESS_STEPS.findIndex((s) => s.id === stepId);
  const currentStepIndex = PROGRESS_STEPS.findIndex((s) =>
    s.stages.includes(currentStage)
  );

  if (currentStepIndex === stepIndex) return "current";
  if (currentStepIndex > stepIndex) return "completed";

  return "pending";
};

// [COMPONENT] Progress Pipeline
const ProgressPipeline = ({
  progress,
}: {
  progress: PublishProgress | null;
}) => {
  const currentStage = progress?.stage || "idle";

  return (
    <div className="w-full bg-slate-800/50 backdrop-blur-md rounded-2xl border border-slate-700/50 p-6 shadow-xl relative overflow-hidden">
      {/* Background Gradient Effect */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 opacity-30"></div>

      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="text-blue-400 animate-pulse" />
              작업 진행 상황
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              현재 시스템이 작업을 처리하고 있습니다.
            </p>
          </div>
          {progress && (
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Current Task</span>
              <span className="text-blue-300 font-mono text-sm animate-pulse">
                {progress.message}
              </span>
            </div>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between relative mt-4">
          {/* Connection Line */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-700 -z-10 rounded-full"></div>
          <div
            className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-blue-600 to-green-500 -z-10 rounded-full transition-all duration-1000"
            style={{
              width: `${
                currentStage === "completed"
                  ? 100
                  : Math.max(
                      5,
                      (PROGRESS_STEPS.findIndex((s) =>
                        s.stages.includes(currentStage)
                      ) /
                        (PROGRESS_STEPS.length - 1)) *
                        100
                    )
              }%`,
            }}
          ></div>

          {PROGRESS_STEPS.map((step) => {
            const status = getStepStatus(step.id, currentStage);
            const Icon = step.icon;

            let colorClass = "bg-slate-800 border-slate-600 text-slate-500";
            if (status === "current")
              colorClass =
                "bg-blue-900 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-110";
            if (status === "completed")
              colorClass = "bg-green-900 border-green-500 text-green-400";
            if (status === "error")
              colorClass = "bg-red-900 border-red-500 text-red-400";

            return (
              <div
                key={step.id}
                className="flex flex-col items-center gap-3 relative group"
              >
                <div
                  className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-500 z-10 ${colorClass}`}
                >
                  <Icon
                    size={20}
                    className={
                      status === "current" ? "animate-spin-slow" : undefined
                    }
                  />
                  {status === "current" && (
                    <span className="absolute w-full h-full rounded-full border-2 border-blue-400 animate-ping opacity-20"></span>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold transition-colors duration-300 ${
                    status === "pending" ? "text-slate-600" : "text-slate-300"
                  }`}
                >
                  {step.label}
                </span>

                {/* Tooltip for current status details if needed */}
                {status === "current" && (
                  <div className="absolute -bottom-8 w-max px-2 py-1 bg-blue-900/90 text-blue-200 text-xs rounded text-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {progress?.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// [COMPONENT] Log Monitor
const LogMonitor = memo(
  ({ logs, onClear }: { logs: string[]; onClear: () => void }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showBottomBtn, setShowBottomBtn] = useState(false);

    // 스크롤 이벤트 핸들러: 사용자가 스크롤을 위로 올렸는지 감지
    const handleScroll = () => {
      if (!scrollRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

      // 바닥에서 50px 이내면 오토 스크롤 재활성화
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
      setShowBottomBtn(!isAtBottom);
    };

    const scrollToBottom = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
        setAutoScroll(true);
        setShowBottomBtn(false);
      }
    };

    // 새 로그가 오면 오토스크롤 상태일 때만 내림
    useEffect(() => {
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [logs, autoScroll]);

    return (
      <div
        className={`bg-slate-950 rounded-xl border border-slate-800 shadow-inner flex flex-col transition-all duration-500 relative ${
          isExpanded ? "h-[500px]" : "h-[250px]"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 rounded-t-xl shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-slate-400" />
            <span className="text-xs font-mono text-slate-400 font-bold">
              SYSTEM OUTPUT
            </span>
            {!autoScroll && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded animate-pulse">
                Pause
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              className="px-2 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
            >
              Clear
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-slate-400 hover:text-white transition"
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent relative"
        >
          {logs.length === 0 && (
            <div className="text-slate-700 italic text-center mt-10">
              System is ready. Logs will appear here.
            </div>
          )}
          {logs.slice(-200).map((log, i) => (
            <div key={i} className="break-words">
              <span className="text-slate-600 mr-2 select-none">
                [{new Date().toLocaleTimeString()}]
              </span>
              <span
                className={`
                    ${log.includes("ERROR") ? "text-red-400 font-bold" : ""}
                    ${log.includes("SUCCESS") ? "text-green-400 font-bold" : ""}
                    ${log.includes("WARN") ? "text-yellow-400" : ""}
                    ${
                      !log.includes("ERROR") &&
                      !log.includes("SUCCESS") &&
                      !log.includes("WARN")
                        ? "text-slate-300"
                        : ""
                    }
                `}
              >
                {log}
              </span>
            </div>
          ))}
        </div>

        {/* Scroll to Bottom Button */}
        {showBottomBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 bg-blue-600/90 hover:bg-blue-500 text-white rounded-full p-2 shadow-lg backdrop-blur-sm z-10 transition-all animate-bounce"
            title="맨 아래로 스크롤"
          >
            <ChevronRight className="rotate-90" size={16} />
          </button>
        )}
      </div>
    );
  }
);

// [COMPONENT] Stats Card
const StatCard = ({
  title,
  value,
  max,
  color,
  icon: Icon,
}: {
  title: string;
  value: React.ReactNode;
  max?: number;
  color: "blue" | "green" | "purple" | "orange";
  icon: React.ElementType;
}) => {
  const getGradient = () => {
    switch (color) {
      case "blue":
        return "from-blue-500 to-indigo-600";
      case "green":
        return "from-emerald-500 to-teal-600";
      case "purple":
        return "from-purple-500 to-pink-600";
      case "orange":
        return "from-orange-500 to-red-600";
      default:
        return "from-slate-500 to-slate-600";
    }
  };

  const percent = max ? Math.min(100, (Number(value) / max) * 100) : 0;

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 shadow-lg relative overflow-hidden group hover:bg-white/10 transition-colors">
      <div
        className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity`}
      >
        <Icon size={64} />
      </div>

      <div className="flex flex-col h-full justify-between relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`p-1.5 rounded-lg bg-gradient-to-br ${getGradient()}`}
          >
            <Icon size={16} className="text-white" />
          </div>
          <span className="text-slate-400 text-sm font-medium">{title}</span>
        </div>

        <div>
          <div className="text-2xl font-bold text-white tracking-tight flex items-end gap-1">
            {value}
            {max && (
              <span className="text-sm text-slate-500 font-normal mb-1">
                / {max}
              </span>
            )}
          </div>

          {max && (
            <div className="w-full bg-slate-700/50 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getGradient()} transition-all duration-1000`}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ================= MAIN DASHBOARD =================
const Dashboard: React.FC = () => {
  // ... State Management ...
  const [logs, setLogs] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [currentProgress, setCurrentProgress] =
    useState<PublishProgress | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus>({
    enabled: false,
    intervalMinutes: 60,
    lastRun: 0,
    nextRun: null,
    totalPublished: 0,
    isRunning: false,
  });
  const [selectedInterval, setSelectedInterval] = useState(60);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    tistoryCount: 0,
    naverCount: 0,
    lastResetDate: "",
  });

  const [homeThemes, setHomeThemes] = useState<string[]>([]);
  const [suggestedTheme, setSuggestedTheme] = useState<string | null>(null);

  // Load Data
  useEffect(() => {
    const loadData = async () => {
      if (!window.electronAPI) return;
      try {
        const themes = await window.electronAPI.getHomeThemes();
        setHomeThemes(themes);
        const status = await window.electronAPI.getSchedulerStatus();
        setSchedulerStatus(status);
        setSelectedInterval(status.intervalMinutes);
        const stats = await window.electronAPI.getDailyStats();
        setDailyStats(stats);
      } catch (e) {
        console.error(e);
      }
    };

    loadData();

    if (window.electronAPI) {
      const handleLogMessage = (_event: any, message: string) => {
        setLogs((prev) => {
          const newLogs = [...prev, message];
          return newLogs.length > 200
            ? newLogs.slice(newLogs.length - 200)
            : newLogs;
        });
      };

      const handlePublishStageChange = (_event: any, data: PublishProgress) => {
        setCurrentProgress(data);
        if (["completed", "failed", "cancelled"].includes(data.stage)) {
          setTimeout(() => {
            setIsPublishing(false);
            setCurrentProgress(null);
            loadData(); // Refresh stats
          }, 3000);
        } else {
          setIsPublishing(true); // Ensure publishing state
        }
      };

      const removeLogListener =
        window.electronAPI.onLogMessage?.(handleLogMessage);
      const removeStageListener = window.electronAPI.onPublishStageChange?.(
        handlePublishStageChange
      );

      return () => {
        removeLogListener?.();
        removeStageListener?.();
      };
    }
  }, []);

  // Handlers
  const handleStartScheduler = async () => {
    if (window.electronAPI) {
      await window.electronAPI.startScheduler(selectedInterval);
      // Wait a bit or fetch again
      const status = await window.electronAPI.getSchedulerStatus();
      setSchedulerStatus(status);
    }
  };
  const handleStopScheduler = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopScheduler();
      const status = await window.electronAPI.getSchedulerStatus();
      setSchedulerStatus(status);
    }
  };

  const executePublish = async (
    mode: "random" | "queue",
    ids?: string[],
    homeTheme?: string
  ) => {
    if (!window.electronAPI) return;
    if (isPublishing) return;

    setIsPublishing(true);
    setCurrentProgress({
      stage: "checking-auth",
      message: "시스템 초기화 및 인증 확인 중...",
      canCancel: true,
    });

    try {
      await window.electronAPI.oneClickPublish({
        mode,
        selectedIds: ids,
        homeTheme,
      });
    } catch (error: any) {
      setLogs((prev) => [...prev, `[ERROR] ${error.message}`]);
      setIsPublishing(false);
    }
  };

  const handleMaterialConfirm = (items: any[], homeTheme?: string) => {
    setShowMaterialModal(false);
    const selectedIds = items.map((item: any) => item.id || item.link);
    if (selectedIds.length > 0) executePublish("queue", selectedIds, homeTheme);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-8 gap-8 overflow-y-auto">
      {/* 1. Header & Hero Section */}
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              AutoStory AI Publishing System
            </p>
          </div>

          {/* Quick Actions / Scheduler Toggle */}
          <div className="flex items-center gap-3 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
            <select
              value={selectedInterval}
              onChange={(e) => setSelectedInterval(Number(e.target.value))}
              disabled={schedulerStatus.enabled}
              className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded px-3 py-2 outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={
                schedulerStatus.enabled
                  ? handleStopScheduler
                  : handleStartScheduler
              }
              className={`flex items-center gap-2 px-4 py-2 rounded font-bold text-sm transition-all ${
                schedulerStatus.enabled
                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50"
              }`}
            >
              {schedulerStatus.enabled ? (
                <Square size={14} fill="currentColor" />
              ) : (
                <Play size={14} fill="currentColor" />
              )}
              {schedulerStatus.enabled ? "스케줄러 중지" : "스케줄러 시작"}
            </button>
          </div>
        </div>

        {/* Dynamic Status Hero */}
        {isPublishing ? (
          <ProgressPipeline progress={currentProgress} />
        ) : (
          <div className="w-full bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-8 shadow-xl flex items-center justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Zap size={200} />
            </div>

            <div className="z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-700/50 border border-slate-600 text-xs font-medium text-slate-300 mb-4">
                <Clock size={12} />
                {schedulerStatus.nextRun
                  ? `다음 실행: ${new Date(
                      schedulerStatus.nextRun
                    ).toLocaleTimeString()}`
                  : "대기 중"}
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                시스템 준비 완료
              </h2>
              <p className="text-slate-400 max-w-lg">
                새로운 포스팅을 발행할 준비가 되었습니다. '원클릭 발행'을
                누르거나 스케줄러를 활성화하여 자동화를 시작하세요.
              </p>

              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => setShowPublishModal(true)}
                  className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors shadow-lg flex items-center gap-2"
                >
                  <Zap size={18} className="text-blue-600" />
                  즉시 발행 시작
                </button>
              </div>
            </div>

            {/* Animated Graphic or Pulse */}
            <div className="z-10 hidden md:block">
              <div
                className={`w-32 h-32 rounded-full border-4 flex items-center justify-center ${
                  schedulerStatus.enabled
                    ? "border-green-500/30 animate-pulse bg-green-500/5"
                    : "border-slate-700 bg-slate-800"
                }`}
              >
                <div
                  className={`w-24 h-24 rounded-full flex items-center justify-center ${
                    schedulerStatus.enabled
                      ? "bg-green-500 text-white shadow-[0_0_30px_rgba(34,197,94,0.4)]"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  <Zap
                    size={40}
                    fill={schedulerStatus.enabled ? "currentColor" : "none"}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Tistory 금일 발행"
          value={dailyStats.tistoryCount}
          max={15}
          color="blue"
          icon={FileText}
        />
        <StatCard
          title="Naver 금일 발행"
          value={dailyStats.naverCount}
          max={100}
          color="green"
          icon={FileText}
        />
        <StatCard
          title="총 발행 완료"
          value={schedulerStatus.totalPublished}
          color="purple"
          icon={CheckCircle}
        />
        <StatCard
          title="감지된 홈주제"
          value={homeThemes.length}
          color="orange"
          icon={Home}
        />
      </div>

      {/* 3. Log Monitor */}
      <div className="flex-1 min-h-0">
        <LogMonitor logs={logs} onClear={() => setLogs([])} />
      </div>

      {/* Modals */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2">
              발행 방식 선택
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              어떤 방식으로 포스팅을 발행하시겠습니까?
            </p>

            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => {
                  setShowPublishModal(false);
                  executePublish("random");
                }}
                className="flex items-center gap-4 p-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-blue-500 hover:bg-slate-750 transition group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition">
                  <Sparkles size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-200">
                    랜덤 (RSS 기반)
                  </div>
                  <div className="text-xs text-slate-500">
                    등록된 피드에서 무작위로 최신 글을 가져옵니다.
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowPublishModal(false);
                  setShowMaterialModal(true);
                }}
                className="flex items-center gap-4 p-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-purple-500 hover:bg-slate-750 transition group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition">
                  <FileText size={20} />
                </div>
                <div>
                  <div className="font-bold text-slate-200">직접 선택 (큐)</div>
                  <div className="text-xs text-slate-500">
                    목록에서 원하는 소재를 직접 선택하여 발행합니다.
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowPublishModal(false)}
              className="mt-6 w-full py-3 text-slate-400 hover:text-white transition text-sm font-medium"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {showMaterialModal && (
        <MaterialSelectionModal
          isOpen={showMaterialModal}
          onClose={() => setShowMaterialModal(false)}
          onConfirm={handleMaterialConfirm}
          defaultTab="posts"
        />
      )}
    </div>
  );
};

export default Dashboard;
