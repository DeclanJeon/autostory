import React, { useState, useEffect } from "react";

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
  // 기본 상태
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("General");
  const [autoPublish, setAutoPublish] = useState(false);

  // 처리 상태
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessages, setProgressMessages] = useState<ProgressInfo[]>([]);
  const [generatedTitles, setGeneratedTitles] = useState<GeneratedTitle[]>([]);
  const [currentStage, setCurrentStage] = useState<string>("");

  // 진행 상황 리스너 등록
  useEffect(() => {
    if (!window.electronAPI) return;

    const removeListener = window.electronAPI.onFileProcessProgress(
      (_event: any, msg: string) => {
        const type = msg.includes("❌")
          ? "error"
          : msg.includes("✅") || msg.includes("🎉")
          ? "success"
          : msg.includes("⏳")
          ? "warning"
          : "info";

        setProgressMessages((prev) => [
          ...prev.slice(-9), // 최근 10개만 유지
          { message: msg, type, timestamp: Date.now() },
        ]);

        // 스테이지 추출
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
      // 파일명에서 확장자 제거하여 제목 자동 입력
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleSubmit = async () => {
    if (!file || !title) {
      alert("파일과 제목을 입력해주세요.");
      return;
    }

    if (!window.electronAPI) return;

    setIsProcessing(true);
    setProgressMessages([]);
    setGeneratedTitles([]);
    setCurrentStage("analyzing");

    try {
      // 파일 경로 획득
      let filePath = "";
      if (window.electronAPI.getFilePath) {
        filePath = window.electronAPI.getFilePath(file);
      } else {
        // @ts-ignore
        filePath = file.path;
      }

      if (!filePath) {
        throw new Error("파일 경로를 가져올 수 없습니다.");
      }

      const result = await window.electronAPI.uploadAndProcessFile({
        filePath,
        title,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t),
        category,
        autoPublish,
      });

      if (result.success) {
        // 생성된 제목 정보 저장
        if (result.titles) {
          setGeneratedTitles(
            result.titles.map((t) => ({
              partNumber: t.partNumber,
              fullTitle: t.fullTitle,
              filePath: t.fullTitle, // 임시로 fullTitle을 사용
            }))
          );
        }

        const successMsg = autoPublish
          ? `🎉 시리즈 발행 완료! 총 ${
              result.files?.length || 0
            }편이 생성되었습니다.`
          : `✅ 시리즈 생성 완료! 총 ${
              result.files?.length || 0
            }편이 생성되었습니다.`;

        setProgressMessages((prev) => [
          ...prev,
          { message: successMsg, type: "success", timestamp: Date.now() },
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
    if (isProcessing) {
      if (!confirm("처리 중입니다. 정말 닫으시겠습니까?")) return;
    }

    setFile(null);
    setTitle("");
    setTags("");
    setCategory("General");
    setAutoPublish(false);
    setProgressMessages([]);
    setGeneratedTitles([]);
    setCurrentStage("");
    setIsProcessing(false);
    onClose();
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case "analyzing":
        return "🔍";
      case "generating":
        return "✨";
      case "publishing":
        return "📤";
      case "complete":
        return "🎉";
      default:
        return "⏳";
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "analyzing":
        return "콘텐츠 분석 중";
      case "generating":
        return "AI 콘텐츠 생성 중";
      case "publishing":
        return "블로그 발행 중";
      case "complete":
        return "완료";
      default:
        return "준비 중";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            📄 파일 업로드 및 시리즈 생성
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            disabled={isProcessing}
          >
            ×
          </button>
        </div>

        {/* 진행 상태 표시 (처리 중일 때) */}
        {isProcessing && currentStage && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl animate-bounce">
                {getStageIcon(currentStage)}
              </span>
              <span className="font-bold text-blue-800">
                {getStageLabel(currentStage)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500 animate-pulse"
                style={{
                  width:
                    currentStage === "complete"
                      ? "100%"
                      : currentStage === "publishing"
                      ? "75%"
                      : currentStage === "generating"
                      ? "50%"
                      : "25%",
                }}
              />
            </div>
          </div>
        )}

        {/* 메인 컨텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {!isProcessing ? (
            // 입력 폼
            <div className="space-y-4">
              {/* 파일 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  📎 파일 선택 (PDF, TXT, MD, HTML)
                </label>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.html"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
                {file && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ 선택된 파일: {file.name} ({(file.size / 1024).toFixed(1)}{" "}
                    KB)
                  </p>
                )}
              </div>

              {/* 시리즈 제목 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  📝 시리즈 제목 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="예: 파이썬 완전정복"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 생성되는 각 편의 제목: "
                  <strong>{title || "제목"} 1편 [소제목]</strong>" 형식
                </p>
              </div>

              {/* 태그 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  🏷️ 태그 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-blue-500"
                  placeholder="파이썬, 프로그래밍, 튜토리얼"
                />
              </div>

              {/* 카테고리 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  📁 카테고리
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border rounded px-3 py-2 focus:outline-blue-500"
                />
              </div>

              {/* 자동 발행 옵션 */}
              <div className="flex items-center bg-gradient-to-r from-orange-50 to-yellow-50 p-4 rounded-lg border border-orange-200">
                <input
                  id="autoPublish"
                  type="checkbox"
                  checked={autoPublish}
                  onChange={(e) => setAutoPublish(e.target.checked)}
                  className="h-5 w-5 text-orange-600 focus:ring-orange-500 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="autoPublish" className="ml-3 cursor-pointer">
                  <span className="font-medium text-orange-800">
                    🚀 생성 후 자동 발행
                  </span>
                  <p className="text-xs text-orange-600 mt-1">
                    각 편이 생성되면 순차적으로 블로그에 발행합니다 (편당 30초
                    간격)
                  </p>
                </label>
              </div>
            </div>
          ) : (
            // 진행 상황 로그
            <div className="space-y-3">
              {/* 진행 메시지 */}
              <div className="bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto">
                {progressMessages.map((info, idx) => (
                  <div
                    key={idx}
                    className={`text-sm font-mono mb-1 ${
                      info.type === "error"
                        ? "text-red-400"
                        : info.type === "success"
                        ? "text-green-400"
                        : info.type === "warning"
                        ? "text-yellow-400"
                        : "text-gray-300"
                    }`}
                  >
                    <span className="text-gray-500 mr-2">
                      {new Date(info.timestamp).toLocaleTimeString()}
                    </span>
                    {info.message}
                  </div>
                ))}
                {progressMessages.length === 0 && (
                  <div className="text-gray-500 animate-pulse">
                    처리를 시작합니다...
                  </div>
                )}
              </div>

              {/* 생성된 제목 목록 */}
              {generatedTitles.length > 0 && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <h4 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                    ✅ 생성된 시리즈 ({generatedTitles.length}편)
                  </h4>
                  <ul className="space-y-1">
                    {generatedTitles.map((t) => (
                      <li
                        key={t.partNumber}
                        className="text-sm text-green-700 flex items-center gap-2"
                      >
                        <span className="bg-green-200 text-green-800 px-2 py-0.5 rounded text-xs font-bold">
                          {t.partNumber}편
                        </span>
                        <span className="truncate">{t.fullTitle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 버튼 */}
        <div className="mt-6 flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition"
            disabled={isProcessing}
          >
            {isProcessing ? "처리 중..." : "취소"}
          </button>
          <button
            onClick={handleSubmit}
            className={`px-6 py-2 rounded font-bold transition flex items-center gap-2 ${
              isProcessing
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg"
            }`}
            disabled={isProcessing || !file || !title}
          >
            {isProcessing ? (
              <>
                <span className="animate-spin">⏳</span>
                처리 중...
              </>
            ) : (
              <>✨ 시리즈 생성</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;
