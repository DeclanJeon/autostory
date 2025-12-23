import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../stores/authStore";

interface AuthGuardProps {
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * 인증 가드 컴포넌트
 * 인증되지 않은 사용자의 접근을 차단하고 지정된 경로로 리디렉션
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  fallbackPath = "/settings",
}) => {
  const isAuthenticated = useAuth();
  const [isChecking, setIsChecking] = React.useState(true);

  React.useEffect(() => {
    // 인증 상태 확인이 완료되면 로딩 상태 종료
    const timer = setTimeout(() => {
      setIsChecking(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  // 인증 상태 확인 중이면 로딩 표시
  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">인증 상태를 확인하고 있습니다...</p>
        </div>
      </div>
    );
  }

  // 인증되지 않은 경우 리디렉션
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-6 bg-white rounded-lg shadow-lg max-w-md">
          <div className="text-red-500 text-5xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            로그인이 필요합니다
          </h2>
          <p className="text-gray-600 mb-6">
            이 기능을 사용하려면 먼저 티스토리에 로그인해야 합니다.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => (window.location.href = fallbackPath)}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
            >
              로그인하러 가기
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300 transition"
            >
              뒤로 가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 인증된 경우 자식 컴포넌트 렌더링
  return <>{children}</>;
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * 보호된 라우트 컴포넌트
 * 라우터에서 직접 사용할 수 있는 래퍼 컴포넌트
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallbackPath = "/settings",
}) => {
  return <AuthGuard fallbackPath={fallbackPath}>{children}</AuthGuard>;
};

export default AuthGuard;
