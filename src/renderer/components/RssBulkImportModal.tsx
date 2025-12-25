import React, { useState } from "react";

interface RssBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (urls: string[]) => void;
}

const RssBulkImportModal: React.FC<RssBulkImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [text, setText] = useState("");

  const handleImport = () => {
    // 텍스트를 줄 단위로 분리하고 빈 줄 제거
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      alert("RSS URL을 하나 이상 입력해주세요.");
      return;
    }

    // URL 형식 검증 (간단히 http 또는 https로 시작하는지 확인)
    const invalidUrls = lines.filter(
      (url) => !url.startsWith("http://") && !url.startsWith("https://")
    );

    if (invalidUrls.length > 0) {
      alert(
        `유효하지 않은 URL이 있습니다:\n${invalidUrls.join(
          "\n"
        )}\n\nURL은 http:// 또는 https://로 시작해야 합니다.`
      );
      return;
    }

    onImport(lines);
    setText("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>📡</span>
          RSS 피드 일괄 추가
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RSS URL 목록 (줄바꿈으로 구분)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 min-h-[200px] focus:border-blue-500 focus:outline-none font-mono text-sm"
              placeholder="https://example.com/rss1.xml&#10;https://example.com/rss2.xml&#10;https://example.com/rss3.xml&#10;..."
            />
          </div>

          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
            <p className="font-medium">💡 사용법</p>
            <ul className="mt-1 list-disc list-inside text-xs space-y-1">
              <li>각 줄에 하나의 RSS URL을 입력하세요</li>
              <li>URL은 http:// 또는 https://로 시작해야 합니다</li>
              <li>빈 줄은 무시됩니다</li>
              <li>중복 URL은 자동으로 제거됩니다</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
          >
            취소
          </button>
          <button
            onClick={handleImport}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 font-bold flex items-center gap-2 shadow-sm"
          >
            <span>➕</span>
            추가하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default RssBulkImportModal;
