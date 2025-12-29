import React, { useEffect, useState, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import MaterialSelectionModal from "../components/MaterialSelectionModal";
import { Zap, Activity, CheckCircle, Clock, Home } from "lucide-react";

// [MODIFIED] 통계 인터페이스 확장
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

const STAGE_LABELS: Record<PublishStage, string> = {
  idle: "대기 중",
  "checking-auth": "로그인 확인 중",
  "waiting-login": "로그인 대기 중",
  "logging-in": "로그인 중",
  "fetching-feeds": "피드 가져오는 중",
  "selecting-issues": "이슈 선택 중",
  "selecting-style": "스타일 선택 중",
  "generating-content": "AI 글 생성 중",
  "processing-images": "이미지 처리 중",
  publishing: "발행 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소됨",
};

const STAGE_COLORS: Record<PublishStage, string> = {
  idle: "bg-gray-100 text-gray-600",
  "checking-auth": "bg-blue-100 text-blue-700",
  "waiting-login": "bg-yellow-100 text-yellow-700",
  "logging-in": "bg-yellow-100 text-yellow-700",
  "fetching-feeds": "bg-blue-100 text-blue-700",
  "selecting-issues": "bg-blue-100 text-blue-700",
  "selecting-style": "bg-purple-100 text-purple-700",
  "generating-content": "bg-purple-100 text-purple-700",
  "processing-images": "bg-indigo-100 text-indigo-700",
  publishing: "bg-green-100 text-green-700",
  completed: "bg-green-200 text-green-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-orange-100 text-orange-700",
};

// [OPTIMIZATION] 로그 모니터 컴포넌트 분리 및 메모이제이션
const LogMonitor = memo(
  ({ logs, onClear }: { logs: string[]; onClear: () => void }) => {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    return (
      <div className="flex-1 bg-slate-900 text-green-400 p-4 rounded-lg shadow-md font-mono text-sm overflow-hidden flex flex-col h-full min-h-[200px]">
        <div className="mb-2 border-b border-slate-700 pb-2 flex justify-between items-center">
          <span className="font-bold">🖥️ System Log Monitor (Live)</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Max 200 lines</span>
            <span className="text-xs text-slate-500">
              {logs.length} entries
            </span>
            <button
              onClick={onClear}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 transition"
            >
              Clear
            </button>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-slate-400">Live</span>
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
          {logs.length === 0 && (
            <p className="text-slate-600 animate-pulse">System standby...</p>
          )}
          {logs.slice(-50).map((log, index) => (
            <div
              key={`${log}-${index}`}
              className={`mb-1 break-words leading-tight ${
                log.includes("[ERROR]")
                  ? "text-red-400 font-semibold"
                  : log.includes("[SUCCESS]")
                  ? "text-green-400 font-bold"
                  : log.includes("[SCHEDULER]")
                  ? "text-purple-400"
                  : log.includes("[USER]")
                  ? "text-blue-400"
                  : log.includes("⚠️")
                  ? "text-yellow-400"
                  : log.includes("[STYLE]")
                  ? "text-pink-400"
                  : "text-slate-300"
              }`}
            >
              <span className="text-slate-600 mr-2 select-none text-xs">
                {new Date().toLocaleTimeString()}
              </span>
              {log}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    );
  }
);

// [OPTIMIZATION] 사용량 카드 컴포넌트 분리
const UsageCard = memo(
  ({
    platform,
    count,
    limit,
    colorClass,
  }: {
    platform: string;
    count: number;
    limit: number;
    colorClass: string;
  }) => {
    const usagePercent = Math.min(100, (count / limit) * 100);
    const isLimitReached = count >= limit;

    return (
      <div
        className={`bg-white p-4 rounded-lg shadow-md border-l-4 transition-all duration-300 ${
          isLimitReached ? "border-orange-500 bg-orange-50" : colorClass
        }`}
      >
        <h3 className="text-gray-500 text-sm font-medium flex justify-between items-center">
          <span className="flex items-center gap-1">
            <Activity size={14} /> {platform} 발행량
          </span>
          <span className="text-xs font-mono opacity-60">
            {new Date().toLocaleDateString()}
          </span>
        </h3>

        <div className="mt-2">
          <div className="flex justify-between items-end mb-1">
            <span className="text-2xl font-bold tracking-tight">
              {count}{" "}
              <span className="text-sm text-gray-400 font-normal">
                / {limit}
              </span>
            </span>
            {isLimitReached && (
              <span className="text-xs font-bold text-orange-600 bg-white px-2 py-0.5 rounded border border-orange-200 animate-pulse flex items-center gap-1">
                LIMIT
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-700 ease-out ${
                isLimitReached
                  ? "bg-orange-500"
                  : platform === "Tistory"
                  ? "bg-indigo-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${usagePercent}%` }}
            ></div>
          </div>
        </div>
      </div>
    );
  }
);

const Dashboard: React.FC = () => {
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
  const [lastPublishResult, setLastPublishResult] = useState<{
    success: boolean;
    title?: string;
    usedPrompt?: string;
    usedPersona?: string;
    error?: string;
  } | null>(null);

  // [NEW] 홈주제 관련 상태
  const [homeThemes, setHomeThemes] = useState<string[]>([]);
  const [isFetchingHomeTheme, setIsFetchingHomeTheme] = useState(false);
  const [suggestedTheme, setSuggestedTheme] = useState<string | null>(null);

  const navigate = useNavigate();

  // 홈주제 목록 불러오기
  const loadHomeThemes = async () => {
    if (window.electronAPI) {
      try {
        const themes = await window.electronAPI.getHomeThemes();
        setHomeThemes(themes);
      } catch (e) {
        console.error("홈주제 목록 로드 실패:", e);
      }
    }
  };

  // AI 기반 홈주제 추천 (현재는 사용하지 않음, IPC에서 가져옴음)
  const fetchSuggestedHomeTheme = async () => {
    if (window.electronAPI) {
      setIsFetchingHomeTheme(true);
      try {
        const result = await window.electronAPI.getSuggestedHomeTheme({
          title: "", // Dashboard에서는 발행 직전이라 제목이 불확실할 수 있음
          content: "",
        });

        if (result.success) {
          setSuggestedTheme(result.theme);
        }
      } catch (e) {
        console.error("홈주제 추천 실패:", e);
      } finally {
        setIsFetchingHomeTheme(false);
      }
    }
  };

  // 발행 시 홈주제 선택 (현재는 사용하지 않음)
  const handleSelectHomeThemeBeforePublish = async (theme: string) => {
    if (window.electronAPI) {
      try {
        await window.electronAPI.selectHomeThemeBeforePublish({
          title: "",
          content: "",
          selectedTheme: theme,
        });
      } catch (e) {
        console.error("홈주제 선택 실패:", e);
      }
    }
  };

  useEffect(() => {
    // 홈주제 목록 로드
    loadHomeThemes();

    if (window.electronAPI) {
      // 로그 메시지 리스너 핸들러
      const handleLogMessage = (_event: any, message: string) => {
        setLogs((prev) => {
          const newLogs = [...prev, message];
          if (newLogs.length > 200) {
            return newLogs.slice(newLogs.length - 200);
          }
          return newLogs;
        });
      };

      // 발행 단계 변경 리스너 핸들러
      const handlePublishStageChange = (_event: any, data: PublishProgress) => {
        console.log("[Dashboard] Publish stage change:", data);
        setCurrentProgress(data);

        if (["completed", "failed", "cancelled"].includes(data.stage)) {
          setTimeout(() => {
            setIsPublishing(false);
            setCurrentProgress(null);
            loadSchedulerStatus();
          }, 2000);
        }
      };

      // 로그인 상태 변경 리스너 핸들러
      const handleLoginStateChange = (
        _event: any,
        data: { state: string; message: string }
      ) => {
        if (data.state === "logged-in") {
          // 로그인 성공 시 통계 다시 로드
          loadSchedulerStatus();
        }
      };

      // 이벤트 리스너 등록
      const removeLogListener =
        window.electronAPI.onLogMessage?.(handleLogMessage);
      const removeStageListener = window.electronAPI.onPublishStageChange?.(
        handlePublishStageChange
      );
      const removeLoginStateListener = window.electronAPI.onLoginStateChange?.(
        handleLoginStateChange
      );

      return () => {
        removeLogListener?.();
        removeStageListener?.();
        removeLoginStateListener?.();
      };
    }
  }, []);

  const loadSchedulerStatus = async () => {
    if (window.electronAPI) {
      try {
        const status = await window.electronAPI.getSchedulerStatus();
        setSchedulerStatus(status);
        setSelectedInterval(status.intervalMinutes);
        const stats = await window.electronAPI.getDailyStats();
        setDailyStats(stats);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const [dailyStats, setDailyStats] = useState<DailyStats>({
    tistoryCount: 0,
    naverCount: 0,
    lastResetDate: "",
  });

  const handleStartScheduler = async () => {
    if (window.electronAPI) {
      await window.electronAPI.startScheduler(selectedInterval);
      loadSchedulerStatus();
    }
  };
  const handleStopScheduler = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopScheduler();
      loadSchedulerStatus();
    }
  };
  const handleOneClickPublishClick = () => setShowPublishModal(true);
  const handlePublishOptionSelect = (mode: string) => {
    setShowPublishModal(false);
    if (mode === "queue") setShowMaterialModal(true);
    else executePublish("random");
  };
  const handleMaterialConfirm = async (items: any[], homeTheme?: string) => {
    setShowMaterialModal(false);
    if (!items || items.length === 0) return;

    // 선택된 항목들의 ID 추출
    const selectedIds = items.map((item: any) => item.id || item.link);
    await executePublish("queue", selectedIds, homeTheme);
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
      message: "발행 준비 중...",
      canCancel: true,
    });

    try {
      const result = await window.electronAPI.oneClickPublish({
        mode,
        selectedIds: ids,
        homeTheme,
      });

      if (result.success) {
        setLastPublishResult({
          success: true,
          title: result.title,
          usedPrompt: result.usedPrompt,
          usedPersona: result.usedPersona,
        });
      } else {
        setLastPublishResult({
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      setLastPublishResult({
        success: false,
        error: error.message,
      });
    } finally {
      // isPublishing과 currentProgress는 publish-stage-change 이벤트로 관리됨
      loadSchedulerStatus();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 text-slate-800 p-6 gap-6">
      {/* 상태 카드 그리드 */}
      <div className="grid grid-cols-4 gap-4">
        {/* 스케줄러 상태 카드 */}
        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500 relative overflow-hidden transition-transform hover:scale-[1.02]">
          <h3 className="text-gray-500 text-sm font-medium flex justify-between items-center">
            <span className="flex items-center gap-1">
              <Clock size={14} /> 스케줄러
            </span>
            {schedulerStatus.enabled && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse font-bold">
                <Zap size={10} fill="currentColor" />
                ACTIVE
              </span>
            )}
          </h3>
          <p className="text-2xl font-bold mt-1">
            {schedulerStatus.enabled ? (
              <span className="text-green-600">ON</span>
            ) : (
              <span className="text-gray-400">OFF</span>
            )}
          </p>
        </div>

        {/* 티스토리 & 네이버 사용량 카드 (Memoized Component 사용) */}
        <UsageCard
          platform="Tistory"
          count={dailyStats.tistoryCount}
          limit={15}
          colorClass="border-indigo-500"
        />
        <UsageCard
          platform="Naver"
          count={dailyStats.naverCount}
          limit={100}
          colorClass="border-green-500"
        />

        {/* 총 발행량 카드 */}
        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-gray-500">
          <h3 className="text-gray-500 text-sm font-medium flex items-center gap-1">
            <CheckCircle size={14} /> 총 발행 완료
          </h3>
          <p className="text-2xl font-bold mt-1">
            {schedulerStatus.totalPublished}
          </p>
        </div>
      </div>

      {/* 액션 패널 (원클릭 발행 & 설정) */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-bold mb-4">⚡ 빠른 실행</h2>
        <div className="grid grid-cols-2 gap-6">
          {/* 원클릭 발행 버튼 */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-200">
            <button
              onClick={handleOneClickPublishClick}
              disabled={isPublishing}
              className="w-full py-3 rounded-lg font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg transition"
            >
              {isPublishing ? "발행 중..." : "🚀 원클릭 자동 발행"}
            </button>
          </div>

          {/* 스케줄러 설정 */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-xl border border-purple-200 flex gap-2">
            <select
              value={selectedInterval}
              onChange={(e) => setSelectedInterval(Number(e.target.value))}
              className="flex-1 border rounded p-2"
              disabled={schedulerStatus.enabled}
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
              className={`flex-1 py-2 rounded font-bold text-white ${
                schedulerStatus.enabled ? "bg-red-500" : "bg-purple-600"
              }`}
            >
              {schedulerStatus.enabled ? "중지" : "시작"}
            </button>
          </div>
        </div>
      </div>

      {/* [NEW] 홈주제 선택 카드 (준비 단계) */}
      {/* 이 카드는 나중에 발행 모달 내에서 활용될 수 있습니다 */}
      <div className="bg-gradient-to-r from-cyan-50 to-teal-100 p-4 rounded-lg shadow-md border-l-4 border-cyan-200">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-cyan-700" />
          <div className="flex flex-col">
            <h3 className="font-bold text-cyan-900">홈주제 선택</h3>
            <p className="text-xs text-cyan-700">
              티스토리 발행 시 자동으로 분석되어 선택됩니다
            </p>
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-center gap-2 text-sm text-cyan-800">
            <span className="font-medium">현재 추천 주제:</span>
            {suggestedTheme ? (
              <span className="font-bold bg-white px-2 py-1 rounded text-cyan-900">
                {suggestedTheme}
              </span>
            ) : (
              <span className="text-cyan-600 opacity-70">없음</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-cyan-700">
            <span>총 홈주제: {homeThemes.length}개</span>
          </div>
        </div>
      </div>

      {/* [OPTIMIZATION] 로그 모니터 (분리된 컴포넌트 사용) */}
      <LogMonitor logs={logs} onClear={() => setLogs([])} />

      {/* 모달들 (렌더링 조건부 처리) */}
      {showPublishModal && (
        <PublishOptionModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          onSelect={handlePublishOptionSelect}
        />
      )}
      {showMaterialModal && (
        <MaterialSelectionModal
          isOpen={showMaterialModal}
          onClose={() => setShowMaterialModal(false)}
          onConfirm={handleMaterialConfirm}
          defaultTab="posts" // [NEW] 소재 탭을 기본으로 열기
        />
      )}
    </div>
  );
};

// 발행 모드 선택 모달
const PublishOptionModal = ({ isOpen, onClose, onSelect }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg">
        <h3 className="text-lg font-bold mb-4">발행 모드 선택</h3>
        <div className="flex gap-4">
          <button
            onClick={() => onSelect("random")}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            랜덤 (RSS)
          </button>
          <button
            onClick={() => onSelect("queue")}
            className="bg-purple-500 text-white px-4 py-2 rounded"
          >
            선택 (큐)
          </button>
        </div>
        <button onClick={onClose} className="mt-4 text-gray-500">
          닫기
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
