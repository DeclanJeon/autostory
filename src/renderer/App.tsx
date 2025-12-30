import React, { Suspense, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ToastProvider, { useToastHelpers } from "./components/Toast";
import BrowserDownloadModal from "./components/BrowserDownloadModal";

// [OPTIMIZATION] Lazy Loading 적용 - 초기 번들 사이즈 감소
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const FeedList = React.lazy(() => import("./pages/FeedList"));
const PostList = React.lazy(() => import("./pages/PostList"));
const Templates = React.lazy(() => import("./pages/Templates"));
const Settings = React.lazy(() => import("./pages/Settings"));
const WriteConfig = React.lazy(() => import("./pages/WriteConfig"));

// 로딩 중 표시할 컴포넌트
const PageLoader = () => (
  <div className="flex items-center justify-center h-full text-slate-500">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
    Loading...
  </div>
);

/**
 * ToastBridge: Main 프로세스에서 전송하는 ui-toast 이벤트를 처리하는 컴포넌트
 */
const ToastBridge: React.FC = () => {
  const { showSuccess, showError, showWarning, showInfo } = useToastHelpers();

  useEffect(() => {
    if (!window.electronAPI?.onToast) return;

    return window.electronAPI.onToast((_event: any, payload: any) => {
      const { type, title, message } = payload || {};
      if (!type || !title) return;

      if (type === "success") showSuccess(title, message);
      else if (type === "error") showError(title, message);
      else if (type === "warning") showWarning(title, message);
      else showInfo(title, message);
    });
  }, [showSuccess, showError, showWarning, showInfo]);

  return null;
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      {/* ToastBridge: ui-toast 이벤트 리스너 */}
      <ToastBridge />
      {/* 브라우저 다운로드 모달은 최상위에 위치 */}
      <BrowserDownloadModal />
      <HashRouter>
        <Layout>
          {/* [OPTIMIZATION] Suspense로 Lazy 컴포넌트 감싸기 */}
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/feeds" element={<FeedList />} />
              <Route path="/posts" element={<PostList />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/write-config" element={<WriteConfig />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </HashRouter>
    </ToastProvider>
  );
};

export default App;
