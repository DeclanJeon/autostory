import React, { useState } from "react";
import { Link, Folder, Plus, Rocket, X, Loader2 } from "lucide-react";

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
    if (!url) return alert("URL을 입력해주세요.");
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
        setUrl("");
      } else {
        alert(`오류: ${result.error}`);
      }
    } catch (e: any) {
      alert(`실패: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddToList = async () => {
    if (!url) return alert("URL을 입력해주세요.");
    try {
      const result = await window.electronAPI.addMaterial({
        type: "link",
        value: url,
        title: url,
        category,
      });
      if (result.success) {
        alert("✅ 소재 리스트에 저장되었습니다.");
        onClose();
        setUrl("");
      } else {
        alert(`저장 실패: ${result.error}`);
      }
    } catch (e: any) {
      alert(`오류: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Link size={24} className="text-blue-500" />
            Link to Post
          </h3>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-500 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
              URL Source
            </label>
            <div className="relative">
              <Link
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-3 py-3 text-white focus:border-blue-500 outline-none"
                placeholder="https://example.com/article"
                disabled={isProcessing}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
              Category
            </label>
            <div className="relative">
              <Folder
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-3 py-3 text-white focus:border-blue-500 outline-none"
                disabled={isProcessing}
              />
            </div>
          </div>

          {isProcessing && (
            <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-900/50 rounded-lg text-blue-400 text-sm animate-pulse">
              <Loader2 size={16} className="animate-spin" />
              Processing contents with AI... (approx. 15-30s)
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold"
          >
            Cancel
          </button>

          <button
            onClick={handleAddToList}
            disabled={isProcessing}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold border border-slate-700 transition flex items-center gap-2"
          >
            <Plus size={16} /> Save for Later
          </button>

          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className={`px-6 py-2 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 transition ${
              isProcessing
                ? "bg-slate-700 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
            }`}
          >
            {isProcessing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Rocket size={16} />
            )}
            Generate Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkInputModal;
