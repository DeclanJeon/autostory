import React, { useState, useEffect, useCallback, useRef } from "react";
import { recommendedFeeds } from "../data/recommendedFeeds";
import RssBulkImportModal from "../components/RssBulkImportModal";
import {
  LocalAiStatus,
  ModelWithRecommendation,
  InstallProgress,
  ModelCategory,
  VersionInfo,
} from "../types/global";
import {
  Settings as SettingsIcon,
  Globe,
  Lock,
  Cpu,
  Radio,
  Image as ImageIcon,
  Save,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Plus,
  X,
  Check,
  Search,
  Info,
  AlertTriangle,
  Terminal,
  BookOpen,
  LogIn,
} from "lucide-react";

type TabType = "blog" | "login" | "ai" | "rss" | "image";

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("blog");

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

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [allModels, setAllModels] = useState<string[]>([]);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModelList, setShowModelList] = useState(false);

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
  const [categoryFilter, setCategoryFilter] = useState<ModelCategory | "all">(
    "all"
  );
  const [searchModelTerm, setSearchModelTerm] = useState("");
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const availableModelsRef = useRef<string[]>([]);

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: "blog", label: "블로그 정보", icon: Globe },
    { id: "login", label: "로그인 관리", icon: Lock },
    { id: "ai", label: "AI 설정", icon: Cpu },
    { id: "rss", label: "RSS 피드", icon: Radio },
    { id: "image", label: "이미지 API", icon: ImageIcon },
  ];

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
        }
      });
    }
  }, []);

  useEffect(() => {
    loadLocalAiStatus();
    checkOllamaVersion();

    // Listeners setup (omitted for brevity but logic is preserved)
    const removeInstallListener =
      window.electronAPI?.onLocalAiInstallProgress?.(
        (_event: any, progress: any) => {
          setInstallProgress(progress);
          if (progress.stage === "complete") {
            setIsInstallingOllama(false);
            setTimeout(loadLocalAiStatus, 500);
          } else if (progress.stage === "error") {
            setIsInstallingOllama(false);
          }
        }
      );

    const removeModelListener = window.electronAPI?.onLocalAiModelProgress?.(
      (_event: any, data: any) => {
        if (data && typeof data.progress === "number") {
          setModelProgress(data.progress);
          setModelProgressStatus(data.status || "다운로드 중...");
          if (data.progress >= 100 || data.status === "완료!") {
            setTimeout(() => {
              setPullingModel(null);
              setModelProgress(0);
              loadLocalAiStatus();
            }, 1500);
          }
        }
      }
    );

    return () => {
      if (removeInstallListener) removeInstallListener();
      if (removeModelListener) removeModelListener();
    };
  }, []);

  useEffect(() => {
    if (
      formData.aiProvider === "openrouter" &&
      formData.openrouterApiKey?.startsWith("sk-or-v1-")
    )
      loadModels();
    if (
      formData.aiProvider === "gemini" &&
      formData.aiApiKey?.startsWith("AIza")
    )
      loadModels();
  }, [formData.aiProvider, formData.openrouterApiKey, formData.aiApiKey]);

  useEffect(() => {
    setAvailableModels([]);
    setFilteredModels([]);
    setSearchTerm("");
  }, [formData.aiProvider]);

  useEffect(() => {
    if (formData.aiProvider === "openrouter") filterModels(searchTerm);
    else setFilteredModels(availableModels);
  }, [showAllModels, availableModels, allModels, searchTerm]);

  const loadLocalAiStatus = async () => {
    if (window.electronAPI) {
      setIsLoadingLocalAi(true);
      try {
        const status = await window.electronAPI.localAiStatus();
        setLocalAiStatus(status);
      } catch (e) {
        setLocalAiStatus(null);
      } finally {
        setIsLoadingLocalAi(false);
      }
    }
  };

  const checkOllamaVersion = async () => {
    if (window.electronAPI?.localAiCheckUpdate) {
      const info = await window.electronAPI.localAiCheckUpdate();
      setVersionInfo(info);
    }
  };

  const loadModels = useCallback(async () => {
    const apiKey =
      formData.aiProvider === "openrouter"
        ? formData.openrouterApiKey
        : formData.aiApiKey;
    if (!apiKey) return;

    setIsLoadingModels(true);
    if (window.electronAPI) {
      try {
        const models = await window.electronAPI.listModels(
          apiKey,
          formData.aiProvider,
          showAllModels
        );
        if (models?.length) {
          if (formData.aiProvider === "openrouter" && showAllModels) {
            setAllModels(models);
            setFilteredModels(models);
            if (availableModels.length === 0) {
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
          setStatus(`Loaded ${models.length} models.`);
        }
      } catch (e) {
        console.error(e);
      }
    }
    setIsLoadingModels(false);
    setTimeout(() => setStatus(""), 3000);
  }, [
    formData.aiProvider,
    formData.aiApiKey,
    formData.openrouterApiKey,
    showAllModels,
  ]);

  const filterModels = (term: string) => {
    setSearchTerm(term);
    let source =
      formData.aiProvider === "openrouter" && showAllModels
        ? allModels
        : availableModels;
    if (!term.trim()) {
      setFilteredModels(source);
      return;
    }
    setFilteredModels(
      source.filter((m) => m.toLowerCase().includes(term.toLowerCase()))
    );
  };

  const handleSave = async () => {
    const cleanSettings = {
      ...formData,
      rssUrls: formData.rssUrls.filter((u) => u.trim() !== ""),
    };
    if (window.electronAPI) {
      await window.electronAPI.saveSettings(cleanSettings);
      setStatus("설정이 저장되었습니다.");
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleNaverLogin = async () => {
    if (window.electronAPI?.startNaverLogin) {
      setStatus("네이버 로그인 창을 여는 중...");
      const res = await window.electronAPI.startNaverLogin();
      setStatus(
        res.success ? "✅ 네이버 로그인 완료" : `❌ 실패: ${res.error}`
      );
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const getFilteredLocalModels = (): ModelWithRecommendation[] => {
    if (!localAiStatus?.supportedModels) return [];
    let filtered = localAiStatus.supportedModels;
    if (categoryFilter !== "all")
      filtered = filtered.filter((m) => m.category === categoryFilter);
    if (searchModelTerm)
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(searchModelTerm.toLowerCase()) ||
          m.id.toLowerCase().includes(searchModelTerm.toLowerCase())
      );
    return filtered;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-8 gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-2 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-200 to-slate-400 flex items-center gap-3">
            <SettingsIcon size={28} className="text-slate-400" />
            System Settings
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            애플리케이션의 동작 환경을 설정합니다.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {status && (
            <span className="text-sm text-emerald-400 animate-pulse bg-emerald-900/20 px-3 py-1 rounded-full border border-emerald-900/50">
              {status}
            </span>
          )}
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl transition shadow-lg flex items-center gap-2 font-bold"
          >
            <Save size={18} /> 설정 저장
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-slate-800/50 rounded-xl border border-slate-700 backdrop-blur w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-slate-700 text-white shadow-md ring-1 ring-slate-600"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-800/20 rounded-2xl border border-slate-700/50 backdrop-blur p-8">
        {/* BLOG TAB */}
        {activeTab === "blog" && (
          <div className="max-w-3xl space-y-8 animate-in slide-in-from-bottom-2">
            {/* Tistory */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-500 border border-orange-500/30">
                    T
                  </span>
                  Tistory Blog
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.tistoryEnabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        tistoryEnabled: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div
                className={`space-y-4 transition-opacity ${
                  !formData.tistoryEnabled && "opacity-50 pointer-events-none"
                }`}
              >
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Subdomain
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={formData.blogName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          blogName: e.target.value,
                          writeRedirectUrl: `https://${e.target.value}.tistory.com/manage/newpost`,
                        })
                      }
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-l-lg p-3 text-white focus:border-blue-500 outline-none"
                      placeholder="blog-name"
                    />
                    <span className="bg-slate-800 border border-l-0 border-slate-700 text-slate-400 p-3 rounded-r-lg text-sm">
                      .tistory.com
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Naver */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-500 border border-green-500/30">
                    N
                  </span>
                  Naver Blog
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.naverEnabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        naverEnabled: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
              <div
                className={`space-y-4 transition-opacity ${
                  !formData.naverEnabled && "opacity-50 pointer-events-none"
                }`}
              >
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Naver ID
                  </label>
                  <input
                    type="text"
                    value={formData.naverBlogId}
                    onChange={(e) =>
                      setFormData({ ...formData, naverBlogId: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                    placeholder="Your Naver ID"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LOGIN TAB */}
        {activeTab === "login" && (
          <div className="max-w-3xl space-y-6 animate-in slide-in-from-bottom-2">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                <span className="font-extrabold text-2xl">N</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Naver Login Automation
              </h3>
              <p className="text-slate-400 mb-6">
                자동 포스팅을 위해 네이버 계정에 로그인합니다. 브라우저 창이
                열리면 로그인해주세요.
              </p>

              <button
                onClick={handleNaverLogin}
                className={`w-full max-w-sm mx-auto py-3 px-6 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
                  formData.naverEnabled
                    ? "bg-green-600 hover:bg-green-500 shadow-lg"
                    : "bg-slate-700 cursor-not-allowed opacity-50"
                }`}
                disabled={!formData.naverEnabled}
              >
                <LogIn size={20} />
                {formData.naverEnabled
                  ? "네이버 로그인 시작"
                  : "네이버 블로그가 비활성화됨"}
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 text-center opacity-70">
              <div className="w-16 h-16 bg-yellow-500/10 text-yellow-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-yellow-500/20">
                <span className="font-extrabold text-2xl">K</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Kakao Login Automation
              </h3>
              <p className="text-slate-400 mb-6">
                티스토리 접근을 위한 카카오 계정 로그인 (현재 개발 중)
              </p>
              <button
                disabled
                className="w-full max-w-sm mx-auto py-3 px-6 rounded-xl font-bold text-slate-400 bg-slate-800 border border-slate-700 cursor-not-allowed"
              >
                준비 중...
              </button>
            </div>
          </div>
        )}

        {/* AI TAB */}
        {activeTab === "ai" && (
          <div className="flex gap-8 animate-in slide-in-from-bottom-2 h-full">
            {/* Left: General Settings */}
            <div className="flex-1 space-y-6 overflow-y-auto">
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Cpu size={18} /> AI Provider
                </h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {["gemini", "openrouter", "local"].map((provider) => (
                    <button
                      key={provider}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          aiProvider: provider as any,
                        })
                      }
                      className={`py-3 rounded-xl font-bold text-sm border transition-all ${
                        formData.aiProvider === provider
                          ? "bg-blue-600 border-blue-500 text-white shadow-lg"
                          : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </button>
                  ))}
                </div>

                {formData.aiProvider !== "local" && (
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                      API Key
                    </label>
                    <div className="relative">
                      <Lock
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <input
                        type="password"
                        value={
                          formData.aiProvider === "gemini"
                            ? formData.aiApiKey
                            : formData.openrouterApiKey
                        }
                        onChange={(e) =>
                          formData.aiProvider === "gemini"
                            ? setFormData({
                                ...formData,
                                aiApiKey: e.target.value,
                              })
                            : setFormData({
                                ...formData,
                                openrouterApiKey: e.target.value,
                              })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-3 py-3 text-white focus:border-blue-500 outline-none"
                        placeholder={
                          formData.aiProvider === "gemini"
                            ? "AIza..."
                            : "sk-or-v1..."
                        }
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                      <Info size={12} /> Key is stored locally and securely.
                    </p>
                  </div>
                )}
              </div>

              {formData.aiProvider !== "local" && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">
                      Model Selection
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowAllModels(!showAllModels)}
                        className={`text-xs px-2 py-1 rounded border ${
                          showAllModels
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "border-slate-600 text-slate-400"
                        }`}
                      >
                        {showAllModels ? "Show All" : "Free Only"}
                      </button>
                      <button
                        onClick={loadModels}
                        className="text-slate-400 hover:text-white"
                      >
                        <RefreshCw
                          size={16}
                          className={isLoadingModels ? "animate-spin" : ""}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      type="text"
                      placeholder="Search models..."
                      value={searchTerm}
                      onChange={(e) => filterModels(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white mb-2 focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div className="h-48 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
                    {filteredModels.map((model) => (
                      <button
                        key={model}
                        onClick={() =>
                          setFormData({ ...formData, aiModel: model })
                        }
                        className={`w-full text-left px-3 py-2 rounded text-sm ${
                          formData.aiModel === model
                            ? "bg-blue-600 text-white"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Local AI Specifics */}
            {formData.aiProvider === "local" && (
              <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <TryIcon size={20} /> Ollama Manager
                    </h3>
                    <p className="text-sm text-slate-500">
                      {localAiStatus?.isRunning
                        ? "Local AI is running"
                        : "Service not started"}
                    </p>
                  </div>
                  <div
                    className={`w-3 h-3 rounded-full ${
                      localAiStatus?.isRunning
                        ? "bg-green-500 shadow-[0_0_10px_#22c55e]"
                        : "bg-red-500"
                    }`}
                  ></div>
                </div>

                {!localAiStatus?.isInstalled && (
                  <div className="text-center p-6 bg-slate-900 rounded-xl border border-slate-700 border-dashed">
                    <p className="text-slate-400 mb-4">
                      Ollama가 설치되지 않았습니다.
                    </p>
                    <button
                      onClick={() => window.electronAPI?.localAiInstall()}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold"
                    >
                      Install Ollama
                    </button>
                  </div>
                )}

                {/* Model List would go here - simplified for brevity */}
                <div className="mt-4">
                  <h4 className="font-bold text-slate-300 mb-2">
                    Installed Models
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {localAiStatus?.installedModels.map((m) => (
                      <span
                        key={m}
                        className="bg-emerald-900/30 text-emerald-400 border border-emerald-800 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2"
                      >
                        {m}
                        <button
                          onClick={() => {}}
                          className="hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RSS TAB */}
        {activeTab === "rss" && (
          <div className="max-w-3xl space-y-6 animate-in slide-in-from-bottom-2">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">
                  RSS Feed Sources
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setFormData({
                        ...formData,
                        rssUrls: [...formData.rssUrls, ""],
                      })
                    }
                    className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => {}}
                    className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                  >
                    <Upload size={16} />
                  </button>
                  <button
                    onClick={() => {}}
                    className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {formData.rssUrls.map((url, idx) => (
                  <div
                    key={idx}
                    className="flex gap-2 animate-in fade-in slide-in-from-left-4 duration-300"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="relative flex-1">
                      <Radio
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => {
                          const newUrls = [...formData.rssUrls];
                          newUrls[idx] = e.target.value;
                          setFormData({ ...formData, rssUrls: newUrls });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-3 py-3 text-white focus:border-blue-500 outline-none text-sm font-mono"
                        placeholder="https://example.com/rss"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const newUrls = formData.rssUrls.filter(
                          (_, i) => i !== idx
                        );
                        setFormData({ ...formData, rssUrls: newUrls });
                      }}
                      className="p-3 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* IMAGE TAB */}
        {activeTab === "image" && (
          <div className="max-w-3xl space-y-6 animate-in slide-in-from-bottom-2">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">
                Stock Image Providers
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Unsplash Access Key
                  </label>
                  <input
                    type="password"
                    value={formData.unsplashAccessKey}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        unsplashAccessKey: e.target.value,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                    placeholder="Unsplash API Key"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Pexels API Key
                  </label>
                  <input
                    type="password"
                    value={formData.pexelsApiKey}
                    onChange={(e) =>
                      setFormData({ ...formData, pexelsApiKey: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                    placeholder="Pexels API Key"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper for icon undefined
import { Terminal as TryIcon } from "lucide-react";

export default Settings;
