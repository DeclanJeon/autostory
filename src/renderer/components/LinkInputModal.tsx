import React, { useState } from "react";

interface LinkInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const LinkInputModal: React.FC<LinkInputModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("General");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async () => {
    if (!url) {
      alert("URL을 입력해주세요.");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await window.electronAPI.processLinkAndGenerate({
        url,
        category,
      });

      if (result.success) {
        alert("글 생성이 완료되었습니다!");
        onSuccess();
        onClose();
        setUrl(""); // Reset URL
      } else {
        alert(`오류: ${result.error}`);
      }
    } catch (e: any) {
      alert(`실패: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-xl font-bold mb-4">🔗 링크 기반 글 생성</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL (기사, 블로그, 뉴스 등)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-blue-500"
              placeholder="https://example.com/article"
              disabled={isProcessing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              카테고리
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-blue-500"
              disabled={isProcessing}
            />
          </div>
          
          {isProcessing && (
            <div className="text-sm text-blue-600 animate-pulse">
              AI가 링크 내용을 분석하고 글을 작성 중입니다... (약 15-30초 소요)
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            disabled={isProcessing}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold ${
              isProcessing ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={isProcessing}
          >
            {isProcessing ? "생성 중..." : "글 생성 시작"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkInputModal;
