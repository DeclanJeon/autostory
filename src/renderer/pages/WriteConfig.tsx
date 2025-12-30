import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Template } from "../types/global";
import { useToastHelpers } from "../components/Toast";
import { useDraftStore } from "../stores/draftStore";
import {
  Wand2,
  FileText,
  Rocket,
  Image as ImageIcon,
  CheckCircle2,
  PenTool,
  Search,
  Layout,
  Globe,
  CornerDownRight,
  AlertTriangle,
  Loader2,
  ArrowRight,
} from "lucide-react";

const WriteConfig: React.FC = () => {
  const navigate = useNavigate();
  const { selectedIssues, targetCategory, setTargetCategory } = useDraftStore();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoPublish, setAutoPublish] = useState(true);
  const [log, setLog] = useState("");
  const [writeMode, setWriteMode] = useState<"auto" | "custom">("auto");

  const [targetPlatforms, setTargetPlatforms] = useState({
    tistory: true,
    naver: false,
  });

  const [isTestingImage, setIsTestingImage] = useState(false);
  const [testResult, setTestResult] = useState<{
    keyword: string;
    imageUrls: string[];
  } | null>(null);

  const { showSuccess, showError, showInfo } = useToastHelpers();

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.listTemplates().then((list) => {
        setTemplates(list);
        if (list.length > 0) setSelectedTemplateId(list[0].id);
      });

      window.electronAPI.getSettings().then((settings) => {
        setTargetPlatforms({
          tistory: settings.tistoryEnabled,
          naver: settings.naverEnabled && !!settings.naverBlogId,
        });
      });
    }
  }, []);

  const handleGenerateAndPublish = async () => {
    setIsGenerating(true);
    setLog("AI 콘텐츠 생성 및 자동 발행 중... (약 30초~1분 소요)");

    if (!window.electronAPI) {
      showError("오류 발생", "Electron API를 사용할 수 없습니다.");
      setIsGenerating(false);
      return;
    }

    try {
      const result = await window.electronAPI.generateContent({
        issues: selectedIssues,
        instructions,
        templateId:
          writeMode === "auto" ? "auto-analysis-mode" : selectedTemplateId,
        category: targetCategory,
        autoPublish: false,
      });

      if (result.success && result.filePath) {
        setLog("✅ 콘텐츠 생성 완료. 자동 발행 시작...");

        if (autoPublish) {
          const platforms = [];
          if (targetPlatforms.tistory) platforms.push("tistory");
          if (targetPlatforms.naver) platforms.push("naver");

          if (platforms.length === 0) {
            showInfo("알림", "발행할 플랫폼이 선택되지 않았습니다.");
            setIsGenerating(false);
            return;
          }

          const pubResult = await window.electronAPI.publishPostMulti({
            filePath: result.filePath,
            category: targetCategory,
            platforms,
          });

          if (pubResult.success) {
            let msg = "";
            const results = pubResult.results;
            if (results?.tistory)
              msg += results.reservation
                ? `✅ 티스토리 (예약: ${results.reservationDate})\n`
                : "✅ 티스토리 발행 성공\n";
            if (results?.naver) msg += "✅ 네이버 발행 성공\n";

            showSuccess("발행 완료!", msg);
            setTimeout(() => navigate("/posts"), 1500);
          } else {
            showError("발행 중 오류", pubResult.error || "알 수 없는 오류");
          }
        } else {
          setLog(`생성 완료! 파일 저장됨.`);
          showInfo("생성 완료", "글이 생성되었습니다. 수동 발행이 필요합니다.");
          setTimeout(() => navigate("/posts"), 1000);
        }
      } else {
        setLog(`실패: ${result.error}`);
        showError(
          "발행 실패",
          result.error || "글 발행 중 오류가 발생했습니다."
        );
      }
    } catch (e: any) {
      const errorMessage = e?.message || "알 수 없는 오류가 발생했습니다.";
      setLog(errorMessage);
      showError("오류 발생", errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTestImage = async () => {
    if (selectedIssues.length === 0) return alert("이슈를 먼저 선택하세요.");
    setIsTestingImage(true);
    setTestResult(null);

    try {
      const sampleText = `${selectedIssues[0].title} ${selectedIssues[0].contentSnippet}`;
      const result = await window.electronAPI?.testImageSearch({
        text: sampleText,
      });

      if (result?.success && result.imageUrls?.length) {
        setTestResult({
          keyword: result.keyword || "unknown",
          imageUrls: result.imageUrls,
        });
      } else {
        alert(
          "이미지 검색 실패: " + (result?.error || "이미지를 찾을 수 없습니다")
        );
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setIsTestingImage(false);
    }
  };

  if (selectedIssues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-slate-400 p-6">
        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 flex flex-col items-center text-center max-w-md">
          <AlertTriangle size={48} className="text-yellow-500 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">
            선택된 글감이 없습니다
          </h2>
          <p className="text-slate-400 mb-6">
            AI 글쓰기를 시작하려면 먼저 RSS 피드나 저장된 소재에서 글감을
            선택해야 합니다.
          </p>
          <button
            onClick={() => navigate("/feeds")}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition shadow-lg"
          >
            <Search size={18} /> 글감 찾으러 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-8 gap-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2 flex-shrink-0">
        <span className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
          <Wand2 size={24} className="text-white" />
        </span>
        <div>
          <h1 className="text-3xl font-extrabold text-white">
            AI Automation Config
          </h1>
          <p className="text-slate-400 text-sm">
            선택한 소재를 바탕으로 AI가 글을 작성하고 발행합니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Source & Settings */}
        <div className="space-y-6">
          {/* Source Materials */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FileText size={18} className="text-blue-400" />
              Selected Materials ({selectedIssues.length})
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
              {selectedIssues.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-900 border border-slate-700 rounded-xl hover:border-blue-500/50 transition duration-200"
                >
                  <p className="font-bold text-slate-200 text-sm mb-1 line-clamp-1">
                    {item.title}
                  </p>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>{item.source}</span>
                    <ArrowRight size={12} className="opacity-50" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                Category
              </label>
              <input
                type="text"
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none transition"
                placeholder="Enter category name (optional)"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">
                Writing Mode
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label
                  className={`cursor-pointer p-4 rounded-xl border transition-all ${
                    writeMode === "auto"
                      ? "bg-blue-600/20 border-blue-500"
                      : "bg-slate-900 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="radio"
                      checked={writeMode === "auto"}
                      onChange={() => setWriteMode("auto")}
                      className="hidden"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        writeMode === "auto"
                          ? "border-blue-500 bg-blue-500"
                          : "border-slate-500"
                      }`}
                    >
                      {writeMode === "auto" && (
                        <CheckCircle2 size={12} className="text-white" />
                      )}
                    </div>
                    <span
                      className={`font-bold ${
                        writeMode === "auto"
                          ? "text-blue-400"
                          : "text-slate-300"
                      }`}
                    >
                      AI Auto Analysis
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 pl-6 leading-relaxed">
                    AI automatically analyzes content structure and writes
                    naturally.
                  </p>
                </label>

                <label
                  className={`cursor-pointer p-4 rounded-xl border transition-all ${
                    writeMode === "custom"
                      ? "bg-purple-600/20 border-purple-500"
                      : "bg-slate-900 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="radio"
                      checked={writeMode === "custom"}
                      onChange={() => setWriteMode("custom")}
                      className="hidden"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        writeMode === "custom"
                          ? "border-purple-500 bg-purple-500"
                          : "border-slate-500"
                      }`}
                    >
                      {writeMode === "custom" && (
                        <CheckCircle2 size={12} className="text-white" />
                      )}
                    </div>
                    <span
                      className={`font-bold ${
                        writeMode === "custom"
                          ? "text-purple-400"
                          : "text-slate-300"
                      }`}
                    >
                      Using Template
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 pl-6 leading-relaxed">
                    Writes based on a predefined template structure.
                  </p>
                </label>
              </div>
            </div>

            {writeMode === "custom" && (
              <div className="animate-in slide-in-from-top-2">
                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                  Select Template
                </label>
                <div className="relative">
                  <Layout
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-3 py-3 text-white focus:border-purple-500 outline-none appearance-none"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                Instructions (Prompt)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none resize-none leading-relaxed text-sm"
                placeholder="Add specific instructions for the AI..."
              />
            </div>
          </div>
        </div>

        {/* Right Column: Publish & Preview */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 flex flex-col h-full">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Rocket size={18} className="text-emerald-400" />
              Publishing Options
            </h3>

            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 mb-6">
              <label className="flex items-center justify-between cursor-pointer mb-4">
                <span className="font-bold text-slate-200">Auto Publish</span>
                <div className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPublish}
                    onChange={(e) => setAutoPublish(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </div>
              </label>

              <div
                className={`space-y-2 transition-all ${
                  !autoPublish ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    targetPlatforms.tistory
                      ? "bg-orange-900/20 border-orange-500/50"
                      : "bg-slate-800 border-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={targetPlatforms.tistory}
                    onChange={(e) =>
                      setTargetPlatforms((p) => ({
                        ...p,
                        tistory: e.target.checked,
                      }))
                    }
                    className="hidden"
                  />
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border ${
                      targetPlatforms.tistory
                        ? "bg-orange-500 border-orange-500"
                        : "border-slate-500"
                    }`}
                  >
                    {targetPlatforms.tistory && (
                      <CheckCircle2 size={14} className="text-white" />
                    )}
                  </div>
                  <span
                    className={
                      targetPlatforms.tistory
                        ? "text-orange-200 font-bold"
                        : "text-slate-400"
                    }
                  >
                    Tistory Blog
                  </span>
                </label>

                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    targetPlatforms.naver
                      ? "bg-green-900/20 border-green-500/50"
                      : "bg-slate-800 border-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={targetPlatforms.naver}
                    onChange={(e) =>
                      setTargetPlatforms((p) => ({
                        ...p,
                        naver: e.target.checked,
                      }))
                    }
                    className="hidden"
                  />
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center border ${
                      targetPlatforms.naver
                        ? "bg-green-500 border-green-500"
                        : "border-slate-500"
                    }`}
                  >
                    {targetPlatforms.naver && (
                      <CheckCircle2 size={14} className="text-white" />
                    )}
                  </div>
                  <span
                    className={
                      targetPlatforms.naver
                        ? "text-green-200 font-bold"
                        : "text-slate-400"
                    }
                  >
                    Naver Blog
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-auto">
              {log && (
                <div
                  className={`text-xs font-mono p-3 rounded-lg mb-3 border ${
                    log.includes("Error") || log.includes("실패")
                      ? "bg-red-900/20 border-red-900/50 text-red-400"
                      : log.includes("완료")
                      ? "bg-emerald-900/20 border-emerald-900/50 text-emerald-400"
                      : "bg-blue-900/20 border-blue-900/50 text-blue-400"
                  }`}
                >
                  {log}
                </div>
              )}

              <button
                onClick={handleGenerateAndPublish}
                disabled={isGenerating}
                className={`w-full py-4 rounded-xl font-bold text-white shadow-xl transition transform hover:scale-[1.02] flex items-center justify-center gap-3 ${
                  isGenerating
                    ? "bg-slate-700 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
                }`}
              >
                {isGenerating ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <PenTool />
                )}
                {isGenerating ? "Processing..." : "Start Generation & Publish"}
              </button>
            </div>
          </div>

          {/* Image Test */}
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <ImageIcon size={16} /> Image Search Test
            </h3>
            <div className="flex gap-3">
              <button
                onClick={handleTestImage}
                disabled={isTestingImage}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2"
              >
                {isTestingImage ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Search size={12} />
                )}
                Test Search
              </button>
            </div>

            {testResult && (
              <div className="mt-4 bg-slate-900 rounded-xl p-3 border border-slate-800 animate-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-indigo-400">
                    Keyword: {testResult.keyword}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {testResult.imageUrls.length} images found
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                  {testResult.imageUrls.map((url, i) => (
                    <div
                      key={i}
                      className="aspect-square bg-slate-800 rounded-lg overflow-hidden relative group"
                    >
                      <img
                        src={url}
                        className="w-full h-full object-cover"
                        alt="result"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <button
                          onClick={() => navigator.clipboard.writeText(url)}
                          className="text-white text-[10px] bg-slate-800 px-2 py-1 rounded"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WriteConfig;
