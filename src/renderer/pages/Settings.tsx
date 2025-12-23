import React, { useState, useEffect, useCallback, useRef } from "react";
import { recommendedFeeds } from "../data/recommendedFeeds";
import {
  LocalAiStatus,
  ModelWithRecommendation,
  InstallProgress,
  SystemInfo,
  ModelCategory,
  VersionInfo,
} from "../types/global";

const Settings: React.FC = () => {
  const [formData, setFormData] = useState({
    blogName: "",
    writeRedirectUrl: "",
    aiApiKey: "",
    aiProvider: "gemini" as "gemini" | "openrouter" | "local",
    aiModel: "gemini-2.5-flash",
    localAiModel: "gemma3:4b",
    localAiEnabled: false,
    openrouterApiKey: "",
    targetLanguage: "Korean",
    rssUrls: [""], // 초기값 빈 문자열 하나
    unsplashAccessKey: "", // 추가
    pexelsApiKey: "", // 추가
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [allModels, setAllModels] = useState<string[]>([]);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState<"free" | "all">("free");
  const [searchTerm, setSearchTerm] = useState("");
  const [showModelList, setShowModelList] = useState(false); // 모델 리스트 표시 여부
  const [selectedModel, setSelectedModel] = useState(""); // 현재 선택된 모델

  // 로컬 AI 관련 상태
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(
    null
  );
  const [isLoadingLocalAi, setIsLoadingLocalAi] = useState(false);
  const [isInstallingOllama, setIsInstallingOllama] = useState(false);
  const [installProgress, setInstallProgress] =
    useState<InstallProgress | null>(null);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState<number>(0);
  const [modelProgressStatus, setModelProgressStatus] = useState<string>("");
  const [pullStatus, setPullStatus] = useState<{
    modelName: string;
    startTime: number;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">(
    "all"
  );
  const [showOnlyRecommended, setShowOnlyRecommended] = useState(false);
  const [searchModelTerm, setSearchModelTerm] = useState("");
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // useRef를 사용하여 최신 availableModels 값 참조
  const availableModelsRef = useRef<string[]>([]);

  // 모델 필터링 함수
  const filterModels = (term: string) => {
    setSearchTerm(term);

    let sourceModels: string[] = [];

    if (formData.aiProvider === "openrouter") {
      sourceModels = showAllModels ? allModels : availableModels;
    } else {
      sourceModels = availableModels;
    }

    if (!term.trim()) {
      setFilteredModels(sourceModels);
      return;
    }

    const filtered = sourceModels.filter((model) =>
      model.toLowerCase().includes(term.toLowerCase())
    );

    setFilteredModels(filtered);
  };

  // 모델 선택 처리 함수
  const handleModelSelect = (model: string) => {
    setFormData((prev) => ({ ...prev, aiModel: model }));
    setSelectedModel(model);
    setShowModelList(false);
    setStatus(`✅ AI 모델이 "${model}"(으)로 설정되었습니다.`);
    setTimeout(() => setStatus(""), 3000);
  };

  useEffect(() => {
    // 초기 로드 시 저장된 설정 불러오기
    if (window.electronAPI) {
      window.electronAPI.getSettings().then((saved) => {
        if (saved) {
          setFormData({
            ...saved,
            rssUrls: saved.rssUrls || [""],
            aiProvider: saved.aiProvider || "gemini",
            aiModel: saved.aiModel || "gemini-2.5-flash",
            localAiModel: saved.localAiModel || "gemma3:4b",
            localAiEnabled: saved.localAiEnabled || false,
            openrouterApiKey: saved.openrouterApiKey || "",
            targetLanguage: saved.targetLanguage || "Korean",
            unsplashAccessKey: saved.unsplashAccessKey || "", // 추가
            pexelsApiKey: saved.pexelsApiKey || "", // 추가
          });
          // 선택된 모델도 설정
          if (saved.aiModel) {
            setSelectedModel(saved.aiModel);
          }
        }
      });
    }
  }, []);

  // 로컬 AI 상태 로드
  useEffect(() => {
    // 로컬 AI 상태 로드
    loadLocalAiStatus();
    checkOllamaVersion();

    const removeInstallListener = window.electronAPI.onLocalAiInstallProgress(
      (_event, progress) => {
        setInstallProgress(progress);
        if (progress.stage === "complete") {
          setIsInstallingOllama(false);
          setTimeout(() => {
            loadLocalAiStatus();
            checkOllamaVersion();
          }, 500);
        } else if (progress.stage === "error") {
          setIsInstallingOllama(false);
        }
      }
    );

    const removeModelListener = window.electronAPI.onLocalAiModelProgress(
      (_event, data) => {
        console.log("=== Model progress event received ===");
        console.log("Data:", JSON.stringify(data));

        if (data && typeof data.progress === "number") {
          setModelProgress(data.progress);
          setModelProgressStatus(data.status || "다운로드 중...");

          // 완료 처리
          if (data.progress >= 100 || data.status === "완료!") {
            console.log("Download complete, refreshing status...");
            setTimeout(() => {
              setPullingModel(null);
              setModelProgress(0);
              setModelProgressStatus("");
              loadLocalAiStatus();
              checkOllamaVersion();
            }, 1500);
          }
        }
      }
    );

    return () => {
      console.log("Cleaning up listeners");
      removeInstallListener();
      removeModelListener();
    };
  }, []);

  // Polling으로 설치된 모델 확인
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (pullingModel && pullStatus) {
      pollInterval = setInterval(async () => {
        try {
          const status = await window.electronAPI.localAiStatus();

          // 모델이 설치되었는지 확인
          if (status.installedModels.includes(pullingModel)) {
            console.log("Model detected as installed via polling");
            setPullingModel(null);
            setPullStatus(null);
            setModelProgress(100);
            setModelProgressStatus("완료!");
            setLocalAiStatus(status);

            if (pollInterval) {
              clearInterval(pollInterval);
            }
          } else {
            // 시간 경과에 따른 예상 진행률 표시 (실제 진행률을 알 수 없을 때)
            const elapsed = Date.now() - pullStatus.startTime;
            const estimatedProgress = Math.min(95, Math.floor(elapsed / 1000)); // 1초당 1%
            setModelProgress(estimatedProgress);
            setModelProgressStatus(
              `다운로드 중... (${Math.floor(elapsed / 1000)}초 경과)`
            );
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 2000); // 2초마다 확인
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pullingModel, pullStatus]);

  const loadLocalAiStatus = async () => {
    if (window.electronAPI) {
      setIsLoadingLocalAi(true);
      try {
        const status = await window.electronAPI.localAiStatus();
        setLocalAiStatus(status);
      } catch (error) {
        console.error("Failed to load local AI status:", error);
        setLocalAiStatus(null);
      } finally {
        setIsLoadingLocalAi(false);
      }
    }
  };

  const handleInstallOllama = async () => {
    setIsInstallingOllama(true);
    setInstallProgress({
      stage: "downloading",
      progress: 0,
      message: "다운로드 준비중...",
    });

    const result = await window.electronAPI.localAiInstall();

    if (result.success) {
      setStatus("Ollama 설치 완료!");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await loadLocalAiStatus();
    }

    setIsInstallingOllama(false);
  };

  const handleStartOllama = async () => {
    const result = await window.electronAPI.localAiStart();
    if (result.success) {
      loadLocalAiStatus();
      setStatus("Ollama 서버 시작됨");
    }
  };

  const handlePullModel = async (modelId: string) => {
    console.log("Starting pull for model:", modelId);
    setPullingModel(modelId);
    setModelProgress(0);
    setModelProgressStatus("시작 중...");
    setPullStatus({ modelName: modelId, startTime: Date.now() });

    try {
      // 비동기로 실행하고 결과를 기다리지 않음 (polling으로 확인)
      window.electronAPI.localAiPullModel(modelId).then((result) => {
        console.log("Pull completed:", result);
        if (!result.success) {
          alert(`다운로드 실패: ${(result as any).error}`);
          setPullingModel(null);
          setPullStatus(null);
        }
      });
    } catch (error: any) {
      console.error("Pull error:", error);
      alert(`오류: ${error.message}`);
      setPullingModel(null);
      setPullStatus(null);
    }
  };

  // 버전 확인 함수
  const checkOllamaVersion = async () => {
    if (window.electronAPI?.localAiCheckUpdate) {
      const info = await window.electronAPI.localAiCheckUpdate();
      setVersionInfo(info);
    }
  };

  // 업데이트 함수
  const handleUpdateOllama = async () => {
    if (!versionInfo?.updateAvailable) return;

    setIsUpdating(true);
    setInstallProgress({
      stage: "checking",
      progress: 0,
      message: "업데이트 준비 중...",
    });

    const result = await window.electronAPI.localAiUpdate();

    if (result.success) {
      setStatus("Ollama 업데이트 완료!");
      await checkOllamaVersion();
      await loadLocalAiStatus();
    } else {
      setStatus(`업데이트 실패: ${result.error}`);
    }

    setIsUpdating(false);
    setInstallProgress(null);
  };

  const getFilteredModels = (): ModelWithRecommendation[] => {
    if (!localAiStatus?.supportedModels) return [];

    let filtered = localAiStatus.supportedModels;

    if (categoryFilter !== "all") {
      filtered = filtered.filter((m) => m.category === categoryFilter);
    }

    if (showOnlyRecommended) {
      filtered = filtered.filter((m) => m.recommended || m.isInstalled);
    }

    if (searchModelTerm) {
      const term = searchModelTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.id.toLowerCase().includes(term) ||
          m.description.toLowerCase().includes(term)
      );
    }

    return filtered;
  };

  const handleDeleteModel = async (modelId: string) => {
    if (confirm(`${modelId} 모델을 삭제하시겠습니까?`)) {
      await window.electronAPI.localAiDeleteModel(modelId);
      loadLocalAiStatus();
    }
  };

  // OpenRouter API 키가 변경될 때 자동으로 모델 로드
  useEffect(() => {
    if (formData.aiProvider === "openrouter" && formData.openrouterApiKey) {
      // API 키가 sk-or-v1-로 시작하는지 확인
      if (formData.openrouterApiKey.startsWith("sk-or-v1-")) {
        loadModels();
      }
    }
  }, [formData.openrouterApiKey, formData.aiProvider]);

  // Gemini API 키가 변경될 때 자동으로 모델 로드
  useEffect(() => {
    if (formData.aiProvider === "gemini" && formData.aiApiKey) {
      if (formData.aiApiKey.startsWith("AIza")) {
        loadModels();
      }
    }
  }, [formData.aiApiKey, formData.aiProvider]);

  // 프로바이더가 변경될 때 모델 목록 초기화
  useEffect(() => {
    setAvailableModels([]);
    setFilteredModels([]);
    setSearchTerm("");
  }, [formData.aiProvider]);

  // availableModels ref 업데이트
  useEffect(() => {
    availableModelsRef.current = availableModels;
  }, [availableModels]);

  // 모델 필터링이 변경될 때마다 filteredModels 업데이트
  useEffect(() => {
    if (formData.aiProvider === "openrouter") {
      filterModels(searchTerm);
    } else {
      setFilteredModels(availableModels);
    }
  }, [showAllModels, availableModels, allModels, searchTerm]);

  const loadModels = useCallback(async () => {
    const apiKey =
      formData.aiProvider === "openrouter"
        ? formData.openrouterApiKey
        : formData.aiApiKey;

    if (!apiKey) {
      setStatus(
        `${formData.aiProvider.toUpperCase()} API Key를 먼저 입력해주세요.`
      );
      return;
    }

    setIsLoadingModels(true);

    if (window.electronAPI) {
      try {
        const models = await window.electronAPI.listModels(
          apiKey,
          formData.aiProvider,
          showAllModels
        );
        if (models && models.length > 0) {
          if (formData.aiProvider === "openrouter") {
            // OpenRouter인 경우
            if (showAllModels) {
              setAllModels(models);
              setFilteredModels(models);
              // 기존 무료 모델도 유지
              if (availableModelsRef.current.length === 0) {
                // 무료 모델도 따로 가져오기
                const freeModels = await window.electronAPI.listModels(
                  apiKey,
                  formData.aiProvider,
                  false
                );
                setAvailableModels(freeModels);
              }
            } else {
              setAvailableModels(models);
              setFilteredModels(models);
            }

            // 첫 번째 모델을 기본값으로 설정 (선택된 모델이 없을 경우에만)
            if (!formData.aiModel || !models.includes(formData.aiModel)) {
              setFormData((prev) => ({ ...prev, aiModel: models[0] }));
            }
          } else {
            // Gemini인 경우
            setAvailableModels(models);
            setFilteredModels(models);
            if (!formData.aiModel || !models.includes(formData.aiModel)) {
              setFormData((prev) => ({ ...prev, aiModel: models[0] }));
            }
          }

          const providerName =
            formData.aiProvider === "openrouter" ? "OpenRouter" : "Gemini";
          const modelType = showAllModels ? "전체" : "무료";
          setStatus(
            `${providerName} ${modelType} 모델 리스트를 불러왔습니다. (${models.length}개)`
          );
        } else {
          setStatus("사용 가능한 모델이 없습니다.");
        }
      } catch (error) {
        console.error("Failed to load models:", error);
        setStatus("모델 로딩에 실패했습니다.");
      }
    }

    setIsLoadingModels(false);
    setTimeout(() => setStatus(""), 3000);
  }, [
    formData.aiProvider,
    formData.openrouterApiKey,
    formData.aiApiKey,
    showAllModels,
  ]);

  const loadRecommendedFeeds = () => {
    const currentSet = new Set(formData.rssUrls);
    const newUrls = [...formData.rssUrls];
    let count = 0;
    recommendedFeeds.forEach((feed) => {
      if (!currentSet.has(feed.url) && feed.url.trim() !== "") {
        newUrls.push(feed.url);
        currentSet.add(feed.url);
        count++;
      }
    });
    // 빈 필드가 하나 있다면 제거
    const cleaned = newUrls.filter((url) => url.trim() !== "");
    if (cleaned.length === 0) cleaned.push("");

    setFormData({ ...formData, rssUrls: cleaned });
    setStatus(`${count}개의 추천 피드가 추가되었습니다.`);
    setTimeout(() => setStatus(""), 3000);
  };

  const handleRssChange = (index: number, value: string) => {
    const newUrls = [...formData.rssUrls];
    newUrls[index] = value;
    setFormData({ ...formData, rssUrls: newUrls });
  };

  const addRssField = () => {
    setFormData({ ...formData, rssUrls: [...formData.rssUrls, ""] });
  };

  const removeRssField = (index: number) => {
    const newUrls = formData.rssUrls.filter((_, i) => i !== index);
    setFormData({ ...formData, rssUrls: newUrls });
  };

  const handleSave = async () => {
    // 빈 RSS URL 필터링
    const cleanSettings = {
      ...formData,
      rssUrls: formData.rssUrls.filter((url) => url.trim() !== ""),
    };
    if (window.electronAPI) {
      await window.electronAPI.saveSettings(cleanSettings);
      setStatus("설정이 저장되었습니다.");
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleLogin = async () => {
    setStatus("로그인 프로세스 시작...");
    if (window.electronAPI) {
      await window.electronAPI.startLogin();
    }
  };

  return (
    <div className="p-6 bg-gray-50 h-full overflow-y-auto text-slate-800">
      <h2 className="text-2xl font-bold mb-6">⚙️ 시스템 설정</h2>

      <div className="space-y-4 bg-white p-6 rounded shadow">
        {/* 기본 설정 섹션 */}
        <div>
          <label className="block font-medium mb-1">블로그 이름</label>
          <input
            type="text"
            className="w-full border p-2 rounded text-slate-800"
            value={formData.blogName}
            onChange={(e) => {
              const name = e.target.value;
              setFormData({
                ...formData,
                blogName: name,
                writeRedirectUrl: `https://${name}.tistory.com/manage/newpost/?type=post&returnURL=%2Fmanage%2Fposts%2F`,
              });
            }}
            placeholder="티스토리 블로그 이름 (예: myblog)"
          />
        </div>

        {/* 글쓰기 리다이렉트 URL (자동 관리되므로 숨김 처리) */}
        <input type="hidden" value={formData.writeRedirectUrl} />

        {/* AI 프로바이더 선택 */}
        <div>
          <label className="block font-medium mb-1">AI 프로바이더</label>
          <select
            className="w-full border p-2 rounded text-slate-800"
            value={formData.aiProvider}
            onChange={(e) =>
              setFormData({
                ...formData,
                aiProvider: e.target.value as "gemini" | "openrouter" | "local",
                aiModel: "",
              })
            }
          >
            <option value="gemini">Google Gemini (클라우드)</option>
            <option value="openrouter">OpenRouter (클라우드)</option>
            <option value="local">🖥️ 로컬 AI (Ollama)</option>
          </select>
        </div>

        {/* 로컬 AI 설정 섹션 */}
        {formData.aiProvider === "local" && (
          <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-50 space-y-4">
            <h3 className="font-bold text-lg text-purple-800 flex items-center gap-2">
              🖥️ 로컬 AI 설정 (Ollama)
            </h3>

            {isLoadingLocalAi ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <span className="ml-3 text-gray-600">
                  로컬 AI 상태 확인 중...
                </span>
              </div>
            ) : (
              <>
                {/* 상태 카드 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white p-3 rounded border">
                    <p className="text-sm text-gray-500">Ollama 상태</p>
                    <p className="font-bold">
                      {localAiStatus?.installed ? (
                        localAiStatus.running ? (
                          <span className="text-green-600">🟢 실행 중</span>
                        ) : (
                          <span className="text-yellow-600">
                            🟡 설치됨 (중지)
                          </span>
                        )
                      ) : (
                        <span className="text-red-600">🔴 미설치</span>
                      )}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-sm text-gray-500">설치된 버전</p>
                    <p className="font-bold">
                      {versionInfo?.current ? `v${versionInfo.current}` : "-"}
                    </p>
                    {versionInfo?.updateAvailable && (
                      <p className="text-xs text-orange-600 mt-1">
                        ⬆️ v{versionInfo.latest} 사용 가능
                      </p>
                    )}
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-sm text-gray-500">설치된 모델</p>
                    <p className="font-bold">
                      {localAiStatus?.installedModels?.length || 0}개
                    </p>
                  </div>
                </div>

                {/* 업데이트 알림 배너 */}
                {versionInfo?.updateAvailable && localAiStatus?.installed && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-orange-800">
                        🆕 새 버전이 있습니다!
                      </p>
                      <p className="text-sm text-orange-700">
                        v{versionInfo.current} → v{versionInfo.latest}
                      </p>
                    </div>
                    <button
                      onClick={handleUpdateOllama}
                      disabled={isUpdating}
                      className={`px-4 py-2 rounded-lg font-bold text-white ${
                        isUpdating
                          ? "bg-gray-400"
                          : "bg-orange-500 hover:bg-orange-600"
                      }`}
                    >
                      {isUpdating ? "업데이트 중..." : "지금 업데이트"}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* 설치/시작 버튼 */}
            {!localAiStatus?.installed ? (
              <div>
                <button
                  onClick={handleInstallOllama}
                  disabled={isInstallingOllama}
                  className={`w-full py-3 rounded-lg font-bold text-white ${
                    isInstallingOllama
                      ? "bg-gray-400"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {isInstallingOllama
                    ? "설치 중..."
                    : `🚀 Ollama v${versionInfo?.latest || "최신"} 설치하기`}
                </button>
                {installProgress && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all"
                        style={{ width: `${installProgress.progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {installProgress.message}
                    </p>
                  </div>
                )}
              </div>
            ) : !localAiStatus?.running ? (
              <button
                onClick={handleStartOllama}
                className="w-full py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
              >
                ▶️ Ollama 서버 시작
              </button>
            ) : (
              <div className="flex items-center gap-2 text-green-600 font-medium p-3 bg-green-50 rounded-lg">
                <span className="animate-pulse">🟢</span>
                Ollama 서버 실행 중{" "}
                {versionInfo?.current && `(v${versionInfo.current})`}
              </div>
            )}

            {/* 시스템 정보 카드 */}
            {localAiStatus?.systemInfo && (
              <div className="bg-white p-4 rounded-lg border shadow-sm">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  💻 시스템 정보
                  <button
                    onClick={loadLocalAiStatus}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    새로고침
                  </button>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">RAM</p>
                    <p className="font-bold">
                      {localAiStatus.systemInfo.freeRamGB}GB /{" "}
                      {localAiStatus.systemInfo.totalRamGB}GB
                    </p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">CPU</p>
                    <p className="font-bold">
                      {localAiStatus.systemInfo.cpuCores} 코어
                    </p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">GPU</p>
                    <p className="font-bold">
                      {localAiStatus.systemInfo.gpu
                        ? `${localAiStatus.systemInfo.gpu.name.substring(
                            0,
                            20
                          )}...`
                        : "없음"}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">VRAM</p>
                    <p className="font-bold">
                      {localAiStatus.systemInfo.gpu
                        ? `${localAiStatus.systemInfo.gpu.vramGB}GB`
                        : "-"}
                    </p>
                  </div>
                </div>
                {localAiStatus.systemInfo.gpu?.cudaAvailable && (
                  <p className="text-xs text-green-600 mt-2">
                    ✓ CUDA 가속 사용 가능
                  </p>
                )}
              </div>
            )}

            {/* 상태 표시 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-3 rounded border">
                <p className="text-sm text-gray-500">Ollama 상태</p>
                <p className="font-bold">
                  {localAiStatus?.installed ? (
                    localAiStatus.running ? (
                      <span className="text-green-600">✓ 실행 중</span>
                    ) : (
                      <span className="text-yellow-600">⚠ 설치됨 (중지)</span>
                    )
                  ) : (
                    <span className="text-red-600">✗ 미설치</span>
                  )}
                </p>
              </div>
              <div className="bg-white p-3 rounded border">
                <p className="text-sm text-gray-500">설치된 모델</p>
                <p className="font-bold">
                  {localAiStatus?.installedModels?.length || 0}개
                </p>
                {localAiStatus?.installedModels &&
                  localAiStatus.installedModels.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {localAiStatus.installedModels.join(", ")}
                    </p>
                  )}
              </div>
            </div>

            {/* 모델 저장 경로 표시 */}
            {localAiStatus?.modelsPath && (
              <div className="bg-white p-3 rounded border">
                <p className="text-sm text-gray-500">모델 저장 경로</p>
                <p className="font-mono text-xs text-gray-700 break-all">
                  {localAiStatus.modelsPath}
                </p>
              </div>
            )}

            {/* 모델 관리 */}
            {localAiStatus?.installed && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-700">📦 모델 관리</h4>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={showOnlyRecommended}
                        onChange={(e) =>
                          setShowOnlyRecommended(e.target.checked)
                        }
                        className="rounded"
                      />
                      추천만
                    </label>
                  </div>
                </div>

                {/* 필터 및 검색 */}
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="모델 검색..."
                    value={searchModelTerm}
                    onChange={(e) => setSearchModelTerm(e.target.value)}
                    className="flex-1 min-w-[200px] border rounded px-3 py-1.5 text-sm"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(e) =>
                      setCategoryFilter(e.target.value as ModelCategory | "all")
                    }
                    className="border rounded px-3 py-1.5 text-sm"
                  >
                    <option value="all">모든 카테고리</option>
                    <option value="general">범용</option>
                    <option value="coding">코딩</option>
                    <option value="creative">창작</option>
                    <option value="multilingual">다국어</option>
                    <option value="vision">비전</option>
                    <option value="embedding">임베딩</option>
                    <option value="specialized">특수</option>
                  </select>
                </div>

                {/* 모델 목록 */}
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {getFilteredModels().map((model) => {
                    const isPulling = pullingModel === model.id;

                    return (
                      <div
                        key={model.id}
                        className={`p-3 rounded-lg border transition-all ${
                          model.isInstalled
                            ? "bg-green-50 border-green-200"
                            : model.recommended
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">{model.name}</p>
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  model.category === "general"
                                    ? "bg-blue-100 text-blue-700"
                                    : model.category === "coding"
                                    ? "bg-green-100 text-green-700"
                                    : model.category === "creative"
                                    ? "bg-purple-100 text-purple-700"
                                    : model.category === "multilingual"
                                    ? "bg-orange-100 text-orange-700"
                                    : model.category === "vision"
                                    ? "bg-pink-100 text-pink-700"
                                    : model.category === "embedding"
                                    ? "bg-gray-100 text-gray-700"
                                    : "bg-yellow-100 text-yellow-700"
                                }`}
                              >
                                {model.category === "general"
                                  ? "범용"
                                  : model.category === "coding"
                                  ? "코딩"
                                  : model.category === "creative"
                                  ? "창작"
                                  : model.category === "multilingual"
                                  ? "다국어"
                                  : model.category === "vision"
                                  ? "비전"
                                  : model.category === "embedding"
                                  ? "임베딩"
                                  : "특수"}
                              </span>
                              {model.recommended && !model.isInstalled && (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                                  ⭐ 추천
                                </span>
                              )}
                              {model.isInstalled && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                  ✓ 설치됨
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              {model.description}
                            </p>
                            <div className="flex gap-3 mt-2 text-xs text-gray-500">
                              <span>📊 {model.parameters}</span>
                              <span>
                                💾{" "}
                                {model.isInstalled && model.installedSize
                                  ? model.installedSize
                                  : model.size}
                              </span>
                              <span>🔧 RAM {model.minRamGB}GB+</span>
                              {model.minVramGB > 0 && (
                                <span>🎮 VRAM {model.minVramGB}GB+</span>
                              )}
                            </div>
                            {model.isInstalled && model.installedPath && (
                              <p className="text-xs text-gray-400 mt-1 font-mono">
                                📁 {model.installedPath}
                              </p>
                            )}
                            {model.languages.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {model.languages.slice(0, 5).map((lang) => (
                                  <span
                                    key={lang}
                                    className="text-xs bg-gray-100 px-1.5 py-0.5 rounded"
                                  >
                                    {lang}
                                  </span>
                                ))}
                                {model.languages.length > 5 && (
                                  <span className="text-xs text-gray-400">
                                    +{model.languages.length - 5}
                                  </span>
                                )}
                              </div>
                            )}
                            {model.recommendationReason && (
                              <p
                                className={`text-xs mt-1 ${
                                  model.recommended
                                    ? "text-green-600"
                                    : "text-orange-600"
                                }`}
                              >
                                {model.recommended ? "✓" : "⚠"}{" "}
                                {model.recommendationReason}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-1 shrink-0">
                            {model.isInstalled ? (
                              <>
                                <button
                                  onClick={() =>
                                    setFormData({
                                      ...formData,
                                      localAiModel: model.id,
                                    })
                                  }
                                  className={`text-xs px-3 py-1.5 rounded ${
                                    formData.localAiModel === model.id
                                      ? "bg-purple-600 text-white"
                                      : "bg-gray-200 hover:bg-gray-300"
                                  }`}
                                >
                                  {formData.localAiModel === model.id
                                    ? "✓ 사용 중"
                                    : "선택"}
                                </button>
                                <button
                                  onClick={() => handleDeleteModel(model.id)}
                                  className="text-xs px-3 py-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                >
                                  삭제
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handlePullModel(model.id)}
                                disabled={isPulling || !localAiStatus?.running}
                                className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
                                  isPulling || !localAiStatus?.running
                                    ? "bg-gray-200 text-gray-400"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                                }`}
                              >
                                {isPulling ? `${modelProgress}%` : "다운로드"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 다운로드 진행 상황 */}
                        {isPulling && (
                          <div className="mt-3">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${modelProgress}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                              {modelProgressStatus}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {getFilteredModels().length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      조건에 맞는 모델이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 도움말 */}
            <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
              <p className="font-medium">💡 로컬 AI 사용 팁</p>
              <ul className="mt-1 list-disc list-inside text-xs space-y-1">
                <li>⭐ 표시된 모델은 현재 시스템에 최적화되어 있습니다</li>
                <li>GPU가 있으면 더 큰 모델도 빠르게 실행됩니다</li>
                <li>처음 사용 시 모델 다운로드에 시간이 걸립니다</li>
                <li>한국어 콘텐츠는 Gemma 3, Qwen 2.5 시리즈 추천</li>
                <li>코딩 작업은 Qwen Coder, DeepSeek Coder 추천</li>
              </ul>
            </div>

            {/* 안내 메시지 */}
            <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
              <p className="font-medium">💡 로컬 AI 사용 팁</p>
              <ul className="mt-1 list-disc list-inside text-xs space-y-1">
                <li>Gemma 3 4B는 8GB 이상 RAM 권장</li>
                <li>GPU가 있으면 더 빠른 응답 가능</li>
                <li>첫 실행 시 모델 로딩에 시간이 걸릴 수 있음</li>
                <li>인터넷 연결 없이도 사용 가능</li>
              </ul>
            </div>
          </div>
        )}

        {/* Gemini API Key */}
        {formData.aiProvider === "gemini" && (
          <div>
            <label className="block font-medium mb-1">Gemini API Key</label>
            <input
              type="password"
              className="w-full border p-2 rounded text-slate-800"
              value={formData.aiApiKey}
              onChange={(e) =>
                setFormData({ ...formData, aiApiKey: e.target.value })
              }
              placeholder="AIza..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Google AI Studio에서 API 키를 발급받으세요.
            </p>
          </div>
        )}

        {/* OpenRouter API Key */}
        {formData.aiProvider === "openrouter" && (
          <div>
            <label className="block font-medium mb-1">
              OpenRouter API Key
              {isLoadingModels && (
                <span className="text-xs text-blue-600 ml-2">
                  무료 모델 로딩 중...
                </span>
              )}
            </label>
            <input
              type="password"
              className="w-full border p-2 rounded text-slate-800"
              value={formData.openrouterApiKey}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  openrouterApiKey: e.target.value.trim(),
                })
              }
              placeholder="sk-or-v1-..."
            />
            {formData.openrouterApiKey &&
              !formData.openrouterApiKey.startsWith("sk-or-v1-") && (
                <p className="text-xs text-red-500 mt-1">
                  유효한 OpenRouter API 키를 입력해주세요 (sk-or-v1-로 시작)
                </p>
              )}
            {formData.openrouterApiKey.startsWith("sk-or-v1-") &&
              !isLoadingModels &&
              availableModels.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  API 키가 확인되었습니다. 🔄 버튼을 눌러 무료 모델을 로드하세요
                </p>
              )}
            <p className="text-xs text-gray-500 mt-1">
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                OpenRouter에서 API 키 발급받기 →
              </a>
              <br />
              무료 모델은 요청당 $0이며, 일일 사용량 제한이 있을 수 있습니다.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="block font-semibold text-gray-700 flex items-center gap-2">
              <span className="text-lg">🤖</span>
              AI 모델 선택
              {isLoadingModels && (
                <span className="text-xs text-blue-600 ml-2 animate-pulse">
                  로딩 중...
                </span>
              )}
            </label>

            {/* 검색 입력창 */}
            {formData.aiProvider === "openrouter" && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 모델 검색..."
                  className={`w-full border-2 border-gray-200 p-3 rounded-lg text-sm pr-10 transition-all ${
                    isLoadingModels
                      ? "bg-gray-50 border-gray-100"
                      : "focus:border-blue-400 focus:outline-none"
                  }`}
                  onChange={(e) => {
                    const searchTerm = e.target.value;
                    filterModels(searchTerm);
                  }}
                  disabled={isLoadingModels}
                />
                {!isLoadingModels && (
                  <div className="absolute right-3 top-3.5 text-gray-400 pointer-events-none">
                    🔍
                  </div>
                )}
              </div>
            )}

            {/* 현재 선택된 모델 표시 */}
            {!showModelList && (
              <div className="space-y-2">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {formData.aiProvider === "openrouter" &&
                        formData.aiModel?.includes(":free")
                          ? "🆓"
                          : "💎"}
                      </span>
                      <span className="font-semibold text-gray-800">
                        {formData.aiModel || "모델을 선택해주세요"}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowModelList(true)}
                      disabled={isLoadingModels}
                      className="text-sm px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-medium text-xs"
                    >
                      변경
                    </button>
                  </div>
                  {formData.aiModel && (
                    <p className="text-xs text-gray-600 mt-2">
                      현재 선택된 AI 모델입니다. 변경을 눌러 다른 모델을 선택할
                      수 있습니다.
                    </p>
                  )}
                </div>

                {/* 새로고침 버튼 */}
                <div className="flex justify-end">
                  <button
                    onClick={loadModels}
                    disabled={isLoadingModels}
                    className={`px-4 py-2 rounded-lg transition-all text-sm font-medium shadow-sm flex items-center gap-2 ${
                      isLoadingModels
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-blue-500 text-white hover:bg-blue-600 active:scale-95"
                    }`}
                  >
                    {isLoadingModels ? "⏳" : "🔄"}
                    {isLoadingModels ? "로딩 중" : "모델 새로고침"}
                  </button>
                </div>
              </div>
            )}

            {/* 모델 선택 리스트 */}
            {showModelList && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    사용 가능한 모델 목록
                  </label>
                  <button
                    onClick={() => setShowModelList(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    ✕ 닫기
                  </button>
                </div>

                <div className="relative">
                  <select
                    className="w-full border-2 border-gray-200 p-3 rounded-lg text-slate-800 text-sm transition-all focus:border-blue-400 focus:outline-none cursor-pointer"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleModelSelect(e.target.value);
                      }
                    }}
                    size={6}
                  >
                    <option value="">모델을 선택하세요...</option>
                    {formData.aiProvider === "openrouter" ? (
                      filteredModels.length === 0 ? (
                        <option value="">OpenRouter API 키를 입력하세요</option>
                      ) : (
                        filteredModels.map((model) => (
                          <option key={model} value={model} className="py-2">
                            {model.includes(":free") ? "🆓 " : "💎 "}
                            {model}
                          </option>
                        ))
                      )
                    ) : (
                      <>
                        {availableModels.map((model) => (
                          <option key={model} value={model} className="py-2">
                            💎 {model}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* 모델 필터링 옵션 */}
            {formData.aiProvider === "openrouter" && showModelList && (
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-gray-600 mb-2">
                  모델 필터
                </div>
                <div className="flex gap-4">
                  <label
                    className={`flex items-center gap-2 text-sm font-medium cursor-pointer px-3 py-2 rounded-lg transition-all ${
                      !showAllModels
                        ? "bg-green-100 text-green-700 border-2 border-green-300"
                        : "bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modelFilter"
                      checked={!showAllModels}
                      onChange={() => {
                        setShowAllModels(false);
                        setModelFilter("free");
                      }}
                      className="sr-only"
                    />
                    <span className="text-base">🆓</span>
                    <span>무료 모델</span>
                  </label>
                  <label
                    className={`flex items-center gap-2 text-sm font-medium cursor-pointer px-3 py-2 rounded-lg transition-all ${
                      showAllModels
                        ? "bg-blue-100 text-blue-700 border-2 border-blue-300"
                        : "bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modelFilter"
                      checked={showAllModels}
                      onChange={() => {
                        setShowAllModels(true);
                        setModelFilter("all");
                      }}
                      className="sr-only"
                    />
                    <span className="text-base">🌟</span>
                    <span>전체 모델</span>
                  </label>
                </div>

                {/* 모델 개수 표시 */}
                <div className="text-xs space-y-1 pt-2 border-t border-gray-200">
                  {modelFilter === "free" && (
                    <p className="text-green-600 font-medium flex items-center gap-1">
                      <span>✅</span>
                      <span>
                        {filteredModels.length}개의 무료 모델 사용 가능
                      </span>
                    </p>
                  )}
                  {modelFilter === "all" && (
                    <p className="text-blue-600 font-medium flex items-center gap-1">
                      <span>🌟</span>
                      <span>
                        총 {allModels.length}개 모델 (무료:{" "}
                        {availableModels.length}개)
                      </span>
                    </p>
                  )}
                  {searchTerm && (
                    <p className="text-gray-600 font-medium flex items-center gap-1">
                      <span>🔍</span>
                      <span>검색 결과: {filteredModels.length}개</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block font-semibold text-gray-700 flex items-center gap-2">
              <span className="text-lg">🌐</span>
              번역 목표 언어 (Target Language)
            </label>
            <select
              className="w-full border-2 border-gray-200 p-3 rounded-lg text-slate-800 focus:border-blue-400 focus:outline-none transition-all"
              value={formData.targetLanguage}
              onChange={(e) =>
                setFormData({ ...formData, targetLanguage: e.target.value })
              }
            >
              <option value="Korean">🇰🇷 한국어 (Korean)</option>
              <option value="English">🇺🇸 영어 (English)</option>
              <option value="Japanese">🇯🇵 일본어 (Japanese)</option>
              <option value="Chinese">🇨🇳 중국어 (Chinese)</option>
              <option value="Spanish">🇪🇸 스페인어 (Spanish)</option>
            </select>
          </div>
        </div>

        {/* RSS 관리 섹션 */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="block font-semibold text-gray-700 flex items-center gap-2">
              <span className="text-lg">📡</span>
              RSS 피드 목록
            </label>
            <button
              onClick={loadRecommendedFeeds}
              className="text-sm px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-sm flex items-center gap-2"
            >
              <span>📚</span>
              추천 RSS 불러오기
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto bg-gray-50 rounded-lg p-3 border-2 border-gray-200">
            {formData.rssUrls.map((url, idx) => (
              <div key={idx} className="flex gap-2 mb-2 last:mb-0">
                <input
                  type="text"
                  className="flex-1 border-2 border-gray-200 p-2 rounded-lg text-slate-800 text-sm focus:border-blue-400 focus:outline-none transition-all"
                  placeholder="https://example.com/rss"
                  value={url}
                  onChange={(e) => handleRssChange(idx, e.target.value)}
                />
                <button
                  onClick={() => removeRssField(idx)}
                  className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all text-xs font-medium shadow-sm"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addRssField}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
          >
            <span className="text-base">+</span>
            RSS 주소 추가
          </button>
        </div>

        {/* [신규 추가] 이미지 소스 설정 섹션 */}
        <div className="border-t pt-4 mt-4">
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <span>🖼️</span>
            이미지 검색 설정 (Pexels)
          </h3>
          <div className="bg-blue-50 p-4 rounded-lg mb-3 text-sm text-blue-800">
            <p>
              <strong>알림:</strong> 브라우저 자동화(크롤링) 방식은 차단될 수
              있으므로,
              <strong>공식 API</strong>를 사용하는 것을 권장합니다.
            </p>
          </div>
          <div>
            <label className="block font-medium mb-1">Pexels API Key</label>
            <input
              type="password"
              className="w-full border p-2 rounded text-slate-800"
              value={formData.pexelsApiKey || ""}
              onChange={(e) =>
                setFormData({ ...formData, pexelsApiKey: e.target.value })
              }
              placeholder="Pexels API Key 입력"
            />
            <p className="text-xs text-gray-500 mt-1">
              키가 없으면 이미지가 검색되지 않습니다.
              <a
                href="https://www.pexels.com/api/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline ml-1 font-bold"
              >
                여기서 무료로 발급받으세요.
              </a>
            </p>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="pt-6 flex gap-4 border-t-2 border-gray-200 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md font-medium flex items-center justify-center gap-2"
          >
            <span>💾</span>
            설정 저장
          </button>

          <button
            onClick={handleLogin}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-lg hover:from-yellow-500 hover:to-yellow-600 transition-all shadow-md font-bold flex items-center justify-center gap-2"
          >
            <span>🔐</span>
            카카오 로그인 (가상 브라우저)
          </button>
        </div>

        {status && (
          <div className="mt-4 p-3 bg-green-50 border-2 border-green-200 rounded-lg">
            <p className="text-green-700 font-medium text-center">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
