import React, { useState, useEffect } from "react";
import {
  X,
  Zap,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  Camera,
} from "lucide-react";

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface GeneratedTitle {
  partNumber: number;
  fullTitle: string;
  filePath: string;
}

interface ProgressInfo {
  message: string;
  type: "info" | "success" | "error" | "warning";
  timestamp: number;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("General");
  // const [autoPublish, setAutoPublish] = useState(false); // Removed state
  const [useAiImage, setUseAiImage] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingType, setProcessingType] = useState<
    "save" | "publish" | null
  >(null);
  const [progressMessages, setProgressMessages] = useState<ProgressInfo[]>([]);
  const [generatedTitles, setGeneratedTitles] = useState<GeneratedTitle[]>([]);
  const [currentStage, setCurrentStage] = useState<string>("");

  useEffect(() => {
    if (!window.electronAPI) return;
    const removeListener = window.electronAPI.onFileProcessProgress(
      (_event: any, msg: string) => {
        const type = msg.includes("❌")
          ? "error"
          : msg.includes("✅")
          ? "success"
          : "info";
        setProgressMessages((prev) => [
          ...prev.slice(-9),
          { message: msg, type, timestamp: Date.now() },
        ]);
        if (msg.includes("분석")) setCurrentStage("analyzing");
        else if (msg.includes("생성 중")) setCurrentStage("generating");
        else if (msg.includes("발행")) setCurrentStage("publishing");
        else if (msg.includes("완료")) setCurrentStage("complete");
      }
    );
    return () => removeListener();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!title) setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleSubmit = async (shouldPublish: boolean) => {
    if (!file || !title) return alert("파일과 제목을 입력해주세요.");
    setIsProcessing(true);
    setProcessingType(shouldPublish ? "publish" : "save");
    setProgressMessages([]);
    setGeneratedTitles([]);
    setCurrentStage("analyzing");

    try {
      let filePath = "";
      // @ts-ignore
      filePath = window.electronAPI.getFilePath
        ? window.electronAPI.getFilePath(file)
        : file.path;
      if (!filePath) throw new Error("파일 경로 없음");

      const result = await window.electronAPI.uploadAndProcessFile({
        filePath,
        title,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        category,
        autoPublish: shouldPublish,
        options: { useAiImage },
      });

      if (result.success) {
        if (result.titles) {
          setGeneratedTitles(
            result.titles.map((t: any) => ({
              partNumber: t.partNumber,
              fullTitle: t.fullTitle,
              filePath: t.fullTitle,
            }))
          );
        }
        setProgressMessages((prev) => [
          ...prev,
          { message: "작업 완료!", type: "success", timestamp: Date.now() },
        ]);
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 2000);
      } else {
        throw new Error(result.error || "알 수 없는 오류");
      }
    } catch (e: any) {
      setProgressMessages((prev) => [
        ...prev,
        {
          message: `❌ 오류: ${e.message}`,
          type: "error",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isProcessing && !confirm("중단하시겠습니까?")) return;
    setFile(null);
    setTitle("");
    setTags("");
    setTags("");
    setCategory("General");
    // setAutoPublish(false);
    setProgressMessages([]);
    setGeneratedTitles([]);
    setCurrentStage("");
    setIsProcessing(false);
    setProcessingType(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <UploadCloud size={24} className="text-blue-500" />
            File to Series
          </h3>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="text-slate-500 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Status Bar */}
        {isProcessing && currentStage && (
          <div className="px-6 pt-4">
            <div className="bg-slate-800 rounded-lg p-3 border border-blue-900/50 flex items-center gap-4">
              {currentStage === "complete" ? (
                <CheckCircle2 className="text-green-500" />
              ) : (
                <Loader2 className="animate-spin text-blue-500" />
              )}
              <div className="flex-1">
                <div className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                  <span className="capitalize">{currentStage}</span>
                  <span>
                    {currentStage === "complete" ? "100%" : "Processing..."}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-500"
                    style={{
                      width:
                        currentStage === "complete"
                          ? "100%"
                          : currentStage === "publishing"
                          ? "75%"
                          : "50%",
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isProcessing ? (
            <div className="space-y-4">
              <div className="p-6 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition text-center group cursor-pointer relative">
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.html"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <UploadCloud
                  size={32}
                  className="mx-auto text-slate-500 mb-2 group-hover:text-blue-400 transition"
                />
                <p className="text-sm text-slate-400 group-hover:text-white transition font-medium">
                  Click to upload file (PDF, TXT, MD)
                </p>
                {file && (
                  <p className="text-xs text-green-400 mt-2 font-bold">
                    {file.name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Series Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                    placeholder="e.g. Python Guide"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                    Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                  Tags
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:border-blue-500 outline-none"
                  placeholder="comma, separated, tags"
                />
              </div>

              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                {/* Auto Publish Checkbox Removed */}

                <div className="flex gap-2">
                  <button
                    onClick={() => setUseAiImage(false)}
                    className={`flex-1 p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${
                      !useAiImage
                        ? "bg-blue-600/20 border-blue-500 text-blue-400"
                        : "border-slate-700 text-slate-500 hover:bg-slate-800"
                    }`}
                  >
                    <Camera size={14} /> Capture Mode
                  </button>
                  <button
                    onClick={() => setUseAiImage(true)}
                    className={`flex-1 p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${
                      useAiImage
                        ? "bg-purple-600/20 border-purple-500 text-purple-400"
                        : "border-slate-700 text-slate-500 hover:bg-slate-800"
                    }`}
                  >
                    <ImageIcon size={14} /> AI Image Mode
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs overflow-y-auto max-h-48 space-y-1">
                {progressMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`${
                      msg.type === "error"
                        ? "text-red-400"
                        : msg.type === "success"
                        ? "text-green-400"
                        : "text-slate-400"
                    }`}
                  >
                    <span className="opacity-50 mr-2">
                      [{new Date(msg.timestamp).toLocaleTimeString()}]
                    </span>
                    {msg.message}
                  </div>
                ))}
              </div>

              {generatedTitles.length > 0 && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4">
                  <h4 className="font-bold text-green-400 mb-2 flex items-center gap-2">
                    <CheckCircle2 size={16} /> Generated Series
                  </h4>
                  <ul className="space-y-1">
                    {generatedTitles.map((t, i) => (
                      <li key={i} className="text-xs text-green-300 flex gap-2">
                        <span className="bg-green-900/50 px-1.5 rounded text-[10px] border border-green-700">
                          Pt.{t.partNumber}
                        </span>
                        {t.fullTitle}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50">
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={isProcessing || !file || !title}
            className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 ${
              isProcessing
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
            }`}
          >
            {isProcessing && processingType === "save" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {isProcessing && processingType === "save"
              ? "Saving..."
              : "Save to Manager"}
          </button>

          <button
            onClick={() => handleSubmit(true)}
            disabled={isProcessing || !file || !title}
            className={`px-6 py-2 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 ${
              isProcessing
                ? "bg-slate-700 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 bg-gradient-to-r from-blue-600 to-indigo-600"
            }`}
          >
            {isProcessing && processingType === "publish" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Zap size={16} />
            )}
            {isProcessing && processingType === "publish"
              ? "Processing..."
              : "Publish Immediately"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;
