import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MaterialSelectionModal from "../components/MaterialSelectionModal";
import { Zap } from "lucide-react";

type PublishStage =
  | "idle"
  | "checking-auth"
  | "waiting-login"
  | "logging-in"
  | "fetching-feeds"
  | "selecting-issues"
  | "selecting-style" // [추가]
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
  const [countdown, setCountdown] = useState<string>("");
  const [isCancelling, setIsCancelling] = useState(false);

  // [신규] 발행 모드 선택 모달 상태
  const [showPublishModal, setShowPublishModal] = useState(false);

  // [신규] 소재 선택 모달 상태
  const [showMaterialModal, setShowMaterialModal] = useState(false);

  // [추가] 마지막 발행 결과
  const [lastPublishResult, setLastPublishResult] = useState<{
    success: boolean;
    title?: string;
    usedPrompt?: string;
    usedPersona?: string;
    error?: string;
  } | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (window.electronAPI) {
      const removeLogListener = window.electronAPI.onLogMessage(
        (_event, message) => {
          // [최적화] 최대 200개까지만 유지하고 오래된 로그 제거 (Memory Leak 방지)
          setLogs((prev) => {
            const newLogs = [...prev, message];
            if (newLogs.length > 200) {
              return newLogs.slice(newLogs.length - 200);
            }
            return newLogs;
          });
        }
      );

      const removeStageListener = window.electronAPI.onPublishStageChange?.(
        (_event, data: PublishProgress) => {
          setCurrentProgress(data);

          if (
            data.stage === "completed" ||
            data.stage === "failed" ||
            data.stage === "cancelled"
          ) {
            setTimeout(() => {
              setIsPublishing(false);
              setCurrentProgress(null);
              loadSchedulerStatus();
            }, 2000);
          }
        }
      );

      const removeLoginListener = window.electronAPI.onLoginStateChange?.(
        (_event, data) => {
          setLogs((prev) => [...prev, `[로그인] ${data.message}`]);
        }
      );

      loadSchedulerStatus();

      return () => {
        removeLogListener();
        removeStageListener?.();
        removeLoginListener?.();
      };
    }
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (schedulerStatus.enabled && schedulerStatus.nextRun) {
        const remaining = schedulerStatus.nextRun - Date.now();
        if (remaining > 0) {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setCountdown(`${minutes}분 ${seconds}초`);
        } else {
          setCountdown("발행 중...");
          loadSchedulerStatus();
        }
      } else {
        setCountdown("");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [schedulerStatus]);

  const loadSchedulerStatus = async () => {
    if (window.electronAPI) {
      try {
        const status = await window.electronAPI.getSchedulerStatus();
        setSchedulerStatus(status);
        setSelectedInterval(status.intervalMinutes);
      } catch (e) {
        console.error("Failed to load scheduler status:", e);
      }
    }
  };

  const handleOneClickPublishClick = () => {
    // 이미 실행 중이면 무시
    if (isPublishing || schedulerStatus.isRunning) return;
    setShowPublishModal(true);
  };

  const handlePublishOptionSelect = async (mode: "random" | "queue") => {
    setShowPublishModal(false);

    if (mode === "queue") {
      // [변경] 페이지 이동 대신 소재 선택 모달 띄우기
      setShowMaterialModal(true);
    } else {
      // 랜덤 모드: 즉시 실행
      executePublish("random");
    }
  };

  // 소재 선택 완료 후 실행 핸들러 (신규)
  const handleMaterialConfirm = async (
    selectedItems: { type: "rss" | "post"; id: string }[]
  ) => {
    setShowMaterialModal(false);

    // RSS와 소재를 분리
    const rssLinks = selectedItems
      .filter((item) => item.type === "rss")
      .map((item) => item.id);
    const materialIds = selectedItems
      .filter((item) => item.type === "post")
      .map((item) => item.id);

    if (rssLinks.length > 0 && materialIds.length > 0) {
      alert(
        `RSS 피드 ${rssLinks.length}개와 저장된 소재 ${materialIds.length}개가 선택되었습니다.\n\n현재는 한 번에 한 종류만 발행할 수 있습니다.`
      );
      return;
    }

    if (rssLinks.length > 0) {
      // RSS 큐 실행
      await executeRssPublish(rssLinks);
    } else if (materialIds.length > 0) {
      // 소재 큐 실행
      executePublish("queue", materialIds);
    } else {
      alert("발행할 항목이 선택되지 않았습니다.");
    }
  };

  // RSS 일괄 발행 실행
  const executeRssPublish = async (rssLinks: string[]) => {
    if (!window.electronAPI) return;

    setIsPublishing(true);
    setLastPublishResult(null);
    setCurrentProgress({
      stage: "checking-auth",
      message: `${rssLinks.length}개의 RSS 피드를 일괄 발행합니다...`,
      canCancel: true,
    });
    setLogs((prev) => [
      ...prev,
      `[USER] RSS ${rssLinks.length}개 일괄 발행 시작...`,
    ]);

    try {
      const result = await window.electronAPI.oneClickPublish({
        mode: "queue",
        selectedIds: rssLinks,
      });

      if (result.success) {
        setLogs((prev) => [...prev, `[SUCCESS] RSS 일괄 발행 완료`]);
      } else {
        setLogs((prev) => [...prev, `[ERROR] RSS 발행 실패: ${result.error}`]);
      }
    } catch (error: any) {
      setLogs((prev) => [...prev, `[ERROR] ${error.message}`]);
    } finally {
      setIsPublishing(false);
    }
  };

  // 실제 발행 실행 함수 (소재 큐)
  const executePublish = async (
    mode: "random" | "queue",
    selectedIds?: string[]
  ) => {
    if (!window.electronAPI) return;

    setIsPublishing(true);
    setLastPublishResult(null);
    setCurrentProgress({
      stage: "checking-auth",
      message:
        mode === "queue"
          ? `${selectedIds?.length}개의 소재를 일괄 발행합니다...`
          : "랜덤 발행을 시작합니다...",
      canCancel: true,
    });
    setLogs((prev) => [
      ...prev,
      `[USER] ${mode === "queue" ? "선택 소재 일괄" : "랜덤"} 발행 시작...`,
    ]);

    try {
      // IPC 호출
      const result = await window.electronAPI.oneClickPublish({
        mode,
        selectedIds,
      });

      if (result.success) {
        if (mode === "queue") {
          setLogs((prev) => [...prev, `[SUCCESS] 일괄 발행 작업 완료`]);
        } else {
          setLogs((prev) => [...prev, `[SUCCESS] 발행 완료: ${result.title}`]);

          // [추가] 사용된 스타일 정보 로깅
          if (result.usedPrompt || result.usedPersona) {
            setLogs((prev) => [
              ...prev,
              `[STYLE] 사용된 스타일 - 페르소나: ${
                result.usedPersona || "기본"
              }, 프롬프트: ${result.usedPrompt || "기본"}`,
            ]);
          }

          // 단건 발행일 경우 결과 표시
          setLastPublishResult(result);
        }
      } else {
        setLogs((prev) => [...prev, `[ERROR] 발행 실패: ${result.error}`]);
      }
    } catch (error: any) {
      setLogs((prev) => [...prev, `[ERROR] ${error.message}`]);
    } finally {
      loadSchedulerStatus();
    }
  };

  const handleCancelPublish = async () => {
    if (!window.electronAPI?.cancelPublish) return;

    setIsCancelling(true);
    setLogs((prev) => [...prev, "[USER] 발행 취소 요청..."]);

    try {
      const result = await window.electronAPI.cancelPublish();

      if (result.success) {
        setLogs((prev) => [...prev, `[INFO] ${result.message}`]);
      } else {
        setLogs((prev) => [...prev, `[WARN] ${result.message}`]);
      }
    } catch (error: any) {
      setLogs((prev) => [...prev, `[ERROR] 취소 실패: ${error.message}`]);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleStartScheduler = async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.startScheduler(selectedInterval);
      if (result.success) {
        setLogs((prev) => [
          ...prev,
          `[SCHEDULER] ${selectedInterval}분 간격으로 자동 발행 시작`,
        ]);
        loadSchedulerStatus();
      }
    } catch (error: any) {
      setLogs((prev) => [
        ...prev,
        `[ERROR] 스케줄러 시작 실패: ${error.message}`,
      ]);
    }
  };

  const handleStopScheduler = async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.stopScheduler();
      if (result.success) {
        setLogs((prev) => [...prev, "[SCHEDULER] 자동 발행 중지"]);
        loadSchedulerStatus();
      }
    } catch (error: any) {
      setLogs((prev) => [
        ...prev,
        `[ERROR] 스케줄러 중지 실패: ${error.message}`,
      ]);
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("ko-KR");
  };

  const getCurrentStageInfo = () => {
    if (!currentProgress) return null;

    const label = STAGE_LABELS[currentProgress.stage] || currentProgress.stage;
    const colorClass =
      STAGE_COLORS[currentProgress.stage] || "bg-gray-100 text-gray-600";

    return { label, colorClass, ...currentProgress };
  };

  const stageInfo = getCurrentStageInfo();

  return (
    <div className="flex flex-col h-full bg-gray-100 text-slate-800 p-6 gap-6">
      {/* 상태 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500 relative overflow-hidden">
          <h3 className="text-gray-500 text-sm font-medium flex justify-between items-center">
            스케줄러 상태
            {schedulerStatus.enabled && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <Zap size={12} fill="currentColor" />
                NO SLEEP
              </span>
            )}
          </h3>
          <p className="text-2xl font-bold mt-1">
            {schedulerStatus.enabled ? (
              <span className="text-green-600 flex items-center gap-2">
                활성화 됨
              </span>
            ) : (
              <span className="text-gray-400 flex items-center gap-2">
                대기 중 (절전 허용)
              </span>
            )}
          </p>
          {schedulerStatus.enabled && (
            <p className="text-[10px] text-gray-400 mt-2">
              ※ 원활한 자동화를 위해 화면이 꺼지지 않습니다.
            </p>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-purple-500">
          <h3 className="text-gray-500 text-sm font-medium">발행 간격</h3>
          <p className="text-2xl font-bold mt-1">
            {schedulerStatus.enabled
              ? `${schedulerStatus.intervalMinutes}분`
              : "-"}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-green-500">
          <h3 className="text-gray-500 text-sm font-medium">총 발행 수</h3>
          <p className="text-2xl font-bold mt-1">
            {schedulerStatus.totalPublished}건
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-orange-500">
          <h3 className="text-gray-500 text-sm font-medium">다음 발행</h3>
          <p className="text-xl font-bold mt-1">{countdown || "-"}</p>
        </div>
      </div>

      {/* [추가] 마지막 발행 결과 카드 */}
      {lastPublishResult && lastPublishResult.success && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg shadow-md border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-green-800 flex items-center gap-2">
                ✅ 마지막 발행 성공
              </h3>
              <p className="text-sm text-green-700 mt-1">
                <strong>제목:</strong>{" "}
                {lastPublishResult.title?.substring(0, 50)}...
              </p>
              <div className="flex gap-4 mt-2 text-xs">
                {lastPublishResult.usedPersona && (
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                    🎭 {lastPublishResult.usedPersona}
                  </span>
                )}
                {lastPublishResult.usedPrompt && (
                  <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    📝 {lastPublishResult.usedPrompt}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setLastPublishResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 현재 진행 상태 표시 */}
      {isPublishing && stageInfo && (
        <div
          className={`p-4 rounded-lg shadow-md ${stageInfo.colorClass} animate-pulse`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-current animate-ping"></div>
              <div>
                <span className="font-bold text-lg">{stageInfo.label}</span>
                <p className="text-sm opacity-80">{stageInfo.message}</p>
              </div>
            </div>

            {stageInfo.canCancel && (
              <button
                onClick={handleCancelPublish}
                disabled={isCancelling}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  isCancelling
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-red-500 text-white hover:bg-red-600"
                }`}
              >
                {isCancelling ? "취소 중..." : "발행 중지"}
              </button>
            )}
          </div>

          {/* 진행 단계 표시 */}
          <div className="mt-4 flex items-center gap-2">
            {(
              [
                "checking-auth",
                "fetching-feeds",
                "selecting-style", // [수정]
                "generating-content",
                "publishing",
              ] as PublishStage[]
            ).map((stage, idx) => {
              const isActive = stageInfo.stage === stage;
              const isPast =
                getStageOrder(stageInfo.stage) > getStageOrder(stage);

              return (
                <React.Fragment key={stage}>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive
                        ? "bg-white text-blue-600 ring-2 ring-blue-400"
                        : isPast
                        ? "bg-green-500 text-white"
                        : "bg-gray-300 text-gray-600"
                    }`}
                  >
                    {isPast ? "✓" : idx + 1}
                  </div>
                  {idx < 3 && (
                    <div
                      className={`flex-1 h-1 ${
                        isPast ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* 제어 패널 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          🎮 자동 발행 제어판
        </h2>

        <div className="grid grid-cols-2 gap-6">
          {/* 원클릭 발행 */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-200">
            <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
              🚀 원클릭 자동 발행
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              RSS에서 최신 글을 가져와{" "}
              <strong>자동으로 최적의 스타일을 적용</strong>하여 AI 글을
              생성하고 즉시 발행합니다.
            </p>
            <button
              onClick={handleOneClickPublishClick}
              disabled={isPublishing || schedulerStatus.isRunning}
              className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition transform hover:scale-[1.02] ${
                isPublishing || schedulerStatus.isRunning
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              }`}
            >
              {isPublishing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  {stageInfo?.label || "진행 중..."}
                </span>
              ) : (
                "🎯 지금 바로 발행하기"
              )}
            </button>
          </div>

          {/* 스케줄러 설정 */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-xl border border-purple-200">
            <h3 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
              ⏰ 자동 발행 스케줄러
            </h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                발행 간격 선택
              </label>
              <select
                value={selectedInterval}
                onChange={(e) => setSelectedInterval(Number(e.target.value))}
                disabled={schedulerStatus.enabled}
                className="w-full border-2 border-purple-200 rounded-lg p-2 focus:border-purple-500 focus:outline-none disabled:bg-gray-100"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}마다 자동 발행
                  </option>
                ))}
              </select>
            </div>

            {schedulerStatus.enabled ? (
              <button
                onClick={handleStopScheduler}
                className="w-full py-3 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg transition"
              >
                ⏹️ 스케줄러 중지
              </button>
            ) : (
              <button
                onClick={handleStartScheduler}
                disabled={isPublishing}
                className="w-full py-3 rounded-lg font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg transition disabled:bg-gray-400"
              >
                ▶️ 스케줄러 시작
              </button>
            )}

            {schedulerStatus.lastRun > 0 && (
              <p className="text-xs text-gray-500 mt-3 text-center">
                마지막 발행: {formatTime(schedulerStatus.lastRun)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* [신규] 발행 모드 선택 모달 */}
      <PublishOptionModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onSelect={handlePublishOptionSelect}
      />

      {/* [신규] 소재 선택 모달 */}
      <MaterialSelectionModal
        isOpen={showMaterialModal}
        onClose={() => setShowMaterialModal(false)}
        onConfirm={handleMaterialConfirm}
      />

      {/* 로그 모니터 */}
      <div className="flex-1 bg-slate-900 text-green-400 p-4 rounded-lg shadow-md font-mono text-sm overflow-hidden flex flex-col">
        <div className="mb-2 border-b border-slate-700 pb-2 flex justify-between items-center">
          <span className="font-bold">📟 System Log Monitor (Live)</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Max 200 lines</span>
            <span className="text-xs text-slate-500">
              {logs.length} entries
            </span>
            <button
              onClick={() => setLogs([])}
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

        {/* [최적화] 가상 스크롤 적용: 최근 50개만 렌더링하되 전체 데이터는 유지 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
          {logs.length === 0 && (
            <p className="text-slate-600 animate-pulse">System standby...</p>
          )}
          {/* 최근 50개만 렌더링 */}
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
                  : log.includes("[로그인]")
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
    </div>
  );
};

function getStageOrder(stage: PublishStage): number {
  const order: Record<PublishStage, number> = {
    idle: 0,
    "checking-auth": 1,
    "waiting-login": 1,
    "logging-in": 1,
    "fetching-feeds": 2,
    "selecting-issues": 2,
    "selecting-style": 3,
    "generating-content": 4,
    "processing-images": 4,
    publishing: 5,
    completed: 6,
    failed: 6,
    cancelled: 6,
  };
  return order[stage] || 0;
}

// [신규] 발행 모드 선택 모달 컴포넌트
const PublishOptionModal = ({ isOpen, onClose, onSelect }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] backdrop-blur-sm">
      <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 transform transition-all scale-100">
        <h3 className="text-xl font-bold mb-6 text-gray-800 flex items-center gap-2">
          🚀 자동 발행 방식 선택
        </h3>

        <div className="space-y-4">
          <button
            onClick={() => onSelect("random")}
            className="w-full p-4 border-2 border-blue-100 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 rounded-xl text-left transition-all group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-blue-800 text-lg">
                🎲 랜덤 자동 발행
              </span>
              <span className="text-2xl group-hover:scale-110 transition-transform">
                ✨
              </span>
            </div>
            <p className="text-sm text-blue-600 opacity-80">
              RSS 피드나 저장된 소재 중 <strong>아직 발행되지 않은</strong>{" "}
              항목을 1개 랜덤으로 골라 발행합니다.
            </p>
          </button>

          <button
            onClick={() => onSelect("queue")}
            className="w-full p-4 border-2 border-purple-100 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 rounded-xl text-left transition-all group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-purple-800 text-lg">
                📚 소재 선택 발행
              </span>
              <span className="text-2xl group-hover:scale-110 transition-transform">
                ✅
              </span>
            </div>
            <p className="text-sm text-purple-600 opacity-80">
              저장된 소재 목록에서 원하는 항목들을 <strong>직접 선택</strong>
              하여 순차적으로 일괄 발행합니다.
            </p>
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
