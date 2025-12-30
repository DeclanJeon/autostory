import React, { useEffect, useState } from "react";
import { DownloadCloud, AlertTriangle, Loader2 } from "lucide-react";

interface DownloadProgress {
  total: number;
  current: number;
  percent: number;
  status: string;
}

const BrowserDownloadModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    const removeStart = window.electronAPI.onBrowserDownloadStart?.(() => {
      setIsOpen(true);
      setError(null);
    });

    const removeProgress = window.electronAPI.onBrowserDownloadProgress?.(
      (_event, data) => {
        setProgress(data);
      }
    );

    const removeComplete = window.electronAPI.onBrowserDownloadComplete?.(
      () => {
        setTimeout(() => {
          setIsOpen(false);
          setProgress(null);
        }, 1000);
      }
    );

    const removeError = window.electronAPI.onBrowserDownloadError?.(
      (_event, msg) => {
        setError(msg);
      }
    );

    return () => {
      removeStart?.();
      removeProgress?.();
      removeComplete?.();
      removeError?.();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] backdrop-blur-md p-4">
      <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-700 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"></div>

        <h2 className="text-xl font-bold mb-4 text-white flex items-center justify-center gap-3">
          <DownloadCloud className="text-blue-500" size={24} />
          System Initialization
        </h2>

        {error ? (
          <div className="bg-red-900/20 border border-red-800 p-4 rounded-xl mt-4 text-left">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-500 mt-1" size={20} />
              <div>
                <p className="font-bold text-red-400 text-sm">
                  Installation Failed
                </p>
                <p className="text-xs text-red-300/80 mt-1 break-words leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 w-full py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-red-900/20 text-red-400 font-bold transition text-xs uppercase tracking-wider"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-slate-400 mb-8 text-sm leading-relaxed">
              Downloading browser engine for automation.
              <br />
              <span className="text-xs text-slate-500">
                This happens only once. Please do not close the app.
              </span>
            </p>

            <div className="relative w-full bg-slate-800 rounded-full h-3 mb-3 overflow-hidden border border-slate-700">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_#2563eb]"
                style={{ width: `${progress?.percent || 0}%` }}
              ></div>
            </div>

            <div className="flex justify-between items-center text-xs text-slate-500 font-mono">
              <span className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin text-blue-500" />
                {progress?.status || "Preparing..."}
              </span>
              <span className="font-bold text-white">
                {progress?.percent || 0}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowserDownloadModal;
