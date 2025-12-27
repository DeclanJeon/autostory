import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * [수정] Issue 타입 명시 (link 필수)
 * RSS 피드 아이템 데이터 구조
 */
export interface DraftIssue {
  title: string;
  source: string;
  contentSnippet: string;
  link: string; // 이 부분이 반드시 있어야 함
  url?: string;
  originLink?: string;
  guid?: string;
  pubDate?: string;
  [key: string]: any;
}

interface DraftState {
  selectedIssues: DraftIssue[];
  targetCategory: string; // 카테고리 설정도 기억
  setSelectedIssues: (issues: DraftIssue[]) => void;
  setTargetCategory: (category: string) => void;
  clearDraft: () => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      selectedIssues: [],
      targetCategory: "IT_Tech", // 기본값

      setSelectedIssues: (issues) => set({ selectedIssues: issues }),
      setTargetCategory: (category) => set({ targetCategory: category }),

      clearDraft: () => set({ selectedIssues: [], targetCategory: "IT_Tech" }),
    }),
    {
      name: "draft-storage", // localStorage 키 이름
      storage: createJSONStorage(() => localStorage), // 명시적 스토리지 설정
    }
  )
);
