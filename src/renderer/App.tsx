import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import FeedList from "./pages/FeedList";
import Settings from "./pages/Settings";
import WriteConfig from "./pages/WriteConfig";
import PostList from "./pages/PostList";
import Templates from "./pages/Templates";
import { ProtectedRoute } from "./components/AuthGuard";
import ToastProvider from "./components/Toast";

const App: React.FC = () => {
  return (
    <ToastProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/feeds" element={<FeedList />} />
            <Route path="/posts" element={<PostList />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/settings" element={<Settings />} />
            {/* [수정됨] ProtectedRoute 제거: 글 생성 설정은 로그인 없이도 접근 가능해야 함 */}
            <Route path="/write-config" element={<WriteConfig />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </ToastProvider>
  );
};

export default App;
