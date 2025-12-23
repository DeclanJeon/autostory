import React from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  isAuthenticated: boolean;
  lastLoginTime: number | null;
  login: () => void;
  logout: () => void;
  checkAuthStatus: () => Promise<boolean>;
}

/**
 * 전역 인증 상태 관리 스토어
 * Zustand를 사용하여 경량 상태 관리 구현
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      lastLoginTime: null,

      login: () => {
        set({
          isAuthenticated: true,
          lastLoginTime: Date.now(),
        });
      },

      logout: () => {
        set({
          isAuthenticated: false,
          lastLoginTime: null,
        });
      },

      checkAuthStatus: async (): Promise<boolean> => {
        try {
          if (!window.electronAPI) {
            console.error("Electron API not available");
            return false;
          }

          // 메인 프로세스에 인증 상태 확인 요청
          const isAuth = await window.electronAPI.checkAuthStatus();

          set({
            isAuthenticated: isAuth,
            lastLoginTime: isAuth ? Date.now() : null,
          });

          return isAuth;
        } catch (error) {
          console.error("Auth status check failed:", error);
          set({
            isAuthenticated: false,
            lastLoginTime: null,
          });
          return false;
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        lastLoginTime: state.lastLoginTime,
      }),
    }
  )
);

/**
 * 인증 상태를 확인하는 커스텀 훅
 * @returns {boolean} 인증된 상태 여부
 */
export const useAuth = () => {
  const { isAuthenticated, checkAuthStatus } = useAuthStore();

  // 컴포넌트 마운트 시 인증 상태 확인
  React.useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  return isAuthenticated;
};
