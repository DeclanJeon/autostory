import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface FeedItem {
  title: string;
  link: string;
  source: string;
  isoDate: string;
  contentSnippet: string;
  isPublished: boolean;
}

interface FeedState {
  // Data
  feeds: FeedItem[];
  lastUpdated: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchFeeds: (forceRefresh?: boolean) => Promise<void>;
}

// 캐시 유효 시간: 10분 (Renderer 기준)
const CACHE_DURATION = 10 * 60 * 1000;

export const useFeedStore = create<FeedState>()(
  persist(
    (set, get) => ({
      feeds: [],
      lastUpdated: 0,
      isLoading: false,
      error: null,

      fetchFeeds: async (forceRefresh = false) => {
        const { lastUpdated, isLoading } = get();
        const now = Date.now();

        // 이미 로딩 중이면 중복 호출 방지
        if (isLoading) return;

        // 강제 새로고침이 아니고, 캐시가 유효하면 API 호출 스킵
        if (
          !forceRefresh &&
          lastUpdated > 0 &&
          now - lastUpdated < CACHE_DURATION
        ) {
          console.log("[FeedStore] Using cached feeds from Renderer store");
          return;
        }

        if (!window.electronAPI) return;

        set({ isLoading: true, error: null });

        try {
          console.log("[FeedStore] Fetching feeds via IPC...");
          // Client-side 필터링을 위해 충분히 긴 기간(30일)의 데이터를 한 번에 가져옵니다.
          const data = await window.electronAPI.fetchFeeds({
            days: 30,
            forceRefresh,
          });

          set({
            feeds: data,
            lastUpdated: now,
            isLoading: false,
          });
        } catch (e: any) {
          console.error("Feed loading failed", e);
          set({
            error: e.message || "Failed to load feeds",
            isLoading: false,
          });
        }
      },
    }),
    {
      name: "feed-storage", // localStorage 키 이름
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        feeds: state.feeds,
        lastUpdated: state.lastUpdated,
      }),
    }
  )
);
