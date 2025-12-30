import React, { useState } from "react";
import { Radio, Plus, X, List } from "lucide-react";

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
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) return alert("RSS URL을 하나 이상 입력해주세요.");

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio size={24} className="text-blue-500" />
            Bulk Import RSS
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
              RSS Url List in Bulk
            </label>
            <div className="relative">
              <List
                size={16}
                className="absolute left-3 top-3 text-slate-500"
              />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-3 py-3 min-h-[200px] text-white focus:border-blue-500 outline-none font-mono text-sm leading-relaxed"
                placeholder={
                  "https://example.com/rss1.xml\nhttps://example.com/rss2.xml\n..."
                }
              />
            </div>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-xs text-slate-400 space-y-1">
            <p className="font-bold text-slate-300 mb-2">Usage Tips</p>
            <ul className="list-disc list-inside space-y-1 ml-1 marker:text-blue-500">
              <li>Enter one RSS URL per line</li>
              <li>Must start with http:// or https://</li>
              <li>Empty lines are ignored</li>
              <li>Duplicates will be automatically removed</li>
            </ul>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-500 hover:to-indigo-500 font-bold flex items-center gap-2 shadow-lg transition"
          >
            <Plus size={16} />
            Add to Feed
          </button>
        </div>
      </div>
    </div>
  );
};

export default RssBulkImportModal;
