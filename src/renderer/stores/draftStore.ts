import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface DraftState {
  selectedIssues: any[];
  targetCategory: string; // 카테고리 설정도 기억
  setSelectedIssues: (issues: any[]) => void;
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
