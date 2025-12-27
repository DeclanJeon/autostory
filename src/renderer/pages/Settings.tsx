import React, { useState, useEffect, useCallback, useRef } from "react";
import { recommendedFeeds } from "../data/recommendedFeeds";
import RssBulkImportModal from "../components/RssBulkImportModal";
import {
  LocalAiStatus,
  ModelWithRecommendation,
  InstallProgress,
  SystemInfo,
  ModelCategory,
  VersionInfo,
} from "../types/global";

// 탭 타입 정의
type TabType = "blog" | "login" | "ai" | "rss" | "image";

const Settings: React.FC = () => {
  // 활성 탭 상태
  const [activeTab, setActiveTab] = useState<TabType>("blog");

  // 폼 데이터 상태
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
    rssUrls: [""],
    unsplashAccessKey: "",
    pexelsApiKey: "",
    naverBlogId: "",
    naverEnabled: false,
    tistoryEnabled: true,
  });

  // 기타 상태들
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [allModels, setAllModels] = useState<string[]>([]);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState<"free" | "all">("free");
  const [searchTerm, setSearchTerm] = useState("");
  const [showModelList, setShowModelList] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");

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
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);

  const availableModelsRef = useRef<string[]>([]);

  // 탭 정의
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "blog", label: "블로그 정보", icon: "📌" },
    { id: "login", label: "로그인 관리", icon: "🔐" },
    { id: "ai", label: "AI 설정", icon: "🤖" },
    { id: "rss", label: "RSS 피드", icon: "📡" },
    { id: "image", label: "이미지 검색", icon: "🖼️" },
  ];

  // 초기 설정 로드
  useEffect(() => {
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
            unsplashAccessKey: saved.unsplashAccessKey || "",
            pexelsApiKey: saved.pexelsApiKey || "",
            naverBlogId: saved.naverBlogId || "",
            naverEnabled: saved.naverEnabled || false,
            tistoryEnabled: saved.tistoryEnabled ?? true,
          });
          if (saved.aiModel) {
            setSelectedModel(saved.aiModel);
          }
        }
      });
    }
  }, []);

  // 로컬 AI 상태 로드
  useEffect(() => {
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
            const elapsed = Date.now() - pullStatus.startTime;
            const estimatedProgress = Math.min(95, Math.floor(elapsed / 1000));
            setModelProgress(estimatedProgress);
            setModelProgressStatus(
              `다운로드 중... (${Math.floor(elapsed / 1000)}초 경과)`
            );
          }
        } catch (error) {
          console.error("Polling error:", error);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pullingModel, pullStatus]);

  // OpenRouter API 키 변경 시 모델 로드
  useEffect(() => {
    if (formData.aiProvider === "openrouter" && formData.openrouterApiKey) {
      if (formData.openrouterApiKey.startsWith("sk-or-v1-")) {
        loadModels();
      }
    }
  }, [formData.openrouterApiKey, formData.aiProvider]);

  // Gemini API 키 변경 시 모델 로드
  useEffect(() => {
    if (formData.aiProvider === "gemini" && formData.aiApiKey) {
      if (formData.aiApiKey.startsWith("AIza")) {
        loadModels();
      }
    }
  }, [formData.aiApiKey, formData.aiProvider]);

  // 프로바이더 변경 시 모델 목록 초기화
  useEffect(() => {
    setAvailableModels([]);
    setFilteredModels([]);
    setSearchTerm("");
  }, [formData.aiProvider]);

  // availableModels ref 업데이트
  useEffect(() => {
    availableModelsRef.current = availableModels;
  }, [availableModels]);

  // 모델 필터링 업데이트
  useEffect(() => {
    if (formData.aiProvider === "openrouter") {
      filterModels(searchTerm);
    } else {
      setFilteredModels(availableModels);
    }
  }, [showAllModels, availableModels, allModels, searchTerm]);

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

  const checkOllamaVersion = async () => {
    if (window.electronAPI?.localAiCheckUpdate) {
      const info = await window.electronAPI.localAiCheckUpdate();
      setVersionInfo(info);
    }
  };

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

  const handleModelSelect = (model: string) => {
    setFormData((prev) => ({ ...prev, aiModel: model }));
    setSelectedModel(model);
    setShowModelList(false);
    setStatus(`✅ AI 모델이 "${model}"(으)로 설정되었습니다.`);
    setTimeout(() => setStatus(""), 3000);
  };

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
            if (showAllModels) {
              setAllModels(models);
              setFilteredModels(models);
              if (availableModelsRef.current.length === 0) {
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

            if (!formData.aiModel || !models.includes(formData.aiModel)) {
              setFormData((prev) => ({ ...prev, aiModel: models[0] }));
            }
          } else {
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
    formData.aiModel,
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

  const handleKakaoLogin = async () => {
    setStatus("카카오 로그인 프로세스 시작...");
    if (window.electronAPI) {
      await window.electronAPI.startLogin();
    }
  };

  const handleNaverLogin = async () => {
    if (window.electronAPI?.startNaverLogin) {
      setStatus("네이버 로그인 창을 여는 중...");
      const res = await window.electronAPI.startNaverLogin();
      if (res.success) {
        setStatus("✅ 네이버 로그인 정보가 저장되었습니다.");
      } else {
        setStatus(`❌ 네이버 로그인 실패: ${res.error}`);
      }
      setTimeout(() => setStatus(""), 3000);
    } else {
      alert("기능 준비중입니다.");
    }
  };

  // [신규] RSS 내보내기 핸들러
  const handleExportRss = async () => {
    const urls = formData.rssUrls.filter((url) => url.trim() !== "");
    if (urls.length === 0) {
      setStatus("내보낼 RSS 피드가 없습니다.");
      return;
    }

    // Markdown 형식으로 변환
    const mdContent = `# AutoStory RSS Feeds\n\n${urls
      .map((url) => `- ${url}`)
      .join("\n")}`;

    if (window.electronAPI?.exportRssFeeds) {
      const result = await window.electronAPI.exportRssFeeds(mdContent);
      if (result.success) {
        setStatus(`✅ RSS 피드가 저장되었습니다: ${result.filePath}`);
      } else if (result.error !== "취소됨") {
        setStatus(`❌ 저장 실패: ${result.error}`);
      }
      setTimeout(() => setStatus(""), 3000);
    }
  };

  // [신규] RSS 가져오기 핸들러
  const handleImportRssFile = async () => {
    if (window.electronAPI?.importRssFeeds) {
      const result = await window.electronAPI.importRssFeeds();

      if (result.success && result.content) {
        // URL 추출 정규식 (http/https로 시작하는 문자열)
        const urlRegex = /(https?:\/\/[^\s\)]+)/g;
        const matches = result.content.match(urlRegex) || [];

        if (matches.length === 0) {
          setStatus("❌ 파일에서 유효한 URL을 찾을 수 없습니다.");
          setTimeout(() => setStatus(""), 3000);
          return;
        }

        // 중복 제거 및 병합
        const currentSet = new Set(formData.rssUrls);
        let addedCount = 0;

        const newUrls = [...formData.rssUrls];

        matches.forEach((url) => {
          // 마크다운 링크 닫는 괄호 등이 포함될 수 있으므로 정제
          const cleanUrl = url.replace(/[\)\]"']$/, "").trim();

          if (cleanUrl && !currentSet.has(cleanUrl)) {
            newUrls.push(cleanUrl);
            currentSet.add(cleanUrl);
            addedCount++;
          }
        });

        // 빈 문자열 필터링
        const finalUrls = newUrls.filter((u) => u.trim() !== "");
        if (finalUrls.length === 0) finalUrls.push("");

        setFormData({ ...formData, rssUrls: finalUrls });
        setStatus(`✅ ${addedCount}개의 새로운 RSS 피드를 불러왔습니다.`);
      } else if (result.error !== "취소됨") {
        setStatus(`❌ 불러오기 실패: ${result.error}`);
      }

      setTimeout(() => setStatus(""), 3000);
    }
  };

  return (
    <div className="p-6 bg-gray-50 h-full overflow-y-auto text-slate-800">
      <h2 className="text-2xl font-bold mb-6">⚙️ 시스템 설정</h2>

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 mb-6 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === tab.id
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className="bg-white rounded-lg shadow-lg p-6 min-h-[500px]">
        {/* 블로그 정보 탭 */}
        {activeTab === "blog" && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 pb-3 border-b-2 border-gray-200">
              <span className="text-2xl">📌</span>
              블로그 정보 설정
            </h3>

            {/* 티스토리 설정 */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                <span>📝</span>
                티스토리 블로그
              </h4>

              {/* [NEW] 티스토리 활성화 토글 */}
              <div className="flex items-center gap-3 mb-4 bg-white p-3 rounded-lg border-2 border-blue-100">
                <input
                  type="checkbox"
                  id="tistoryEnabled"
                  checked={formData.tistoryEnabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tistoryEnabled: e.target.checked,
                    })
                  }
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label
                  htmlFor="tistoryEnabled"
                  className="text-sm font-medium text-gray-700 cursor-pointer select-none flex-1"
                >
                  발행 시 티스토리 블로그 포함하기 (기본값)
                </label>
                {formData.tistoryEnabled ? (
                  <span className="text-blue-600 font-bold text-sm">
                    ✓ 활성화됨
                  </span>
                ) : (
                  <span className="text-gray-400 font-bold text-sm">
                    비활성화됨
                  </span>
                )}
              </div>

              <div>
                <label className="block font-medium mb-2 text-sm">
                  티스토리 서브도메인
                  <span className="text-xs font-normal text-gray-500 ml-2">
                    (tistory.com 앞의 주소)
                  </span>
                </label>
                <input
                  type="text"
                  className="w-full border-2 border-blue-200 p-3 rounded-lg text-slate-800 focus:border-blue-400 focus:outline-none transition-all"
                  value={formData.blogName}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData({
                      ...formData,
                      blogName: name,
                      writeRedirectUrl: `https://${name}.tistory.com/manage/newpost/?type=post&returnURL=%2Fmanage%2Fposts%2F`,
                    });
                  }}
                  placeholder="서브도메인만 입력 (예: myblog)"
                />
                <p className="text-xs text-gray-500 mt-2">
                  💡 예: <strong>myblog</strong>.tistory.com →{" "}
                  <strong>myblog</strong>만 입력하세요
                </p>
              </div>
            </div>

            {/* 네이버 블로그 설정 */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h4 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                <span>🇳</span>
                네이버 블로그
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block font-medium mb-2 text-sm">
                    네이버 아이디 (ID)
                  </label>
                  <input
                    type="text"
                    className="w-full border-2 border-green-200 p-3 rounded-lg bg-white focus:border-green-400 focus:outline-none transition-all"
                    value={formData.naverBlogId || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, naverBlogId: e.target.value })
                    }
                    placeholder="네이버 아이디 입력 (예: myid)"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    블로그 주소의 아이디 부분만 입력하세요 (blog.naver.com/
                    <strong>ID</strong>)
                  </p>
                </div>

                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-green-200">
                  <input
                    type="checkbox"
                    id="naverEnabled"
                    checked={formData.naverEnabled || false}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        naverEnabled: e.target.checked,
                      })
                    }
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                  />
                  <label
                    htmlFor="naverEnabled"
                    className="text-sm font-medium text-gray-700 cursor-pointer select-none flex-1"
                  >
                    발행 시 네이버 블로그 포함하기 (기본값)
                  </label>
                  {formData.naverEnabled && (
                    <span className="text-green-600 font-bold text-sm">
                      ✓ 활성화됨
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 발행 대상 미리보기 */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-300">
              <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span>🚀</span>
                발행 대상 미리보기
              </h4>
              <div className="flex gap-4">
                <div
                  className={`flex-1 p-3 rounded-lg border-2 ${
                    formData.tistoryEnabled
                      ? "bg-blue-100 border-blue-300"
                      : "bg-gray-100 border-gray-300 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        formData.tistoryEnabled
                          ? "text-blue-600"
                          : "text-gray-500"
                      }`}
                    >
                      티스토리
                    </span>
                    {formData.tistoryEnabled && (
                      <span className="text-blue-600 text-xs">(활성)</span>
                    )}
                  </div>
                  {formData.blogName ? (
                    <p className="text-sm text-blue-700 mt-1">
                      {formData.blogName}.tistory.com
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">미설정</p>
                  )}
                </div>
                <div
                  className={`flex-1 p-3 rounded-lg border-2 ${
                    formData.naverEnabled
                      ? "bg-green-100 border-green-300"
                      : "bg-gray-100 border-gray-300 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        formData.naverEnabled
                          ? "text-green-600"
                          : "text-gray-500"
                      }`}
                    >
                      네이버
                    </span>
                    {formData.naverEnabled && (
                      <span className="text-green-600 text-xs">(활성)</span>
                    )}
                  </div>
                  {formData.naverBlogId ? (
                    <p className="text-sm text-green-700 mt-1">
                      blog.naver.com/{formData.naverBlogId}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">미설정</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 로그인 관리 탭 */}
        {activeTab === "login" && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 pb-3 border-b-2 border-gray-200">
              <span className="text-2xl">🔐</span>
              로그인 관리
            </h3>

            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4">
              <p className="text-sm text-yellow-800">
                <strong>💡 안내:</strong> 발행을 위해서는 각 플랫폼별로 로그인이
                필요합니다. 로그인 정보는 브라우저 세션에 안전하게 저장됩니다.
              </p>
            </div>

            {/* 티스토리(카카오) 로그인 */}
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-lg border-2 border-yellow-200">
              <div className="flex items-start gap-4">
                <div className="text-4xl">📝</div>
                <div className="flex-1">
                  <h4 className="font-bold text-lg text-yellow-800 mb-2">
                    티스토리 로그인 (카카오)
                  </h4>
                  <p className="text-sm text-gray-600 mb-4">
                    티스토리는 카카오 계정으로 로그인해야 합니다. 가상
                    브라우저를 통해 자동 로그인 과정을 진행합니다.
                  </p>
                  <button
                    onClick={handleKakaoLogin}
                    className="w-full py-4 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg font-bold hover:from-yellow-600 hover:to-yellow-700 transition-all shadow-md flex items-center justify-center gap-3 text-base"
                  >
                    <span className="text-xl">🔐</span>
                    카카오 로그인 시작
                  </button>
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    캡차 입력 등을 위해 브라우저가 열리면 직접 로그인해주세요.
                  </p>
                </div>
              </div>
            </div>

            {/* 네이버 로그인 */}
            <div className="bg-gradient-to-r from-green-50 to-teal-50 p-6 rounded-lg border-2 border-green-200">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🇳</div>
                <div className="flex-1">
                  <h4 className="font-bold text-lg text-green-800 mb-2">
                    네이버 블로그 로그인
                  </h4>
                  <p className="text-sm text-gray-600 mb-4">
                    네이버 블로그에 자동으로 발행하기 위해 로그인이 필요합니다.
                  </p>
                  <button
                    onClick={handleNaverLogin}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold hover:from-green-600 hover:to-green-700 transition-all shadow-md flex items-center justify-center gap-3 text-base"
                  >
                    <span className="text-xl">🔐</span>
                    네이버 로그인 시작
                  </button>
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    캡차 입력 등을 위해 브라우저가 열리면 직접 로그인해주세요.
                    성공 시 자동으로 닫힙니다.
                  </p>
                </div>
              </div>
            </div>

            {/* 로그인 상태 확인 */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-300">
              <h4 className="font-bold text-gray-700 mb-3">로그인 상태</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-2xl">📝</span>
                  <div>
                    <p className="font-bold text-gray-800">티스토리</p>
                    <p className="text-xs text-gray-500">
                      로그인 필요 시 위 버튼 클릭
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-2xl">🇳</span>
                  <div>
                    <p className="font-bold text-gray-800">네이버</p>
                    <p className="text-xs text-gray-500">
                      로그인 필요 시 위 버튼 클릭
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI 설정 탭 */}
        {activeTab === "ai" && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 pb-3 border-b-2 border-gray-200">
              <span className="text-2xl">🤖</span>
              AI 설정
            </h3>

            {/* AI 프로바이더 선택 */}
            <div>
              <label className="block font-semibold text-gray-700 mb-2">
                AI 프로바이더
              </label>
              <select
                className="w-full border-2 border-gray-200 p-3 rounded-lg text-slate-800 focus:border-blue-400 focus:outline-none transition-all"
                value={formData.aiProvider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    aiProvider: e.target.value as
                      | "gemini"
                      | "openrouter"
                      | "local",
                    aiModel: "",
                  })
                }
              >
                <option value="gemini">Google Gemini (클라우드)</option>
                <option value="openrouter">OpenRouter (클라우드)</option>
                <option value="local">🖥️ 로컬 AI (Ollama)</option>
              </select>
            </div>

            {/* 로컬 AI 설정 */}
            {formData.aiProvider === "local" && (
              <div className="border-2 border-purple-200 rounded-lg p-4 bg-purple-50 space-y-4">
                <h4 className="font-bold text-lg text-purple-800 flex items-center gap-2">
                  🖥️ 로컬 AI 설정 (Ollama)
                </h4>

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
                          {versionInfo?.current
                            ? `v${versionInfo.current}`
                            : "-"}
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

                    {/* 업데이트 알림 */}
                    {versionInfo?.updateAvailable &&
                      localAiStatus?.installed && (
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
                        : `🚀 Ollama v${
                            versionInfo?.latest || "최신"
                          } 설치하기`}
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

                {/* 시스템 정보 */}
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

                {/* 모델 관리 */}
                {localAiStatus?.installed && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-700">
                        📦 모델 관리
                      </h4>
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
                          setCategoryFilter(
                            e.target.value as ModelCategory | "all"
                          )
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
                                      onClick={() =>
                                        handleDeleteModel(model.id)
                                      }
                                      className="text-xs px-3 py-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200"
                                    >
                                      삭제
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handlePullModel(model.id)}
                                    disabled={
                                      isPulling || !localAiStatus?.running
                                    }
                                    className={`text-xs px-3 py-1.5 rounded whitespace-nowrap ${
                                      isPulling || !localAiStatus?.running
                                        ? "bg-gray-200 text-gray-400"
                                        : "bg-blue-600 text-white hover:bg-blue-700"
                                    }`}
                                  >
                                    {isPulling
                                      ? `${modelProgress}%`
                                      : "다운로드"}
                                  </button>
                                )}
                              </div>
                            </div>

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
                      API 키가 확인되었습니다. 🔄 버튼을 눌러 무료 모델을
                      로드하세요
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
                  무료 모델은 요청당 $0이며, 일일 사용량 제한이 있을 수
                  있습니다.
                </p>
              </div>
            )}

            {/* AI 모델 선택 */}
            {(formData.aiProvider === "gemini" ||
              formData.aiProvider === "openrouter") && (
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
                      </div>

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
                              <option value="">
                                OpenRouter API 키를 입력하세요
                              </option>
                            ) : (
                              filteredModels.map((model) => (
                                <option
                                  key={model}
                                  value={model}
                                  className="py-2"
                                >
                                  {model.includes(":free") ? "🆓 " : "💎 "}
                                  {model}
                                </option>
                              ))
                            )
                          ) : (
                            <>
                              {availableModels.map((model) => (
                                <option
                                  key={model}
                                  value={model}
                                  className="py-2"
                                >
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
                      setFormData({
                        ...formData,
                        targetLanguage: e.target.value,
                      })
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
            )}
          </div>
        )}

        {/* RSS 피드 탭 */}
        {activeTab === "rss" && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 pb-3 border-b-2 border-gray-200">
              <span className="text-2xl">📡</span>
              RSS 피드 관리
            </h3>

            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowBulkImportModal(true)}
                  className="text-sm px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm flex items-center gap-2"
                >
                  <span>📥</span>
                  텍스트로 추가
                </button>

                <button
                  onClick={handleImportRssFile}
                  className="text-sm px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2"
                >
                  <span>📂</span>
                  MD 불러오기
                </button>
                <button
                  onClick={handleExportRss}
                  className="text-sm px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2"
                >
                  <span>💾</span>
                  MD 내보내기
                </button>

                <button
                  onClick={loadRecommendedFeeds}
                  className="text-sm px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-sm flex items-center gap-2"
                >
                  <span>📚</span>
                  추천 RSS
                </button>
              </div>
              <button
                onClick={() => {
                  if (confirm("모든 RSS 피드를 초기화하시겠습니까?")) {
                    setFormData({ ...formData, rssUrls: [""] });
                    setStatus("✅ RSS 피드가 초기화되었습니다.");
                    setTimeout(() => setStatus(""), 3000);
                  }
                }}
                className="text-sm px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-sm flex items-center gap-2"
              >
                <span>🔄</span>
                초기화
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
              {formData.rssUrls.map((url, idx) => (
                <div key={idx} className="flex gap-2 mb-2 last:mb-0">
                  <input
                    type="text"
                    className="flex-1 border-2 border-gray-200 p-3 rounded-lg text-slate-800 text-sm focus:border-blue-400 focus:outline-none transition-all"
                    placeholder="https://example.com/rss"
                    value={url}
                    onChange={(e) => handleRssChange(idx, e.target.value)}
                  />
                  <button
                    onClick={() => removeRssField(idx)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all text-sm font-medium shadow-sm"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addRssField}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-all font-medium flex items-center justify-center gap-2"
            >
              <span className="text-lg">+</span>
              RSS 주소 추가
            </button>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>💡 팁:</strong> RSS 피드는 AI가 글감을 수집하는 데
                사용됩니다. 자주 방문하는 블로그나 뉴스 사이트의 RSS 주소를
                추가해보세요.
              </p>
            </div>
          </div>
        )}

        {/* 이미지 검색 탭 */}
        {activeTab === "image" && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 pb-3 border-b-2 border-gray-200">
              <span className="text-2xl">🖼️</span>
              이미지 검색 설정
            </h3>

            <div className="bg-blue-50 p-4 rounded-lg mb-4 text-sm text-blue-800 border border-blue-200">
              <p>
                <strong>알림:</strong> 브라우저 자동화(크롤링) 방식은 차단될 수
                있으므로, <strong>공식 API</strong>를 사용하는 것을 권장합니다.
              </p>
            </div>

            <div>
              <label className="block font-medium mb-2">Pexels API Key</label>
              <input
                type="password"
                className="w-full border-2 border-gray-200 p-3 rounded-lg text-slate-800 focus:border-blue-400 focus:outline-none transition-all"
                value={formData.pexelsApiKey || ""}
                onChange={(e) =>
                  setFormData({ ...formData, pexelsApiKey: e.target.value })
                }
                placeholder="Pexels API Key 입력"
              />
              <p className="text-xs text-gray-500 mt-2">
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

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h4 className="font-bold text-green-800 mb-2">
                ✅ 현재 설정 상태
              </h4>
              <p className="text-sm text-green-700">
                {formData.pexelsApiKey
                  ? "Pexels API가 설정되어 있습니다. 이미지 검색이 가능합니다."
                  : "Pexels API가 설정되지 않았습니다. API 키를 입력해주세요."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={handleSave}
          className="flex-1 px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-md font-bold flex items-center justify-center gap-2 text-base"
        >
          <span className="text-xl">💾</span>
          설정 저장
        </button>
      </div>

      {/* 상태 메시지 */}
      {status && (
        <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
          <p className="text-green-700 font-bold text-center">{status}</p>
        </div>
      )}

      {/* RSS 일괄 추가 모달 */}
      <RssBulkImportModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onImport={(urls) => {
          const existingUrls = new Set(formData.rssUrls);
          const uniqueUrls = urls.filter((url) => !existingUrls.has(url));

          const newRssUrls = [...formData.rssUrls, ...uniqueUrls];
          setFormData({ ...formData, rssUrls: newRssUrls });
          setStatus(`✅ ${uniqueUrls.length}개의 RSS 피드가 추가되었습니다.`);
          setTimeout(() => setStatus(""), 3000);
        }}
      />
    </div>
  );
};

export default Settings;
