import React, { useEffect, useState } from "react";

interface DownloadProgress {
  total: number;
  current: number;
  percent: number;
  status: string;
}

/**
 * 브라우저 다운로드 모달 컴포넌트
 *
 * 최초 앱 실행 시 필요한 브라우저 엔진을 다운로드하는 과정을
 * 사용자에게 시각적으로 보여줍니다.
 *
 * @component BrowserDownloadModal
 */
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
        // 완료 후 1초 뒤에 닫기
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
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[9999] backdrop-blur-sm">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-gray-200">
        <h2 className="text-2xl font-bold mb-2 text-slate-800 flex items-center justify-center gap-2">
          ⚙️ 초기 설정 진행 중
        </h2>

        {error ? (
          <div className="text-red-500 bg-red-50 p-4 rounded-lg mt-4">
            <p className="font-bold">설치 중 오류가 발생했습니다.</p>
            <p className="text-sm mt-2 break-keep">{error}</p>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-4 px-4 py-2 bg-white border border-red-200 rounded hover:bg-red-50 text-red-600 font-bold transition"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <p className="text-gray-600 mb-6 text-sm">
              자동화에 필요한 전용 브라우저 엔진을 다운로드하고 있습니다.
              <br />
              최초 1회만 진행되며, 인터넷 환경에 따라 시간이 소요될 수 있습니다.
            </p>

            <div className="relative w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress?.percent || 0}%` }}
              ></div>
            </div>

            <div className="flex justify-between text-xs text-gray-500 font-mono mt-2">
              <span>{progress?.status || "준비 중..."}</span>
              <span className="font-bold">{progress?.percent || 0}%</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BrowserDownloadModal;
