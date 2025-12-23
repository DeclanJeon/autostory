import store, { migrateTemplates } from "../config/store";
import { v4 as uuidv4 } from "uuid";

/**
 * 템플릿 타입 정의
 */
type TemplateType = "layout" | "prompt" | "persona";
type TemplateCategory =
  | "tech"
  | "business"
  | "lifestyle"
  | "news"
  | "tutorial"
  | "review"
  | "general"
  | "special";
type WritingTone =
  | "formal"
  | "casual"
  | "humorous"
  | "analytical"
  | "enthusiastic"
  | "professional"
  | "friendly";

/**
 * 확장된 템플릿 인터페이스
 */
export interface ExtendedTemplate {
  id: string;
  name: string;
  content: string;
  description: string;
  templateType: TemplateType;
  category?: TemplateCategory;
  tags?: string[];
  tone?: WritingTone;
  isDefault?: boolean;
  priority?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 기존 Template 인터페이스 (하위 호환성)
 */
export interface Template {
  id: string;
  name: string;
  content: string;
  description?: string;
}

/**
 * 자동 선택 결과 인터페이스
 */
export interface AutoSelectResult {
  prompt: ExtendedTemplate | null;
  persona: ExtendedTemplate | null;
  matchScore: number;
  matchReason: string;
}

/**
 * TemplateManager 클래스
 * 템플릿, 프롬프트, 페르소나 관리를 담당
 */
export class TemplateManager {
  constructor() {
    // 앱 시작 시 마이그레이션 실행
    migrateTemplates();
  }

  /**
   * 모든 템플릿 조회 (하위 호환성 유지)
   */
  public getAllTemplates(): ExtendedTemplate[] {
    return store.get("templates") || [];
  }

  /**
   * 타입별 템플릿 조회
   */
  public getTemplatesByType(type: TemplateType): ExtendedTemplate[] {
    const templates = this.getAllTemplates();
    return templates
      .filter((t) => t.templateType === type)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 프롬프트만 조회
   */
  public getPrompts(): ExtendedTemplate[] {
    return this.getTemplatesByType("prompt");
  }

  /**
   * 페르소나만 조회
   */
  public getPersonas(): ExtendedTemplate[] {
    return this.getTemplatesByType("persona");
  }

  /**
   * 레이아웃만 조회
   */
  public getLayouts(): ExtendedTemplate[] {
    return this.getTemplatesByType("layout");
  }

  /**
   * ID로 템플릿 조회
   */
  public getTemplate(id: string): ExtendedTemplate | undefined {
    const templates = this.getAllTemplates();
    return templates.find((t) => t.id === id);
  }

  /**
   * 템플릿 추가
   */
  public addTemplate(template: Omit<ExtendedTemplate, "id">): ExtendedTemplate {
    const templates = this.getAllTemplates();
    const newTemplate: ExtendedTemplate = {
      ...template,
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    store.set("templates", [...templates, newTemplate]);
    return newTemplate;
  }

  /**
   * 템플릿 수정
   */
  public updateTemplate(
    id: string,
    updates: Partial<Omit<ExtendedTemplate, "id">>
  ): boolean {
    const templates = this.getAllTemplates();
    const index = templates.findIndex((t) => t.id === id);
    if (index === -1) return false;

    templates[index] = {
      ...templates[index],
      ...updates,
      updatedAt: Date.now(),
    };
    store.set("templates", templates);
    return true;
  }

  /**
   * 템플릿 삭제
   */
  public deleteTemplate(id: string): boolean {
    const templates = this.getAllTemplates();
    const template = templates.find((t) => t.id === id);

    // 기본 템플릿은 삭제 불가
    if (template?.isDefault) {
      console.warn("Cannot delete default template");
      return false;
    }

    const newTemplates = templates.filter((t) => t.id !== id);
    if (templates.length === newTemplates.length) return false;

    store.set("templates", newTemplates);
    return true;
  }

  /**
   * 피드 콘텐츠 기반 최적 프롬프트/페르소나 자동 선택
   * @param feedContent RSS 피드 제목 + 내용
   */
  public autoSelectCombination(feedContent: string): AutoSelectResult {
    const prompts = this.getPrompts();
    const personas = this.getPersonas();

    if (prompts.length === 0 || personas.length === 0) {
      return {
        prompt: prompts[0] || null,
        persona: personas[0] || null,
        matchScore: 0,
        matchReason: "기본 선택 (프롬프트 또는 페르소나 없음)",
      };
    }

    const contentLower = feedContent.toLowerCase();
    const contentWords = this.extractKeywords(contentLower);

    // 프롬프트 점수 계산
    const promptScores = prompts.map((prompt) => ({
      template: prompt,
      score: this.calculateMatchScore(prompt, contentWords, contentLower),
    }));

    // 페르소나 점수 계산
    const personaScores = personas.map((persona) => ({
      template: persona,
      score: this.calculateMatchScore(persona, contentWords, contentLower),
    }));

    // 정렬 (점수 높은 순, 동점이면 priority 높은 순)
    promptScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.template.priority || 0) - (a.template.priority || 0);
    });

    personaScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.template.priority || 0) - (a.template.priority || 0);
    });

    // 상위 점수 중 랜덤 선택 (다양성 확보)
    const topPrompts = promptScores.filter(
      (p) => p.score >= promptScores[0].score * 0.8
    );
    const topPersonas = personaScores.filter(
      (p) => p.score >= personaScores[0].score * 0.8
    );

    const selectedPrompt =
      topPrompts[Math.floor(Math.random() * topPrompts.length)];
    const selectedPersona =
      topPersonas[Math.floor(Math.random() * topPersonas.length)];

    const totalScore = selectedPrompt.score + selectedPersona.score;
    const matchReason = this.generateMatchReason(
      selectedPrompt.template,
      selectedPersona.template,
      contentWords
    );

    return {
      prompt: selectedPrompt.template,
      persona: selectedPersona.template,
      matchScore: totalScore,
      matchReason,
    };
  }

  /**
   * 키워드 추출
   */
  private extractKeywords(text: string): string[] {
    // 한글, 영어, 숫자만 추출
    const words = text
      .replace(/[^\w\uac00-\ud7af\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    return [...new Set(words)];
  }

  /**
   * 매칭 점수 계산
   */
  private calculateMatchScore(
    template: ExtendedTemplate,
    contentWords: string[],
    contentLower: string
  ): number {
    let score = 0;

    // 태그 매칭 (가중치 3)
    if (template.tags) {
      for (const tag of template.tags) {
        if (contentLower.includes(tag.toLowerCase())) {
          score += 3;
        }
        // 부분 매칭
        for (const word of contentWords) {
          if (
            tag.toLowerCase().includes(word) ||
            word.includes(tag.toLowerCase())
          ) {
            score += 1;
          }
        }
      }
    }

    // 카테고리 매칭 (가중치 2)
    if (template.category) {
      const categoryKeywords: Record<string, string[]> = {
        tech: [
          "기술",
          "테크",
          "it",
          "개발",
          "소프트웨어",
          "ai",
          "인공지능",
          "클라우드",
        ],
        business: ["비즈니스", "스타트업", "투자", "시장", "경영", "전략"],
        lifestyle: ["라이프", "생활", "여행", "취미", "일상"],
        news: ["뉴스", "속보", "발표", "출시", "업데이트"],
        tutorial: ["튜토리얼", "가이드", "방법", "팁", "하는법"],
        review: ["리뷰", "후기", "비교", "추천"],
        general: [],
      };

      const keywords = categoryKeywords[template.category] || [];
      for (const keyword of keywords) {
        if (contentLower.includes(keyword)) {
          score += 2;
        }
      }
    }

    // 기본 priority 점수 (최대 1점)
    score += (template.priority || 0) / 100;

    return score;
  }

  /**
   * 매칭 이유 생성
   */
  private generateMatchReason(
    prompt: ExtendedTemplate,
    persona: ExtendedTemplate,
    contentWords: string[]
  ): string {
    const matchedPromptTags = (prompt.tags || []).filter((tag) =>
      contentWords.some(
        (word) =>
          tag.toLowerCase().includes(word) || word.includes(tag.toLowerCase())
      )
    );

    const matchedPersonaTags = (persona.tags || []).filter((tag) =>
      contentWords.some(
        (word) =>
          tag.toLowerCase().includes(word) || word.includes(tag.toLowerCase())
      )
    );

    const reasons: string[] = [];

    if (matchedPromptTags.length > 0) {
      reasons.push(
        `프롬프트 "${prompt.name}" 매칭: [${matchedPromptTags
          .slice(0, 3)
          .join(", ")}]`
      );
    }

    if (matchedPersonaTags.length > 0) {
      reasons.push(
        `페르소나 "${persona.name}" 매칭: [${matchedPersonaTags
          .slice(0, 3)
          .join(", ")}]`
      );
    }

    if (reasons.length === 0) {
      reasons.push("우선순위 기반 자동 선택");
    }

    return reasons.join(" | ");
  }

  /**
   * 기본 템플릿 리셋 (개발/디버그용)
   */
  public resetToDefaults(): void {
    const currentTemplates = this.getAllTemplates();

    // 사용자 정의 템플릿만 유지
    const userTemplates = currentTemplates.filter((t) => !t.isDefault);

    // 기본 템플릿 다시 추가
    migrateTemplates();

    console.log("Templates reset to defaults");
  }
}
