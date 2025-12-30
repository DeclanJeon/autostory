import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs-extra";
import store from "../config/store";
import { logger, aiLogger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import { localAiService } from "./LocalAiService";
import { FileManager } from "./FileManager";
import {
  TemplateManager,
  ExtendedTemplate,
  AutoSelectResult,
} from "./TemplateManager";
import { FIXED_CATEGORIES, CATEGORY_PROMPT_LIST } from "../config/categories";
import { secureConfig } from "./SecureConfigService";

/**
 * [NEW] 블로그 글 구조화 규칙 - 모든 프롬프트에 적용
 */
const BLOG_STRUCTURE_RULES = `
## 📐 필수 레이아웃 규칙 (반드시 준수)

### 1. 글 구조 (5단계)
1. **헤드라인 요약**: 전체 글을 한 문장으로 요약하여 최상단 배치
2. **목차**: H2 섹션 기준 2-5개 나열
3. **서론**: 문제 제기 + 글의 목적 (2-3 단락)
4. **본론**: 각 H2 섹션마다 2-4개 단락, 단락당 3-5 문장
5. **결론**: 핵심 요약 표 + 독자 행동 유도(CTA)

### 2. 단락 규칙 (가독성 핵심)
- 한 단락은 **3-5 문장**으로 구성
- **4문장 이상 연속 시 반드시 빈 줄로 단락 분리**
- 문장이 40자 이상이면 적절히 끊어서 가독성 확보
- 각 단락 사이에 충분한 여백 유지

### 3. 헤딩(제목) 규칙
- ❌ **금지**: "서론", "본론", "결론", "1. 서론", "2. 본론" 같은 기계적인 제목 절대 사용 금지
- ✅ **권장**: 내용을 요약하는 매력적이고 구체적인 소제목 사용 (예: "왜 지금 시작해야 할까?", "3가지 핵심 전략")

### 4. 강조 및 폰트 규칙
- **핵심 키워드**: <strong> 태그 사용 (자동으로 1.2배 크기, 빨간색)
- **소제목(H2)**: 1.7배 크기, 굵은 폰트, 하단 보더
- **소소제목(H3)**: 1.3배 크기, 좌측 보라색 보더
- 중요 수치나 통계는 강조 처리

### 5. 정보성 글의 결론 (표 필수)
<table style="width:100%; border-collapse:collapse; margin:30px 0;">
  <tr style="background:#f8f9fa;">
    <th style="padding:12px; border:1px solid #ddd; text-align:left;">항목</th>
    <th style="padding:12px; border:1px solid #ddd; text-align:left;">내용</th>
  </tr>
  <tr>
    <td style="padding:12px; border:1px solid #ddd;">핵심 요약</td>
    <td style="padding:12px; border:1px solid #ddd;">...</td>
  </tr>
</table>

### 6. HTML 출력 형식 (절대 규칙)
✅ 반드시 사용: <p>, <h2>, <h3>, <strong>, <table>, <ul>, <li>, <blockquote>
❌ 절대 금지: 마크다운 문법 (##, **, *, -, |---|)
- 모든 텍스트는 <p> 태그로 감싸기
- 섹션 간 margin: 40px 0 여백 유지
`;

/**
 * [NEW] 헤드라인 요약 박스 HTML 템플릿
 */
const HEADLINE_BOX_TEMPLATE = `
<div style="border-left: 5px solid #6c5ce7; padding: 20px 25px; margin-bottom: 50px; background: linear-gradient(to right, #f8f9ff, #ffffff);">
  <p style="margin: 0; font-size: 1.3em; color: #2d3436; font-weight: 600; line-height: 1.6; font-style: italic;">
    💡 {{summary}}
  </p>
</div>
`;

/**
 * [NEW] 핵심 포인트 박스 HTML 템플릿
 */
const KEY_POINT_BOX_TEMPLATE = `
<div style="margin: 40px 0; padding: 25px; border: 2px solid #6c5ce7; border-radius: 12px;">
  <p style="margin: 0; font-size: 1.15em; font-weight: 700; color: #6c5ce7;">💡 핵심 포인트</p>
  <p style="margin: 10px 0 0 0; font-size: 1.05em; color: #2d3436; line-height: 1.7;">{{content}}</p>
</div>
`;

/**
 * [NEW] 출처 섹션 HTML 템플릿 (가시성 강화)
 */
const REFERENCE_BOX_TEMPLATE = `
<div class="reference-section" style="margin-top: 50px; padding: 20px; background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; font-family: sans-serif;">
  <h3 style="margin: 0 0 12px 0; font-size: 1.1em; font-weight: 700; color: #343a40; border-left: 4px solid #6c5ce7; padding-left: 10px;">📚 출처 및 참고자료</h3>
  <ul style="list-style: none; padding: 0; margin: 0;">
    {{LINKS}}
  </ul>
</div>
`;

/**
 * [NEW] AI에게 출처 작성 금지 지시
 */
const NO_REF_INSTRUCTION = `
[중요 제약사항]
1. 본문 내에 '참고자료', '출처', 'Reference' 섹션을 절대 직접 작성하지 마세요. (시스템이 자동으로 추가합니다)
2. 오직 본문 내용 작성에만 집중하세요.
`;

/**
 * [FIXED] 제목 생성 절대 규칙 - 예시 제거 및 후킹 강조
 */
const TITLE_CONSTRAINT = `
[제목(title) 작성 절대 규칙]
1. 분석한 **본문 내용을 관통하는 가장 매력적이고 자극적인(Click-bait) 제목**을 작성하세요.
2. "제목:", "Title:", "**", 따옴표("), 마크다운(#) 등 불필요한 기호를 절대 포함하지 마세요.
3. 예시 텍스트를 그대로 베끼지 말고, **반드시 입력된 글감을 바탕으로 새로 창작하세요.**
4. 제목은 30자 이내로 간결하게 작성하세요.
5. 나쁜 예: "맛있는 사과", "제목 없음", "블로그 글"
6. 좋은 예: "연봉 1억 개발자가 되는 3가지 비밀", "지금 당장 애플 주식을 사야 하는 이유"
`;

/**
 * AI 서비스 클래스
 * 콘텐츠 생성, 템플릿 최적화, 자동 매칭 등 담당
 */
export class AiService {
  private templateManager: TemplateManager;

  constructor() {
    this.templateManager = new TemplateManager();
  }

  // ============================================================
  // [UPGRADED] 제목 정제 헬퍼 메서드 (강화됨)
  // ============================================================

  /**
   * [UPGRADED] 제목 정제 헬퍼 함수
   * AI가 뱉어내는 온갖 잡다한 기호와 형식을 강력하게 세탁합니다.
   * @param rawTitle 원본 제목 문자열
   * @returns 정제된 제목
   */
  private cleanTitle(rawTitle: string): string {
    if (!rawTitle) return "제목 없음";

    let title = rawTitle;

    // 1. 접두어/접미어 제거 (Title:, 제목:, Subject: 등)
    // 예: "**Title: 멋진 제목**" -> "멋진 제목"
    title = title
      .replace(/^(Title|제목|Subject|Headline)\s*[:\-]\s*/i, "") // 영문/한글 접두어 제거
      .replace(/^["']|["']$/g, "") // 앞뒤 따옴표 제거
      .replace(/^\*\*|\*\*$/g, "") // 앞뒤 볼드 마크다운 제거
      .replace(/^\[|\]$/g, ""); // 앞뒤 대괄호 제거

    // 2. HTML 태그 제거
    title = title.replace(/<[^>]*>/g, "");

    // 3. 마크다운 문법 제거 (본문 중간에 섞인 것들)
    title = title
      .replace(/\*\*/g, "") // 중간 볼드
      .replace(/__/g, "") // 중간 이탤릭
      .replace(/^#+\s*/, "") // 헤딩 샵(#)
      .replace(/`{1,3}/g, ""); // 코드 블록

    // 4. 따옴표 및 특수문자 정리
    title = title
      .replace(/^["']|["']$/g, "") // 앞뒤 따옴표
      .replace(/"/g, '"')
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/\\n/g, " ") // 줄바꿈을 공백으로
      .trim();

    // 5. DOCTYPE이나 HTML 코드가 제목으로 들어간 경우 방지
    if (
      /^<!DOCTYPE/i.test(title) ||
      /^<html/i.test(title) ||
      title.length > 100
    ) {
      // 제목이라기엔 너무 길거나 코드로 의심되면 빈 문자열 반환 (이후 로직에서 본문 추출 시도)
      return "";
    }

    return title;
  }

  // ============================================================
  // [신규] 소제목 관련 유틸리티 메서드
  // ============================================================

  /**
   * 콘텐츠에서 소제목(Subtitle)을 추출하는 함수
   * 우선순위: H2 태그 > H3 태그 > Strong 태그 > 첫 문장 키워드 > AI 제목 > 폴백
   *
   * @param content - HTML 또는 텍스트 콘텐츠
   * @param aiGeneratedTitle - AI가 생성한 제목 (폴백용)
   * @returns 추출된 소제목 (최대 20자)
   */
  private extractSubtitleFromContent(
    content: string,
    aiGeneratedTitle: string
  ): string {
    // 전략 1: HTML H2 태그에서 첫 번째 소제목 추출
    const h2Match = content.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    if (h2Match && h2Match[1]) {
      const rawSubtitle = h2Match[1]
        .replace(/<[^>]*>/g, "")
        .replace(/^\d+\.\s*/, "")
        .replace(/^\s*[-–—]\s*/, "")
        .trim();

      if (rawSubtitle.length >= 2 && rawSubtitle.length <= 40) {
        const subtitle = this.sanitizeSubtitle(rawSubtitle);
        logger.info(`H2 태그에서 소제목 추출: "${subtitle}"`);
        return subtitle;
      }
    }

    // 전략 2: 마크다운 ## 헤딩에서 추출
    const mdH2Match = content.match(/^##\s+(.+)$/m);
    if (mdH2Match && mdH2Match[1]) {
      const rawSubtitle = mdH2Match[1].replace(/^\d+\.\s*/, "").trim();

      if (rawSubtitle.length >= 2 && rawSubtitle.length <= 40) {
        const subtitle = this.sanitizeSubtitle(rawSubtitle);
        logger.info(`마크다운 H2에서 소제목 추출: "${subtitle}"`);
        return subtitle;
      }
    }

    // 전략 3: H3 태그에서 추출
    const h3Match = content.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    if (h3Match && h3Match[1]) {
      const rawSubtitle = h3Match[1]
        .replace(/<[^>]*>/g, "")
        .replace(/^\d+\.\s*/, "")
        .trim();

      if (rawSubtitle.length >= 2 && rawSubtitle.length <= 40) {
        const subtitle = this.sanitizeSubtitle(rawSubtitle);
        logger.info(`H3 태그에서 소제목 추출: "${subtitle}"`);
        return subtitle;
      }
    }

    // 전략 4: 첫 번째 <strong> 또는 <b> 태그 내용
    const strongMatch = content.match(
      /<(?:strong|b)[^>]*>([^<]+)<\/(?:strong|b)>/i
    );
    if (strongMatch && strongMatch[1]) {
      const rawSubtitle = strongMatch[1].trim();
      if (rawSubtitle.length >= 3 && rawSubtitle.length <= 30) {
        const subtitle = this.sanitizeSubtitle(rawSubtitle);
        logger.info(`Strong 태그에서 소제목 추출: "${subtitle}"`);
        return subtitle;
      }
    }

    // 전략 5: 첫 문장에서 핵심 키워드 추출
    const plainText = content
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const firstSentence = plainText.match(/^[^.!?]{10,100}[.!?]/);
    if (firstSentence) {
      const keywords = this.extractKeywordsFromSentence(firstSentence[0]);
      if (keywords && keywords.length >= 2) {
        logger.info(`첫 문장 키워드에서 소제목 추출: "${keywords}"`);
        return this.sanitizeSubtitle(keywords);
      }
    }

    // 전략 6: AI 생성 제목에서 핵심 부분 추출
    if (aiGeneratedTitle && aiGeneratedTitle.length > 0) {
      const cleaned = aiGeneratedTitle
        .replace(/\d+편/g, "")
        .replace(/[[\](){}""'']/g, "")
        .replace(/^\s*[-–—:]\s*/, "")
        .trim();

      if (cleaned.length >= 2) {
        const subtitle = this.sanitizeSubtitle(cleaned);
        logger.info(`AI 제목에서 소제목 추출: "${subtitle}"`);
        return subtitle;
      }
    }

    // 최종 폴백
    logger.warn("소제목 추출 실패, 기본값 사용");
    return "본문 내용";
  }

  /**
   * 문장에서 핵심 키워드 추출 (불용어 제거)
   * @param sentence - 분석할 문장
   * @returns 핵심 키워드 조합 또는 null
   */
  private extractKeywordsFromSentence(sentence: string): string | null {
    const stopWords = new Set([
      // 한국어 불용어
      "이",
      "그",
      "저",
      "것",
      "를",
      "을",
      "에",
      "의",
      "가",
      "은",
      "는",
      "으로",
      "에서",
      "하는",
      "있는",
      "없는",
      "된",
      "되는",
      "한",
      "할",
      "수",
      "및",
      "또한",
      "그리고",
      "하지만",
      "그러나",
      "따라서",
      "대한",
      "위한",
      "통한",
      "있다",
      "없다",
      "이다",
      // 영어 불용어
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "this",
      "that",
      "these",
      "those",
      "it",
      "its",
    ]);

    const words = sentence
      .replace(/[^\w\uac00-\ud7afa-zA-Z\s]/g, "")
      .split(/\s+/)
      .filter((word) => {
        const lower = word.toLowerCase();
        return word.length >= 2 && !stopWords.has(lower);
      });

    if (words.length >= 2) {
      return words.slice(0, 3).join(" ");
    } else if (words.length === 1 && words[0].length >= 3) {
      return words[0];
    }

    return null;
  }

  /**
   * 소제목 정제 및 길이 제한
   * @param subtitle - 원본 소제목
   * @param maxLength - 최대 길이 (기본 20자)
   * @returns 정제된 소제목
   */
  private sanitizeSubtitle(subtitle: string, maxLength: number = 20): string {
    let result = subtitle
      .replace(/[<>:"/\\|?*]/g, "") // 파일명 금지 문자 제거
      .replace(/\s+/g, " ") // 다중 공백 정리
      .trim();

    // 길이 제한
    if (result.length > maxLength) {
      const truncated = result.substring(0, maxLength);
      const lastSpace = truncated.lastIndexOf(" ");

      if (lastSpace > maxLength * 0.6) {
        result = truncated.substring(0, lastSpace).trim();
      } else {
        result = truncated.trim();
      }
    }

    return result || "본문";
  }

  /**
   * 시리즈 제목 조합 함수
   * 형식: "{기본제목} {편수}편 {소제목}"
   *
   * @param baseTitle - 사용자가 입력한 기본 제목
   * @param partNumber - 편 번호 (1부터 시작)
   * @param subtitle - 추출된 소제목
   * @returns 조합된 최종 제목
   */
  private buildSeriesTitle(
    baseTitle: string,
    partNumber: number,
    subtitle: string
  ): string {
    // 기본 제목 정제
    const cleanBase = baseTitle
      .replace(/["''""]/g, "")
      .replace(/\s+/g, " ")
      .replace(/\d+편.*$/, "") // 기존 편수 표시 제거
      .trim();

    // 소제목 정제
    const cleanSubtitle = subtitle
      .replace(/["''""]/g, "")
      .replace(/^\d+편\s*/, "") // 소제목에 편수가 있으면 제거
      .trim();

    // 최종 조합
    const finalTitle = `${cleanBase} ${partNumber}편 ${cleanSubtitle}`;

    // 파일명으로 사용 가능하도록 추가 정제
    return finalTitle
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 시리즈 생성 시 안전한 소제목 추출 래퍼
   * 모든 예외를 잡아서 폴백값 반환
   */
  private safeExtractSubtitle(
    content: string,
    aiTitle: string,
    partNumber: number
  ): string {
    try {
      const subtitle = this.extractSubtitleFromContent(content, aiTitle);

      // 유효성 검증
      if (!subtitle || subtitle.length < 2) {
        logger.warn(`[${partNumber}편] 소제목이 너무 짧음, 폴백 사용`);
        return `${partNumber}부`;
      }

      // 금지 패턴 체크
      const invalidPatterns = [
        /^\d+편$/,
        /^편$/,
        /^본문$/,
        /^undefined$/i,
        /^null$/i,
        /^내용$/,
      ];

      for (const pattern of invalidPatterns) {
        if (pattern.test(subtitle)) {
          logger.warn(
            `[${partNumber}편] 무효한 소제목 패턴, 폴백 사용: "${subtitle}"`
          );
          return `${partNumber}부 내용`;
        }
      }

      return subtitle;
    } catch (error) {
      logger.error(`[${partNumber}편] 소제목 추출 오류: ${error}`);
      return `${partNumber}부`;
    }
  }

  /**
   * 안전한 제목 조합 래퍼
   */
  private safeBuildTitle(
    baseTitle: string,
    partNumber: number,
    subtitle: string
  ): string {
    try {
      const result = this.buildSeriesTitle(baseTitle, partNumber, subtitle);

      // 최종 검증: 빈 제목 방지
      if (!result || result.trim().length < 5) {
        return `${baseTitle} ${partNumber}편`;
      }

      // 파일명 안전성 검증 (최대 100자)
      if (result.length > 100) {
        return result.substring(0, 97) + "...";
      }

      return result;
    } catch (error) {
      logger.error(`제목 조합 오류: ${error}`);
      return `${baseTitle} ${partNumber}편`;
    }
  }

  /**
   * [신규] 텍스트 청킹 (문맥 유지를 위해 단락 단위 분할)
   * @param text 전체 텍스트
   * @param chunkSize 목표 글자 수 (기본 8000자)
   */
  private chunkText(text: string, chunkSize: number = 8000): string[] {
    const chunks: string[] = [];
    let currentChunk = "";

    // 빈 줄 기준으로 단락 분리 (여러 줄바꿈 포함)
    const paragraphs = text.split(/\n\s*\n/);

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > chunkSize) {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = paragraph;
      } else {
        currentChunk += "\n\n" + paragraph;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * [수정] 파일 기반 시리즈 포스트 생성
   * 제목 형식: "{기본제목} {편수}편 {소제목}"
   */
  public async generateSeriesFromContent(
    fullText: string,
    metadata: { title: string; tags: string[]; category: string },
    progressCallback: (msg: string) => void
  ): Promise<string[]> {
    try {
      // 1. 콘텐츠 분석 및 템플릿 선택
      progressCallback("📊 콘텐츠 분석 및 최적 템플릿 선택 중...");
      const sampleText = fullText.substring(0, 3000);
      let analysisResult =
        this.templateManager.autoSelectCombination(sampleText);

      // [Adaptive Logic] 매칭 점수 낮을 경우
      if (analysisResult.matchScore < 3.0) {
        progressCallback("🔄 기본 템플릿 부적합 -> 맞춤 템플릿 생성 중...");
        logger.info(
          `템플릿 매칭 점수 낮음 (${analysisResult.matchScore}), 적응형 생성...`
        );
        const adaptiveResult = await this.generateAdaptiveTemplates(sampleText);
        if (adaptiveResult) {
          analysisResult = adaptiveResult;
        }
      }

      // [Special Logic] 특수 카테고리 처리 (기존 로직 유지)
      if (
        metadata.category === "프롬프트" ||
        metadata.tags.includes("프롬프트")
      ) {
        logger.info("특수 카테고리 감지: AI 프롬프트 공유용 템플릿 적용");
        progressCallback(
          "🎯 특수 카테고리 감지: AI 프롬프트 템플릿 적용 중..."
        );

        analysisResult = {
          matchScore: 10,
          matchReason: "Specialized Prompt Mode",
          persona: {
            id: "special-instructor",
            name: "전문 AI 강사",
            description: "프롬프트 작성법을 가르치는 전문가",
            templateType: "persona",
            tags: ["education", "prompt-engineering"],
            category: "special",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDefault: true,
            content: `당신은 'AI 프롬프트 전문가'로서 글을 작성합니다.
독자에게 친근하게 다가가되, 전문성을 잃지 않습니다.
실용적인 팁과 예시를 풍부하게 제공합니다.`,
          },
          prompt: {
            id: "special-prompt-guide",
            name: "프롬프트 가이드",
            description: "프롬프트를 추출하고 설명하는 가이드 양식",
            templateType: "prompt",
            tags: ["guide", "prompt-share"],
            category: "special",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDefault: true,
            content: `프롬프트를 실제로 활용할 수 있도록 상세히 설명합니다.
코드 블록으로 프롬프트 원문을 제공합니다.
활용 팁과 변형 방법을 안내합니다.`,
          },
        };
      }

      // 2. 텍스트 청크 분할
      const chunks = this.chunkText(fullText);
      const totalParts = chunks.length;
      const generatedFilePaths: string[] = [];
      const fileManager = new FileManager();

      progressCallback(`📚 총 ${totalParts}편으로 분할합니다.`);
      logger.info(
        `시리즈 생성 시작 - 제목: "${metadata.title}", 총 ${totalParts}편`
      );

      let previousSummary = "";

      // 3. 각 파트별 콘텐츠 생성
      for (let i = 0; i < totalParts; i++) {
        const partNum = i + 1;
        const chunk = chunks[i];

        const nextChunk = i < totalParts - 1 ? chunks[i + 1] : "";
        const nextPreview =
          nextChunk.substring(0, 300).replace(/\n/g, " ") + "...";

        progressCallback(
          `✨ [${partNum}/${totalParts}] AI 콘텐츠 생성 및 소제목 분석 중...`
        );

        // [핵심] 소제목 생성을 위한 강화된 프롬프트
        const transitionInstructions = `
[시리즈 정보]
- 시리즈명: ${metadata.title}
- 현재 편: ${partNum} / ${totalParts}

${
  partNum > 1
    ? `[이전 편 요약]\n"${previousSummary}"\n★ 자연스러운 연결: 이전 내용을 1-2문장으로 요약하며 "지난 편에서는 ~를 알아보았습니다."로 시작하세요.`
    : "★ 첫 편: 시리즈 전체 개요와 이번 편에서 다룰 핵심 내용을 소개하세요."
}

${
  partNum < totalParts
    ? `[다음 편 미리보기]\n"${nextPreview}"\n★ 끝부분에 "다음 편에서는 ~를 다루겠습니다." 형태의 예고를 포함하세요.`
    : "★ 마지막 편: 시리즈 전체를 마무리하고 핵심 인사이트를 정리하세요."
}

[이번 편 원본 콘텐츠]
${chunk}

[글 작성 지침 - 중요]
1. **소제목(subtitle)**: 이번 편의 핵심 주제를 15자 이내의 명사형으로 작성 (예: "환경 설정", "기본 문법 익히기", "실전 프로젝트")
2. **본문**: HTML 형식으로 작성하고, JSON 코드나 마크다운 문법을 절대 포함하지 마세요.
3. 편 번호나 시리즈명을 본문에 포함하지 마세요.

[출력 형식]
아래 구조를 따라 HTML로만 작성하세요:

<h2>이번 편 핵심 제목</h2>
<p>본문 내용... (최소 1500자, <h2>, <h3>, <p>, <strong> 태그 사용)</p>
        `;

        const virtualIssue = {
          title: `${metadata.title} (Part ${partNum})`,
          source: "Uploaded File",
          contentSnippet: chunk.substring(0, 200),
          link: `file://${metadata.title}`, // 파일 업로드 소재의 링크 추가
        };

        // AI 콘텐츠 생성
        const result = await this.generatePost(
          [virtualIssue],
          transitionInstructions,
          "dynamic-auto",
          analysisResult
        );

        // [핵심] 안전한 소제목 추출
        let subtitle = "";

        // 우선순위 1: AI 응답의 subtitle 필드
        if (result.subtitle && result.subtitle.trim().length >= 2) {
          subtitle = this.sanitizeSubtitle(result.subtitle.trim());
          logger.info(`[${partNum}편] AI 생성 소제목 사용: "${subtitle}"`);
        }
        // 우선순위 2: 안전한 콘텐츠 추출
        else {
          subtitle = this.safeExtractSubtitle(
            result.content,
            result.title,
            partNum
          );
          logger.info(`[${partNum}편] 콘텐츠 기반 소제목 추출: "${subtitle}"`);
        }

        // 최종 제목 조합 (안전한 래퍼 사용)
        const finalTitle = this.safeBuildTitle(
          metadata.title,
          partNum,
          subtitle
        );

        logger.info(`[${partNum}편] 최종 제목: "${finalTitle}"`);
        progressCallback(
          `📝 [${partNum}/${totalParts}] 제목 확정: ${finalTitle}`
        );

        // HTML 파일 저장
        const savedPath = await fileManager.savePost(
          metadata.category,
          finalTitle,
          result.content,
          "html"
        );

        generatedFilePaths.push(savedPath);

        // 다음 편을 위한 요약 저장
        previousSummary = result.summary || chunk.substring(0, 200) + "...";
      }

      logger.info(`시리즈 생성 완료 - 총 ${generatedFilePaths.length}개 파일`);
      progressCallback(
        `🎉 시리즈 생성 완료! 총 ${generatedFilePaths.length}편`
      );

      return generatedFilePaths;
    } catch (error) {
      logger.error(`시리즈 생성 실패: ${error}`);
      throw error;
    }
  }

  /**
   * [신규] 피드 콘텐츠 기반 최적 프롬프트/페르소나 자동 선택
   */
  public autoSelectCombination(feedContent: string): AutoSelectResult {
    return this.templateManager.autoSelectCombination(feedContent);
  }

  /**
   * [신규] 텍스트에서 이미지 검색용 키워드 추출
   * @param text 분석할 텍스트
   * @returns 추출된 키워드 (영문)
   */
  public async extractKeyword(text: string): Promise<string> {
    const settings = await secureConfig.getFullSettings();
    const apiKey = settings.aiApiKey || settings.openrouterApiKey;
    if (!apiKey) throw new Error("API Key가 없습니다.");

    const prompt = `
다음 텍스트에서 이미지 검색에 적합한 "영어 키워드" 1개만 추출하세요.
키워드만 출력하세요.

텍스트: ${text.substring(0, 300)}
    `;

    try {
      const provider = settings.aiProvider || "gemini";
      let responseText = "";

      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(settings.aiApiKey);
        const model = genAI.getGenerativeModel({
          model: settings.aiModel || "gemini-2.5-flash",
        });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
      } else {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model:
                settings.aiModel ||
                "google/gemini-2.0-flash-lite-preview-02-05:free",
              messages: [{ role: "user", content: prompt }],
            }),
          }
        );
        const data = await response.json();
        responseText = data.choices?.[0]?.message?.content || "";
      }

      if (!responseText) return "tech, business";

      // 정제 (특수문자 제거, 쉼표 기준 첫 번째 단어)
      const keyword = responseText
        .replace(/[^\w\s,]/g, "")
        .split(",")[0]
        .trim();

      return keyword || "tech";
    } catch (error) {
      logger.warn(`키워드 추출 실패: ${error}`);
      return "tech";
    }
  }

  /**
   * [NEW] 이미지를 분석하여 AI 생성용 프롬프트를 만듭니다.
   * (Gemini 1.5 Flash Vision 활용)
   */
  public async analyzeImageForPrompt(imagePath: string): Promise<string> {
    const settings = await secureConfig.getFullSettings();
    const apiKey = settings.aiApiKey;
    if (!apiKey) throw new Error("AI API Key is missing for Vision task.");

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Vision 지원 모델 사용
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const imageBuffer = await fs.readFile(imagePath);
      const imageBase64 = imageBuffer.toString("base64");

      const prompt = `
      Describe this image in English specifically for an AI image generator (like Stable Diffusion or Midjourney).
      Focus on the artistic style, subject, composition, lighting, and mood.
      Output ONLY the prompt text, no explanations.
      `;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/png",
          },
        },
      ]);

      const text = result.response.text();
      return text.trim();
    } catch (error: any) {
      logger.error(`Image Analysis Failed: ${error.message}`);
      return "A creative illustration suitable for a blog post.";
    }
  }

  /**
   * [NEW] 프롬프트를 사용하여 이미지 생성 (나노바나나 등)
   * 현재는 실제 API가 없으므로 Placehold.co 로 대체합니다.
   * 추후 실제 API 연동 시 fetch 부분을 수정하세요.
   */
  public async generateImageFromPrompt(prompt: string): Promise<string> {
    logger.info(`Generating image for prompt: ${prompt.substring(0, 50)}...`);

    // [TODO] 실제 나노바나나 API 연동 예시
    /*
    const response = await fetch("https://api.nanobanana.com/generate", {
      method: "POST",
      headers: { "Authorization": "Bearer YOUR_KEY" },
      body: JSON.stringify({ prompt: prompt, model: "anime-v3" })
    });
    const data = await response.json();
    return data.imageUrl;
    */

    // Mock 구현: 프롬프트 텍스트가 들어간 더미 이미지 URL 반환
    const encodedText = encodeURIComponent(prompt.substring(0, 20) + "...");
    return `https://placehold.co/1024x600/2d3436/ffffff/png?text=${encodedText}`;
  }

  /**
   * [신규] 콘텐츠에 맞는 프롬프트와 페르소나를 AI가 자동 생성 (적응형 생성)
   */
  public async generateAdaptiveTemplates(
    content: string
  ): Promise<AutoSelectResult | null> {
    const settings = await secureConfig.getFullSettings();
    const apiKey = settings.aiApiKey || settings.openrouterApiKey;
    if (!apiKey) return null;

    const systemPrompt = `
당신은 전문 '프롬프트 엔지니어'이자 '페르소나 설계자'입니다.
주어진 텍스트를 깊이 분석하여, 해당 글을 가장 잘 작성할 수 있는 **페르소나(Persona)**와 **프롬프트(Prompt)**를 새로 설계하세요.

[필수 요구사항]
1. 분석된 글의 톤앤매너, 주제, 타겟 독자를 정확히 반영해야 합니다.
2. 페르소나: 구체적인 배경, 말투, 글쓰기 스타일을 정의하세요.
3. 프롬프트: 글의 목표, 필수 구성요소(서론/본론/결론 등), 스타일 가이드를 정의하세요.
4. **반드시 JSON 형식으로만 출력하세요.**

[출력 JSON 스키마]
{
  "persona": {
    "name": "페르소나 이름 (예: 감성 에세이스트)",
    "description": "한줄 설명",
    "content": "페르소나 정의 (마크다운)",
    "tags": ["태그1", "태그2"],
    "category": "general"
  },
  "prompt": {
    "name": "프롬프트 이름 (예: 감성 에세이 작성)",
    "description": "한줄 설명",
    "content": "프롬프트 내용 (마크다운)",
    "tags": ["태그1", "태그2"],
    "category": "general"
  }
}
`;

    try {
      logger.info("적응형 템플릿 생성 시작...");
      const sampleText = content.substring(0, 2000); // 2000자 제한
      let responseText = "";

      const provider = settings.aiProvider || "gemini";
      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(settings.aiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent([systemPrompt, sampleText]);
        responseText = result.response.text();
      } else {
        // OpenRouter fallback
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${settings.openrouterApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.0-flash-lite-preview-02-05:free",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: sampleText },
              ],
            }),
          }
        );
        const data = await response.json();
        responseText = data.choices[0]?.message?.content || "";
      }

      // JSON 파싱
      const jsonStr = responseText.replace(/```json\s*|\s*```/g, "").trim();
      const parsed = JSON.parse(jsonStr);

      if (!parsed.persona || !parsed.prompt)
        throw new Error("Invalid JSON structure");

      // 템플릿 저장
      const newPersona = this.templateManager.addTemplate({
        ...parsed.persona,
        templateType: "persona",
        isDefault: false,
        priority: 50,
      });

      const newPrompt = this.templateManager.addTemplate({
        ...parsed.prompt,
        templateType: "prompt",
        isDefault: false,
        priority: 50,
      });

      logger.info(
        `적응형 템플릿 생성 완료: ${newPersona.name} / ${newPrompt.name}`
      );

      return {
        prompt: newPrompt,
        persona: newPersona,
        matchScore: 10, // Max score
        matchReason: "AI 적응형 생성 (Adaptive Generation)",
      };
    } catch (error) {
      logger.error(`적응형 템플릿 생성 실패: ${error}`);
      return null;
    }
  }

  public async listModels(
    apiKey: string,
    provider: string = "gemini",
    showAll: boolean = false
  ): Promise<string[]> {
    if (!apiKey) return [];

    try {
      if (provider === "openrouter") {
        return await this.listOpenRouterModels(apiKey, showAll);
      } else {
        return await this.listGeminiModels(apiKey);
      }
    } catch (error) {
      logger.error(`Model list fetch failed for ${provider}: ${error}`);
      return provider === "openrouter"
        ? []
        : ["gemini-2.5-flash", "gemini-1.5-flash"];
    }
  }

  private async listOpenRouterModels(
    apiKey: string,
    showAll: boolean = false
  ): Promise<string[]> {
    try {
      aiLogger.info(`OpenRouter 모델 목록 가져오기... (showAll: ${showAll})`);

      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://autostory-ai-writer.local",
          "X-Title": "AutoStory AI Writer",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        aiLogger.error(
          `OpenRouter API HTTP error: ${response.status} - ${errorText}`
        );
        throw new Error(
          `OpenRouter API error: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();
      const allModels = data.data || [];

      let filteredModels = allModels;

      if (!showAll) {
        filteredModels = allModels.filter((model: any) => {
          if (model.id.includes(":free")) return true;
          if (!model.pricing) return false;

          const pricing = model.pricing;
          const promptPrice = pricing.prompt;
          const completionPrice = pricing.completion;

          if (parseFloat(promptPrice) === 0) return true;
          if (parseFloat(completionPrice) === 0) return true;
          if (
            parseFloat(promptPrice) <= 0.001 &&
            parseFloat(completionPrice) <= 0.001
          )
            return true;

          return false;
        });

        const freeVariantModels = allModels.filter((model: any) => {
          if (!model.id.includes(":free")) return false;
          return !filteredModels.some((fm: any) => fm.id === model.id);
        });

        filteredModels = [...filteredModels, ...freeVariantModels];
      }

      const modelIds = filteredModels
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
        .map((model: any) => model.id);

      return modelIds;
    } catch (error) {
      aiLogger.error(`Failed to fetch OpenRouter models: ${error}`);
      throw error;
    }
  }

  private async listGeminiModels(apiKey: string): Promise<string[]> {
    try {
      aiLogger.info("Gemini 모델 목록 조회 중...");

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        aiLogger.error(
          `Gemini API HTTP error: ${response.status} - ${errorText}`
        );
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const models = data.models || [];

      const generativeModels = models
        .filter((model: any) => {
          const supportedMethods = model.supportedGenerationMethods || [];
          return (
            supportedMethods.includes("generateContent") &&
            model.name &&
            model.name.includes("gemini")
          );
        })
        .map((model: any) => {
          const name = model.name.replace("models/", "");
          return name;
        })
        .sort((a: string, b: string) => {
          const order = ["2.5", "2.0", "1.5", "1.0"];
          const getOrder = (name: string) => {
            for (let i = 0; i < order.length; i++) {
              if (name.includes(order[i])) return i;
            }
            return order.length;
          };
          return getOrder(a) - getOrder(b);
        });

      aiLogger.info(`Gemini 모델 ${generativeModels.length}개 로드 완료`);
      return generativeModels;
    } catch (error) {
      aiLogger.error(`Failed to fetch Gemini models: ${error}`);
      return [
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
      ];
    }
  }

  /**
   * [확장] 포스트 생성 - 동적 프롬프트/페르소나 지원
   * @param selectedIssues 선택된 RSS 피드 아이템들
   * @param instructions 사용자 추가 지시사항
   * @param templateId 템플릿 ID 또는 'auto-analysis-mode' 또는 'dynamic-auto'
   * @param dynamicSelection 자동 선택된 프롬프트/페르소나 조합 (옵션)
   */
  public async generatePost(
    selectedIssues: any[],
    instructions: string,
    templateId: string,
    dynamicSelection?: AutoSelectResult
  ): Promise<{
    title: string;
    content: string;
    imageKeyword?: string;
    summary?: string;
    subtitle?: string;
    usedPrompt?: string;
    usedPersona?: string;
  }> {
    const settings = await secureConfig.getFullSettings();
    const provider = settings.aiProvider || "gemini";

    // 로컬 AI 처리
    if (provider === "local") {
      return await this.generatePostWithLocalAi(
        selectedIssues,
        instructions,
        templateId
      );
    }

    let apiKey = "";
    let modelName = settings.aiModel;
    const targetLanguage = settings.targetLanguage || "Korean";

    if (provider === "openrouter") {
      apiKey = settings.openrouterApiKey || "";
      modelName = modelName || "xiaomi/mimo-v2-flash:free";
    } else {
      apiKey = settings.aiApiKey || "";
      modelName = modelName || "gemini-2.5-flash";

      if (modelName === "gemini-1.5-flash") {
        modelName = "gemini-2.5-flash";
      }
    }

    if (!apiKey)
      throw new Error(
        `${provider.toUpperCase()} API Key가 설정되지 않았습니다.`
      );

    const contextText = selectedIssues
      .map(
        (item) =>
          `- 제목: ${item.title}\n- 출처: ${item.source}\n- 요약: ${item.contentSnippet}`
      )
      .join("\n\n");

    let systemPrompt = "";
    let templateName = "";
    let usedPromptName = "";
    let usedPersonaName = "";

    // ============================================================
    // [신규] 동적 자동 모드: 프롬프트 + 페르소나 조합
    // ============================================================
    if (templateId === "dynamic-auto" && dynamicSelection) {
      const { prompt, persona } = dynamicSelection;

      usedPromptName = prompt?.name || "기본 프롬프트";
      usedPersonaName = persona?.name || "기본 페르소나";
      templateName = `${usedPersonaName} + ${usedPromptName}`;

      aiLogger.info(
        `동적 자동 모드 - 페르소나: ${usedPersonaName}, 프롬프트: ${usedPromptName}`
      );

      // 페르소나와 프롬프트 내용 결합
      const personaContent = persona?.content || "";
      const promptContent = prompt?.content || "";

      systemPrompt = `
${personaContent}

---

${promptContent}

---

${BLOG_STRUCTURE_RULES}

${NO_REF_INSTRUCTION}

${TITLE_CONSTRAINT}

# 추가 지시사항

1. **언어**: 반드시 **${targetLanguage}**로 작성하세요.
2. **콘텐츠 품질**:
   - 독창적이고 통찰력 있는 분석
   - 구체적인 사례와 데이터 포함
   - 최소 1500자 이상

3. **SEO 최적화**:
   - 제목에 핵심 키워드 포함
   - 소제목(H2, H3) 활용
   - 자연스러운 키워드 배치

4. **이미지 위치**: \`[[IMAGE: 키워드]]\` 형식으로 2-3개 배치

5. **HTML 강조 박스** (본문 중 2-3개 삽입):
<div style="margin: 40px 0; padding: 25px; border: 2px solid #6c5ce7; border-radius: 12px;">
  <p style="margin: 0; font-size: 1.15em; font-weight: 700; color: #6c5ce7;">💡 핵심 인사이트</p>
  <p style="margin: 10px 0 0 0; font-size: 1.05em; color: #2d3436; line-height: 1.7;">[핵심 내용]</p>
</div>

[중요: 금지사항]
- JSON 코드나 마크다운 문법을 본문에 절대 포함하지 마세요.
- HTML 태그만 사용하여 콘텐츠를 작성하세요.

[출력 형식]
아래 구조를 따라 HTML로만 작성하세요:

<h2>후킹한 제목</h2>
<p>전체 글 요약 (1-2문장)</p>
<p>본문 내용... (최소 1500자)</p>

[사용자 추가 지시]
${instructions}
      `;
    }
    // ============================================================
    // [기존] 자동 분석 모드 (하위 호환성 유지)
    // ============================================================
    else if (templateId === "auto-analysis-mode") {
      templateName = "자동 분석 모드";
      usedPromptName = "기본 자동 분석";
      usedPersonaName = "시스템 기본";

      systemPrompt = `
당신은 전문 블로그 콘텐츠 작성자입니다.
주어진 소재를 바탕으로 깊이 있는 분석 글을 작성하세요.

${BLOG_STRUCTURE_RULES}

${NO_REF_INSTRUCTION}

[출력 형식 - 엄격히 준수]
1. **언어**: 모든 콘텐츠를 반드시 **${targetLanguage}**로 작성하세요.
 - 제목(title), 본문(content), 요약(summary) 모두 해당 언어로 작성

2. **글 구조 필수 요소**:
 - 헤드라인 요약: **전체 글을 한 문장으로 요약하여 최상단 배치**
 - 목차: H2 기준 3-5개 섹션 나열
 - 각 섹션은 2-4개 단락으로 구성
 - 단락당 3-5문장, **4문장 이상이면 반드시 단락 분리**
 - 결론에 핵심 요약 표 포함

3. **HTML 스타일 가이드** (인라인 스타일 사용):
 - 제목(H2): font-size: 1.7em, font-weight: 800, color: #1a1a2e
 - 소제목(H3): font-size: 1.3em, font-weight: 700, border-left: 4px solid #6c5ce7
 - 강조(strong): font-size: 1.2em, font-weight: 700, color: #e63946
 - 단락(p): line-height: 2.0, margin-bottom: 24px

4. **강조 박스 HTML 템플릿** (본문 중 2-3개 삽입):
<div style="margin: 40px 0; padding: 25px; border: 2px solid #6c5ce7; border-radius: 12px;">
  <p style="margin: 0; font-size: 1.15em; font-weight: 700; color: #6c5ce7;">💡 핵심 포인트</p>
  <p style="margin: 10px 0 0 0; font-size: 1.05em; color: #2d3436; line-height: 1.7;">[핵심 내용 작성]</p>
</div>

5. **이미지 위치**: \`[[IMAGE: 키워드]]\` 형식으로 2-3개 배치

[중요: 금지사항]
- JSON 코드나 마크다운 문법을 본문에 절대 포함하지 마세요.
- HTML 태그만 사용하여 콘텐츠를 작성하세요.

[출력 형식]
아래 구조를 따라 HTML로만 작성하세요:

<h2>후킹한 제목</h2>
<p>전체 글의 핵심을 한 문장으로 요약</p>
<p>완전한 HTML 본문 (모든 스타일 인라인, 최소 1500자)</p>

[사용자 지시사항]
${instructions}
      `;
    } else {
      const templates = store.get("templates") || [];
      const selectedTemplate =
        templates.find((t) => t.id === templateId) || templates[0];
      const templateContent = selectedTemplate
        ? selectedTemplate.content
        : "No template found.";
      templateName = selectedTemplate?.name || "Unknown";

      systemPrompt = `
당신은 전문 블로그 작성자입니다.

${BLOG_STRUCTURE_RULES}

${NO_REF_INSTRUCTION}

[출력 형식 - 엄격히 준수]
1. **언어**: 모든 콘텐츠를 반드시 **${targetLanguage}**로 작성하세요.

2. **강조 박스 HTML** (본문 중 2-3개):
<div style="margin: 40px 0; padding: 25px; border: 2px solid #6c5ce7; border-radius: 12px;">
  <p style="margin: 0; font-size: 1.15em; font-weight: 700; color: #6c5ce7;">💡 핵심 인사이트</p>
  <p style="margin: 10px 0 0 0; font-size: 1.05em; color: #2d3436; line-height: 1.7;">[핵심 내용]</p>
</div>

3. **인용문 스타일** (필요시 사용):
<blockquote style="margin: 30px 0; padding: 20px 25px; border-left:4px solid #6c5ce7; font-style: italic; color: #555; font-size: 1.1em;">
  "인용 내용"
</blockquote>

4. **이미지 위치**: \`[[IMAGE: 키워드]]\` 형식으로 2-3개 배치

[중요: 금지사항]
- JSON 코드나 마크다운 문법을 본문에 절대 포함하지 마세요.
- HTML 태그만 사용하여 콘텐츠를 작성하세요.

[출력 형식]
아래 구조를 따라 HTML로만 작성하세요:

<h2>후킹한 제목</h2>
<p>한 줄 요약</p>
<p>HTML 본문 (최소 1500자, 모든 스타일 인라인)</p>

[적용할 템플릿]
${templateContent}

[사용자 지시사항]
${instructions}
      `;
    }

    aiLogger.info(
      `AI Generation Request - Model: ${modelName}, Provider: ${provider}, Template: ${templateName}`
    );

    const userPrompt = `
다음 소재들을 분석하여 매력적인 블로그 글을 작성하세요.
반드시 한국어로 작성하고, 영어 소재는 번역하세요.
**중요: 제목, 서론, 본론, 마무리를 각각 한 번씩만 작성하세요. 절대 중복하지 마세요.**

${contextText}
    `;

    try {
      let responseText = "";

      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            const result = await model.generateContent([
              systemPrompt,
              userPrompt,
            ]);
            const response = await result.response;
            responseText = response.text();
            break;
          } catch (error: any) {
            if (error.message?.includes("429") && retryCount < maxRetries - 1) {
              const waitTime = Math.pow(2, retryCount + 1) * 10000;
              aiLogger.warn(
                `API 할당량 초과, ${waitTime / 1000}초 후 재시도... (${
                  retryCount + 1
                }/${maxRetries})`
              );
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              retryCount++;
            } else {
              throw error;
            }
          }
        }
      } else if (provider === "openrouter") {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://autostory-ai-writer.local",
              "X-Title": "AutoStory AI Writer",
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.7,
              max_tokens: 4000,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = `OpenRouter API error: ${response.status} - ${
            errorData.error?.message || "Unknown error"
          }`;

          if (response.status === 404 && modelName.includes(":free")) {
            return await this.generatePostWithFallback(
              selectedIssues,
              instructions,
              templateId,
              apiKey,
              systemPrompt,
              userPrompt
            );
          }

          throw new Error(errorMessage);
        }

        const data = await response.json();
        let rawResponse = data.choices[0]?.message?.content || "";

        try {
          const jsonResponse = JSON.parse(rawResponse);
          responseText =
            typeof jsonResponse === "object"
              ? JSON.stringify(jsonResponse)
              : rawResponse;
        } catch (e) {
          responseText = rawResponse;
        }
      } else {
        throw new Error("지원하지 않는 AI 제공자입니다.");
      }

      const parseResult = this.parseAIResponse(responseText, templateName);

      // [NEW] 콘텐츠 정규화 - 마크다운 변환 및 스타일 적용
      parseResult.content = this.normalizeHtmlContent(parseResult.content);

      // [FIX] 제목 정제 로직 강화 (cleanTitle 함수 사용)
      parseResult.title = this.cleanTitle(parseResult.title);

      // [FIX] 제목이 "맛있는 사과" 또는 "제목 없음"인 경우 본문 기반 재설정
      if (
        parseResult.title === "맛있는 사과" ||
        parseResult.title === "제목 없음"
      ) {
        logger.warn("AI가 잘못된 제목을 생성하여 본문 기반으로 재설정합니다.");

        // 본문의 첫 번째 H2 태그나 첫 문장을 제목으로 사용
        const match =
          parseResult.content.match(/<h2[^>]*>(.*?)<\/h2>/) ||
          parseResult.content.match(/<p>(.*?)<\/p>/);
        if (match && match[1]) {
          parseResult.title = match[1].replace(/<[^>]*>/g, "").substring(0, 50);
        } else {
          // 소재 제목 활용
          parseResult.title = selectedIssues[0]?.title || "블로그 포스트";
        }
      }

      // [FIX] 제목이 없거나 유효하지 않을 때 본문에서 추출하는 로직 개선
      if (!parseResult.title && parseResult.content.length > 0) {
        // 본문을 줄 단위로 나누어 유효한 텍스트가 나올 때까지 탐색
        const lines = parseResult.content.split("\n");
        for (const line of lines) {
          const cleanedLine = this.cleanTitle(line); // 태그 제거된 텍스트
          // 길이가 적당하고(2자 이상), DOCTYPE이 아닌 경우 선택
          if (
            cleanedLine.length > 2 &&
            !cleanedLine.toUpperCase().startsWith("<!DOCTYPE")
          ) {
            parseResult.title = cleanedLine;
            break;
          }
        }

        // 그래도 없으면 기본값
        if (!parseResult.title) {
          parseResult.title = "제목 없음";
        }
      }

      // 중복 제거 처리
      parseResult.content = this.removeDuplicateContent(
        parseResult.content,
        parseResult.title
      );

      // [추가] 본문 내 중복 이미지 URL 제거
      parseResult.content = this.removeDuplicateImages(parseResult.content);

      if (parseResult.imageKeyword) {
        const keyword = parseResult.imageKeyword;
        const regex = new RegExp(`\\s*${keyword}\\s*$`, "i");
        parseResult.content = parseResult.content.replace(regex, "").trim();
      }

      // 요약문 추가 (상단 헤드라인 박스)
      if (parseResult.summary) {
        const summaryHtml = HEADLINE_BOX_TEMPLATE.replace(
          "{{summary}}",
          parseResult.summary
        );
        parseResult.content = summaryHtml + parseResult.content;
      }

      // ============================================================
      // [강화된 로직] 출처(Reference) 섹션 강제 주입 (가장 마지막 단계)
      // ============================================================
      if (selectedIssues && selectedIssues.length > 0) {
        let linksHtml = "";
        const uniqueLinks = new Set<string>();

        for (const issue of selectedIssues) {
          // [데이터 방어] 가능한 모든 필드에서 링크 탐색
          const rawLink =
            issue.link || issue.url || issue.originLink || issue.guid;

          if (
            rawLink &&
            typeof rawLink === "string" &&
            rawLink.startsWith("http")
          ) {
            // 중복 방지
            if (uniqueLinks.has(rawLink)) continue;
            uniqueLinks.add(rawLink);

            const sourceName = issue.source || "Web Source";
            const title = issue.title || "원문 보기";
            // 제목 길이 제한
            const displayTitle =
              title.length > 50 ? title.substring(0, 50) + "..." : title;

            linksHtml += `
    <li style="margin-bottom: 10px; display: flex; align-items: start;">
      <span style="margin-right: 8px;">🔗</span>
      <div>
        <span style="font-weight: 700; color: #495057; font-size: 0.9em; margin-right: 6px;">[${sourceName}]</span>
        <a href="${rawLink}" target="_blank" rel="noopener noreferrer" style="color: #339af0; text-decoration: none; border-bottom: 1px solid transparent; transition: all 0.2s; font-size: 0.95em;">
          ${displayTitle}
        </a>
      </div>
    </li>`;
          }
        }

        // 유효한 링크가 하나라도 있으면 본문 끝에 추가
        if (linksHtml) {
          const finalReferenceSection = REFERENCE_BOX_TEMPLATE.replace(
            "{{LINKS}}",
            linksHtml
          );

          // 본문 끝에 확실하게 붙임 (HTML 닫는 태그 앞이 아니라 문자열 끝에)
          parseResult.content =
            parseResult.content + "\n\n" + finalReferenceSection;

          logger.info(`✅ 출처 섹션 강제 주입 완료 (${uniqueLinks.size}개)`);
        } else {
          logger.warn("⚠️ 이슈는 있으나 유효한 링크(http)를 찾지 못했습니다.");
          // 디버깅을 위해 데이터 구조 로깅
          logger.debug(
            `Issue Data Sample: ${JSON.stringify(selectedIssues[0])}`
          );
        }
      }

      this.savePromptHistory({
        selectedIssues,
        instructions,
        templateId,
        templateName,
        generatedContent: {
          title: parseResult.title,
          content: parseResult.content,
        },
        usedPrompt: usedPromptName,
        usedPersona: usedPersonaName,
      });

      return {
        ...parseResult,
        usedPrompt: usedPromptName,
        usedPersona: usedPersonaName,
      };
    } catch (error) {
      aiLogger.error(`AI Generation Failed: ${error}`);
      throw error;
    }
  }

  /**
   * 중복 콘텐츠 제거
   */
  private removeDuplicateContent(content: string, title: string): string {
    const escapedTitle = this.escapeRegex(title);

    // 제목이 본문에 여러 번 등장하면 첫 번째만 남기고 제거
    const titlePattern = new RegExp(
      `(<h[12][^>]*>\\s*${escapedTitle}\\s*</h[12]>)`,
      "gi"
    );
    const titleMatches = content.match(titlePattern);

    if (titleMatches && titleMatches.length > 1) {
      // 첫 번째 제목만 남기고 나머지 제거
      let count = 0;
      content = content.replace(titlePattern, (match) => {
        count++;
        return count === 1 ? match : "";
      });
    }

    // "목차" 섹션이 여러 번 등장하면 첫 번째만 유지
    const tocPattern = /<h[23][^>]*>\s*목차\s*<\/h[23]>/gi;
    const tocMatches = content.match(tocPattern);

    if (tocMatches && tocMatches.length > 1) {
      let count = 0;
      content = content.replace(tocPattern, (match) => {
        count++;
        return count === 1 ? match : "";
      });
    }

    // 연속된 빈 줄 정리
    content = content.replace(/\n{3,}/g, "\n\n");

    // 마지막에 제목이 다시 등장하는 패턴 제거 (💡 이모지 포함 섹션 뒤)
    const endDuplicatePattern = new RegExp(
      `[^<]*</p>\\s*</div>\\s*(<h[12][^>]*>${escapedTitle})`,
      "gi"
    );
    content = content.replace(endDuplicatePattern, "$1");

    return content.trim();
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  }

  public async optimizeTemplate(currentContent: string): Promise<string> {
    const settings = await secureConfig.getFullSettings();
    const apiKey = settings.aiApiKey;
    const modelName = settings.aiModel || "gemini-2.5-flash";

    if (!apiKey) throw new Error("AI API Key가 없습니다.");

    const prompt = `
다음 블로그 템플릿을 개선해주세요.

[개선 포인트]
1. 구조를 명확하게
2. {{title}}, {{content}} 변수 유지
3. 배경색 사용 금지 (흰색 배경 블로그)
4. 강조는 기울임체 + 상하 패딩 + 보더로 처리

[현재 템플릿]
${currentContent}
    `;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      aiLogger.error(`Template Optimization Failed: ${error}`);
      throw error;
    }
  }

  /**
   * 프롬프트 히스토리 저장 (확장)
   */
  private savePromptHistory(data: {
    selectedIssues: any[];
    instructions: string;
    templateId: string;
    templateName: string;
    generatedContent: { title: string; content: string };
    usedPrompt?: string;
    usedPersona?: string;
  }): void {
    try {
      const history: any[] = (store.get("promptHistory") as any[]) || [];

      const newEntry = {
        id: uuidv4(),
        timestamp: Date.now(),
        issues: data.selectedIssues.map((issue) => ({
          title: issue.title,
          source: issue.source,
          contentSnippet: issue.contentSnippet,
        })),
        instructions: data.instructions,
        templateId: data.templateId,
        templateUsed: data.templateName,
        usedPrompt: data.usedPrompt || "기본",
        usedPersona: data.usedPersona || "기본",
        generatedContent: data.generatedContent,
      };

      const updatedHistory = [newEntry, ...history].slice(0, 100);
      store.set("promptHistory", updatedHistory);
    } catch (error) {
      aiLogger.error(`Failed to save prompt history: ${error}`);
    }
  }

  public getPromptHistory(): any[] {
    return store.get("promptHistory") || [];
  }

  public async generateTemplateFromPrompt(
    prompt: string,
    templateName: string,
    templateDescription?: string
  ): Promise<{
    id: string;
    name: string;
    content: string;
    description?: string;
  }> {
    const settings = await secureConfig.getFullSettings();
    const provider = settings.aiProvider || "gemini";
    let apiKey = "";
    let modelName = settings.aiModel;

    if (provider === "openrouter") {
      apiKey = settings.openrouterApiKey || "";
      modelName = modelName || "xiaomi/mimo-v2-flash:free";
    } else {
      apiKey = settings.aiApiKey || "";
      modelName = modelName || "gemini-2.5-flash";
    }

    if (!apiKey)
      throw new Error(
        `${provider.toUpperCase()} API Key가 설정되지 않았습니다.`
      );

    const systemPrompt = `
블로그 템플릿 전문가입니다. 한국어로 템플릿을 생성하세요.

[규칙]
1. 마크다운 형식
2. {{title}}, {{content}} 변수 사용
3. 배경색 사용 금지
4. 강조는 기울임체 + 보더로 처리

[요청]
${prompt}
    `;

    try {
      let responseText = "";

      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([systemPrompt, prompt]);
        responseText = result.response.text();
      } else {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://autostory-ai-writer.local",
              "X-Title": "AutoStory AI Writer",
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt },
              ],
              temperature: 0.7,
              max_tokens: 2000,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`OpenRouter API error: ${response.status}`);
        }

        const data = await response.json();
        responseText = data.choices[0]?.message?.content || "";
      }

      return {
        id: uuidv4(),
        name: templateName,
        content: responseText.trim(),
        description: templateDescription || "AI 생성 템플릿",
      };
    } catch (error) {
      aiLogger.error(`Template generation failed: ${error}`);
      throw error;
    }
  }

  private async generatePostWithFallback(
    selectedIssues: any[],
    instructions: string,
    templateId: string,
    apiKey: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ title: string; content: string }> {
    const fallbackModel = "xiaomi/mimo-v2-flash:free";

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://autostory-ai-writer.local",
            "X-Title": "AutoStory AI Writer",
          },
          body: JSON.stringify({
            model: fallbackModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 4000,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Fallback failed: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || "";

      let cleanedText = responseText
        .replace(/```markdown\s*\n?/g, "")
        .replace(/```\s*$/g, "")
        .trim();

      const lines = cleanedText.split("\n").filter((line) => line.trim());

      let title = "";
      let titleIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^#\s+/)) {
          title = lines[i].replace(/^#\s*/, "").trim();
          titleIndex = i;
          break;
        }
      }

      if (!title && lines.length > 0) {
        title = lines[0].trim();
        titleIndex = 0;
      }

      let content =
        titleIndex >= 0
          ? lines
              .slice(titleIndex + 1)
              .join("\n")
              .trim()
          : cleanedText;

      const templates = store.get("templates") || [];
      const selectedTemplate =
        templates.find((t) => t.id === templateId) || templates[0];

      this.savePromptHistory({
        selectedIssues,
        instructions,
        templateId,
        templateName: selectedTemplate?.name || "Unknown",
        generatedContent: { title, content },
      });

      return { title, content };
    } catch (error) {
      throw new Error(`폴백 모델 실패: ${error}`);
    }
  }

  private parseAIResponse(
    responseText: string,
    templateName: string
  ): {
    title: string;
    content: string;
    imageKeyword?: string;
    summary?: string;
    subtitle?: string;
  } {
    if (!responseText || responseText.trim().length === 0) {
      return {
        title: "제목 없음",
        content: "AI 응답이 비어있습니다.",
        imageKeyword: undefined,
        summary: undefined,
        subtitle: undefined,
      };
    }

    if (responseText.trim().length < 100) {
      return {
        title: "제목 없음",
        content: "AI 응답이 너무 짧게 생성되었습니다. 다시 시도해주세요.",
        imageKeyword: undefined,
        summary: undefined,
        subtitle: undefined,
      };
    }

    try {
      const jsonResult = this.parseCompleteJSON(responseText);
      if (jsonResult) return jsonResult;
    } catch (e) {}

    try {
      const partialJsonResult = this.parsePartialJSON(responseText);
      if (partialJsonResult) return partialJsonResult;
    } catch (e) {}

    try {
      const markdownResult = this.parseMarkdownFormat(responseText);
      if (markdownResult) return markdownResult;
    } catch (e) {}

    return this.parseTextFormat(responseText);
  }

  private parseCompleteJSON(responseText: string): {
    title: string;
    content: string;
    imageKeyword?: string;
    summary?: string;
    subtitle?: string;
  } | null {
    let cleanedText = responseText
      .replace(/```json\s*\n?/g, "")
      .replace(/```markdown\s*\n?/g, "")
      .replace(/```html\s*\n?/g, "")
      .replace(/```xml\s*\n?/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    const jsonStart = cleanedText.indexOf("{");
    const jsonEnd = cleanedText.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) return null;

    const jsonStr = cleanedText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonStr);

    if (!parsed.title || !parsed.content) return null;

    const title = String(parsed.title).trim();
    const content = String(parsed.content).trim();

    if (content.length < 100) return null;

    return {
      title,
      content,
      imageKeyword: parsed.imageKeyword
        ? String(parsed.imageKeyword).trim()
        : undefined,
      summary: parsed.summary ? String(parsed.summary).trim() : undefined,
      subtitle: parsed.subtitle ? String(parsed.subtitle).trim() : undefined,
    };
  }

  private parsePartialJSON(responseText: string): {
    title: string;
    content: string;
    imageKeyword?: string;
    summary?: string;
    subtitle?: string;
  } | null {
    let cleanedText = responseText
      .replace(/```json\s*\n?/g, "")
      .replace(/```markdown\s*\n?/g, "")
      .replace(/```html\s*\n?/g, "")
      .replace(/```xml\s*\n?/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    const jsonStart = cleanedText.indexOf("{");
    const jsonEnd = cleanedText.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) return null;

    let jsonStr = cleanedText
      .substring(jsonStart, jsonEnd + 1)
      .replace(/"/g, '"')
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.title || !parsed.content) return null;

      const title = String(parsed.title).trim();
      const content = String(parsed.content).trim();

      if (content.length < 100) return null;

      return {
        title,
        content,
        imageKeyword: parsed.imageKeyword
          ? String(parsed.imageKeyword).trim()
          : undefined,
        summary: parsed.summary ? String(parsed.summary).trim() : undefined,
        subtitle: parsed.subtitle ? String(parsed.subtitle).trim() : undefined,
      };
    } catch {
      return null;
    }
  }

  private parseMarkdownFormat(responseText: string): {
    title: string;
    content: string;
    imageKeyword?: string;
    summary?: string;
    subtitle?: string;
  } | null {
    let cleanedText = responseText;

    if (cleanedText.includes("```json")) {
      cleanedText = cleanedText.replace(/```json[\s\S]*?```/g, "");
    }

    cleanedText = cleanedText
      .replace(/"?imageKeyword"?\s*[:=]\s*["'].*?["']?,?/gi, "")
      .replace(/imageKeyword/gi, "")
      .replace(/}\s*$/g, "")
      .replace(/```markdown\s*\n?/g, "")
      .replace(/```html\s*\n?/g, "")
      .replace(/```xml\s*\n?/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    const lines = cleanedText.split("\n").filter((line) => line.trim());

    let title = "";
    let titleIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (
        line.startsWith("[[IMAGE") ||
        line.startsWith("![") ||
        line.startsWith("# [[IMAGE")
      ) {
        continue;
      }

      if (line.match(/^#\s+/)) {
        title = line.replace(/^#\s*/, "").trim();
        titleIndex = i;
        break;
      }

      if (!title && titleIndex === -1 && line.length > 0) {
        title = line.replace(/^#\s*/, "").trim();
        titleIndex = i;
        break;
      }
    }

    let content =
      titleIndex >= 0
        ? lines
            .slice(titleIndex + 1)
            .join("\n")
            .trim()
        : cleanedText;

    if (title.includes("[[IMAGE")) {
      title = "자동 생성된 글입니다.";
    }

    if (!title && !content) return null;

    const finalContent = content || cleanedText;
    if (finalContent.length < 100) return null;

    return {
      title: title || "제목 없음",
      content: finalContent,
      imageKeyword: "blog",
      summary: undefined,
      subtitle: undefined,
    };
  }

  private parseTextFormat(responseText: string): {
    title: string;
    content: string;
    imageKeyword?: string;
    summary?: string;
    subtitle?: string;
  } {
    // [Fix] HTML 문서가 통째로 반환된 경우 처리
    if (
      /^\s*<!DOCTYPE/i.test(responseText) ||
      /^\s*<html/i.test(responseText)
    ) {
      let extractedTitle = "제목 없음";

      // <title> 태그 추출 시도
      const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        extractedTitle = titleMatch[1].trim();
      } else {
        // <h1> 태그 추출 시도
        const h1Match = responseText.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match && h1Match[1]) {
          extractedTitle = h1Match[1].replace(/<[^>]+>/g, "").trim();
        }
      }

      return {
        title: extractedTitle,
        content: responseText,
        imageKeyword: undefined,
        summary: undefined,
        subtitle: undefined,
      };
    }

    const lines = responseText.split("\n").filter((line) => line.trim());
    // Remove code block markers if they appear in text format
    const cleanedLines = lines
      .map((line) => line.replace(/```(html|xml|json|markdown)?/g, "").trim())
      .filter((line) => line.length > 0);

    const title = cleanedLines[0]?.trim() || "제목 없음";
    const content = cleanedLines.slice(1).join("\n").trim() || responseText;

    return {
      title,
      content: content.length < 100 ? "AI 응답 파싱 실패" : content,
      imageKeyword: undefined,
      summary: undefined,
      subtitle: undefined,
    };
  }

  /**
   * 본문 내 중복 이미지 URL 제거
   */
  private removeDuplicateImages(content: string): string {
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const matches = [...content.matchAll(imgRegex)];

    if (matches.length <= 1) return content;

    const seenUrls = new Set<string>();
    let result = content;

    for (const match of matches) {
      const fullTag = match[0];
      const url = match[1];

      if (seenUrls.has(url)) {
        // 중복 이미지가 포함된 전체 컨테이너 div 제거
        const containerPatterns = [
          // div 컨테이너 패턴
          new RegExp(
            `<div[^>]*>\\s*<div[^>]*>\\s*${this.escapeRegex(
              fullTag
            )}\\s*</div>\\s*</div>`,
            "gi"
          ),
          // 단일 div 패턴
          new RegExp(
            `<div[^>]*>\\s*${this.escapeRegex(fullTag)}\\s*</div>`,
            "gi"
          ),
          // p 태그 패턴
          new RegExp(`<p[^>]*>\\s*${this.escapeRegex(fullTag)}\\s*</p>`, "gi"),
          // 이미지 태그만
          new RegExp(this.escapeRegex(fullTag), "gi"),
        ];

        for (const pattern of containerPatterns) {
          const beforeLength = result.length;
          result = result.replace(pattern, "");
          if (result.length < beforeLength) {
            aiLogger.info(`중복 이미지 제거: ${url.substring(0, 50)}...`);
            break;
          }
        }
      } else {
        seenUrls.add(url);
      }
    }

    // 빈 줄 정리
    result = result.replace(/\n{3,}/g, "\n\n");
    result = result.replace(/<p>\s*<\/p>/gi, "");

    return result.trim();
  }

  /**
   * 로컬 AI로 포스트 생성
   */
  private async generatePostWithLocalAi(
    selectedIssues: any[],
    instructions: string,
    templateId: string,
    dynamicSelection?: AutoSelectResult
  ): Promise<{
    title: string;
    content: string;
    imageKeyword?: string;
    subtitle?: string;
    usedPrompt?: string;
    usedPersona?: string;
  }> {
    const settings = await secureConfig.getFullSettings();
    const targetLanguage = settings.targetLanguage || "Korean";

    const contextText = selectedIssues
      .map(
        (item) =>
          `- 제목: ${item.title}\n- 출처: ${item.source}\n- 내용: ${item.contentSnippet}`
      )
      .join("\n\n");

    let systemPrompt = "";
    let templateName = "";
    let usedPromptName = "";
    let usedPersonaName = "";

    if (templateId === "dynamic-auto" && dynamicSelection) {
      const { prompt, persona } = dynamicSelection;

      usedPromptName = prompt?.name || "기본 프롬프트";
      usedPersonaName = persona?.name || "기본 페르소나";
      templateName = `${usedPersonaName} + ${usedPromptName}`;

      const personaContent = persona?.content || "";
      const promptContent = prompt?.content || "";

      systemPrompt = `${personaContent}\n\n---\n\n${promptContent}\n\n[작성 언어]: ${targetLanguage}\n[추가 지시]: ${instructions}`;
    } else if (templateId === "auto-analysis-mode") {
      templateName = "자동 분석 모드";
      usedPromptName = "기본 자동 분석";
      usedPersonaName = "시스템 기본";
      systemPrompt = `당신은 전문 블로그 작가입니다.
주어진 뉴스/이슈를 분석하여 SEO 최적화된 블로그 글을 작성하세요.

[중요: 금지사항]
- JSON 코드나 마크다운 문법을 본문에 절대 포함하지 마세요.
- HTML 태그만 사용하여 콘텐츠를 작성하세요.

[출력 형식]
아래 구조를 따라 HTML로만 작성하세요:

<h2>SEO 최적화된 제목</h2>
<p>핵심 요약 문장</p>
<p>HTML 형식의 본문 (최소 1500자)</p>

[작성 언어]: ${targetLanguage}
[추가 지시]: ${instructions}`;
    } else {
      const templates = store.get("templates") || [];
      const selectedTemplate =
        templates.find((t) => t.id === templateId) || templates[0];
      templateName = selectedTemplate?.name || "Unknown";
      usedPromptName = templateName;
      usedPersonaName = "사용자 정의";

      systemPrompt = `당신은 전문 블로그 작가입니다.
다음 템플릿을 참고하여 글을 작성하세요.

[중요: 금지사항]
- JSON 코드나 마크다운 문법을 본문에 절대 포함하지 마세요.
- HTML 태그만 사용하여 콘텐츠를 작성하세요.

[템플릿]
${selectedTemplate?.content || ""}

[출력 형식]
아래 구조를 따라 HTML로만 작성하세요:

<h2>제목</h2>
<p>HTML 본문</p>

[작성 언어]: ${targetLanguage}
[추가 지시]: ${instructions}`;
    }

    const userPrompt = `다음 이슈들을 분석하여 블로그 글을 작성해주세요:\n\n${contextText}`;

    aiLogger.info(
      `Local AI Generation - Model: ${settings.localAiModel}, Template: ${templateName}`
    );

    const result = await localAiService.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: settings.localAiModel,
        temperature: 0.7,
        maxTokens: 4096,
      }
    );

    if (!result.success || !result.content) {
      throw new Error(result.error || "로컬 AI 응답 실패");
    }

    const parseResult = this.parseAIResponse(result.content, templateName);

    this.savePromptHistory({
      selectedIssues,
      instructions,
      templateId,
      templateName,
      generatedContent: {
        title: parseResult.title,
        content: parseResult.content,
      },
      usedPrompt: usedPromptName,
      usedPersona: usedPersonaName,
    });

    return {
      ...parseResult,
      usedPrompt: usedPromptName,
      usedPersona: usedPersonaName,
    };
  }

  /**
   * [NEW] 마크다운을 HTML로 변환
   * AI가 마크다운으로 출력했을 경우 HTML로 변환
   */
  private convertMarkdownToHtml(content: string): string {
    let html = content;

    // 헤딩 변환 (## -> <h2>, ### -> <h3>)
    html = html.replace(
      /^## (.+)$/gm,
      '<h2 style="font-size:1.7em; font-weight:800; color:#1a1a2e; margin-top:60px; margin-bottom:25px; padding-bottom:15px; border-bottom:2px solid #1a1a2e;">$1</h2>'
    );
    html = html.replace(
      /^### (.+)$/gm,
      '<h3 style="font-size:1.3em; font-weight:700; color:#2d3436; margin-top:50px; margin-bottom:20px; padding-left:15px; border-left:4px solid #6c5ce7;">$1</h3>'
    );
    html = html.replace(
      /^#### (.+)$/gm,
      '<h4 style="font-size:1.15em; font-weight:600; color:#2d3436; margin-top:40px; margin-bottom:15px;">$1</h4>'
    );

    // Bold 변환 (**text** -> <strong>)
    html = html.replace(
      /\*\*([^*]+)\*\*/g,
      '<strong style="font-size:1.2em; font-weight:700; color:#e63946;">$1</strong>'
    );

    // Italic 변환 (*text* -> <em>)
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // 리스트 변환
    // 순서 없는 리스트 (* 또는 -)
    const ulPattern = /^[\*\-]\s+(.+)$/gm;
    let ulMatches = html.match(ulPattern);
    if (ulMatches) {
      let inList = false;
      const lines = html.split("\n");
      const newLines: string[] = [];

      for (const line of lines) {
        if (/^[\*\-]\s+/.test(line)) {
          if (!inList) {
            newLines.push('<ul style="margin:20px 0 30px 25px;">');
            inList = true;
          }
          const content = line.replace(/^[\*\-]\s+/, "");
          newLines.push(
            `<li style="margin-bottom:12px; line-height:1.8;">${content}</li>`
          );
        } else {
          if (inList) {
            newLines.push("</ul>");
            inList = false;
          }
          newLines.push(line);
        }
      }
      if (inList) newLines.push("</ul>");
      html = newLines.join("\n");
    }

    // 순서 있는 리스트 (1. 2. 3.)
    const olPattern = /^\d+\.\s+(.+)$/gm;
    let olMatches = html.match(olPattern);
    if (olMatches) {
      let inList = false;
      const lines = html.split("\n");
      const newLines: string[] = [];

      for (const line of lines) {
        if (/^\d+\.\s+/.test(line)) {
          if (!inList) {
            newLines.push('<ol style="margin:20px 0 30px 25px;">');
            inList = true;
          }
          const content = line.replace(/^\d+\.\s+/, "");
          newLines.push(
            `<li style="margin-bottom:12px; line-height:1.8;">${content}</li>`
          );
        } else {
          if (inList) {
            newLines.push("</ol>");
            inList = false;
          }
          newLines.push(line);
        }
      }
      if (inList) newLines.push("</ol>");
      html = newLines.join("\n");
    }

    // 인용문 변환 (> text)
    html = html.replace(
      /^>\s*(.+)$/gm,
      '<blockquote style="margin:40px 0; padding:0 0 0 25px; border-left:4px solid #6c5ce7; color:#555; font-size:1.05em; line-height:1.9; font-style:italic;">$1</blockquote>'
    );

    // 테이블 변환 (마크다운 테이블 -> HTML 테이블)
    html = this.convertMarkdownTableToHtml(html);

    // 단락 처리: 빈 줄로 구분된 텍스트를 <p> 태그로 감싸기
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return "";
        // 이미 HTML 태그로 시작하면 그대로 유지
        if (
          /^<(h[1-6]|p|div|ul|ol|li|table|blockquote|figure)/i.test(trimmed)
        ) {
          return trimmed;
        }
        // 아니면 <p> 태그로 감싸기
        return `<p style="line-height:2.0; margin-bottom:24px; font-size:17px; color:#333; letter-spacing:-0.03em; word-break:keep-all;">${trimmed.replace(
          /\n/g,
          "<br>"
        )}</p>`;
      })
      .join("\n\n");

    return html;
  }

  /**
   * [NEW] 마크다운 테이블을 HTML 테이블로 변환
   */
  private convertMarkdownTableToHtml(content: string): string {
    // 마크다운 테이블 패턴: |col1|col2| 형식
    const tablePattern = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;

    return content.replace(tablePattern, (match, headerRow, bodyRows) => {
      const headers = headerRow.split("|").filter((h: string) => h.trim());
      const rows = bodyRows
        .trim()
        .split("\n")
        .map((row: string) => row.split("|").filter((c: string) => c.trim()));

      let tableHtml =
        '<table style="width:100%; border-collapse:collapse; margin:30px 0;">\n';

      // 헤더
      tableHtml += '<tr style="background:#f8f9fa;">\n';
      headers.forEach((h: string) => {
        tableHtml += `<th style="padding:12px; border:1px solid #ddd; text-align:left; font-weight:700;">${h.trim()}</th>\n`;
      });
      tableHtml += "</tr>\n";

      // 바디
      rows.forEach((row: string[]) => {
        tableHtml += "<tr>\n";
        row.forEach((cell: string) => {
          tableHtml += `<td style="padding:12px; border:1px solid #ddd;">${cell.trim()}</td>\n`;
        });
        tableHtml += "</tr>\n";
      });

      tableHtml += "</table>";
      return tableHtml;
    });
  }

  /**
   * [NEW] 콘텐츠에 마크다운 문법이 포함되어 있는지 확인
   */
  private hasMarkdownSyntax(content: string): boolean {
    const markdownPatterns = [
      /^#{1,6}\s/m, // 헤딩
      /\*\*[^*]+\*\*/, // Bold
      /^\*\s+/m, // 리스트
      /^-\s+/m, // 리스트
      /^\d+\.\s+/m, // 순서 리스트
      /^\|.+\|$/m, // 테이블
      /^>\s+/m, // 인용
    ];

    return markdownPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * [NEW] HTML 콘텐츠 정규화 - 단락 분리 및 스타일 적용
   */
  private normalizeHtmlContent(content: string): string {
    let normalized = content;

    // 1. 마크다운이 포함되어 있으면 HTML로 변환
    if (this.hasMarkdownSyntax(normalized)) {
      aiLogger.info("마크다운 문법 감지됨, HTML로 변환 중...");
      normalized = this.convertMarkdownToHtml(normalized);
    }

    // 2. 연속된 텍스트를 단락으로 분리 (4문장 이상이면 분리)
    normalized = this.splitLongParagraphs(normalized);

    // 3. H2, H3 태그에 스타일이 없으면 추가
    normalized = normalized.replace(
      /<h2>([^<]+)<\/h2>/gi,
      '<h2 style="font-size:1.7em; font-weight:800; color:#1a1a2e; margin-top:60px; margin-bottom:25px; padding-bottom:15px; border-bottom:2px solid #1a1a2e;">$1</h2>'
    );
    normalized = normalized.replace(
      /<h3>([^<]+)<\/h3>/gi,
      '<h3 style="font-size:1.3em; font-weight:700; color:#2d3436; margin-top:50px; margin-bottom:20px; padding-left:15px; border-left:4px solid #6c5ce7;">$1</h3>'
    );

    // 4. strong 태그에 스타일 추가
    normalized = normalized.replace(
      /<strong>([^<]+)<\/strong>/gi,
      '<strong style="font-size:1.2em; font-weight:700; color:#e63946;">$1</strong>'
    );

    // 5. p 태그에 기본 스타일 추가 (스타일이 없는 경우만)
    normalized = normalized.replace(
      /<p>([^<]+)<\/p>/gi,
      '<p style="line-height:2.0; margin-bottom:24px; font-size:17px; color:#333; letter-spacing:-0.03em; word-break:keep-all;">$1</p>'
    );

    return normalized;
  }

  /**
   * [NEW] 긴 단락을 적절히 분리
   */
  private splitLongParagraphs(content: string): string {
    // <p> 태그 내의 텍스트가 너무 길면 분리
    return content.replace(
      /<p([^>]*)>([^<]{500,})<\/p>/gi,
      (match, attrs, text) => {
        // 마침표 기준으로 문장 분리
        const sentences = text.split(/([.!?。])\s*/);
        const paragraphs: string[] = [];
        let currentParagraph = "";
        let sentenceCount = 0;

        for (let i = 0; i < sentences.length; i++) {
          const part = sentences[i];
          if (!part.trim()) continue;

          currentParagraph += part;

          // 마침표/물음표/느낌표인 경우 문장 카운트 증가
          if (/[.!?。]/.test(part)) {
            sentenceCount++;
          }

          // 4문장마다 또는 200자 이상이면 단락 분리
          if (sentenceCount >= 4 || currentParagraph.length > 200) {
            paragraphs.push(`<p${attrs}>${currentParagraph.trim()}</p>`);
            currentParagraph = "";
            sentenceCount = 0;
          }
        }

        // 남은 텍스트 처리
        if (currentParagraph.trim()) {
          paragraphs.push(`<p${attrs}>${currentParagraph.trim()}</p>`);
        }

        return paragraphs.join("\n\n");
      }
    );
  }

  /**
   * [NEW] 콘텐츠 카테고리 자동 분류
   * AI로 콘텐츠를 분석하여 적절한 카테고리를 선택합니다.
   * @param content 분석할 콘텐츠
   * @returns 결정된 카테고리명
   */
  public async classifyCategory(content: string): Promise<string> {
    const settings = await secureConfig.getFullSettings();
    const provider = settings.aiProvider || "gemini";
    const targetLanguage = settings.targetLanguage || "Korean";

    // 로컬 AI 처리
    if (provider === "local") {
      return await this.classifyCategoryWithLocalAi(content);
    }

    let apiKey = "";
    let modelName = settings.aiModel;

    if (provider === "openrouter") {
      apiKey = settings.openrouterApiKey || "";
      modelName = modelName || "xiaomi/mimo-v2-flash:free";
    } else {
      apiKey = settings.aiApiKey || "";
      modelName = modelName || "gemini-2.5-flash";
    }

    if (!apiKey) {
      logger.warn("API Key 없음, 기본 카테고리 '기타·잡담' 사용");
      return "기타·잡담";
    }

    const prompt = `
다음 콘텐츠를 분석하여 가장 적절한 카테고리를 선택하세요.

[카테고리 목록 - 정확히 이 중 하나만 선택하세요]
${CATEGORY_PROMPT_LIST}

[콘텐츠]
${content.substring(0, 1000)}

[출력 형식]
가장 적절한 카테고리명 하나만 출력하세요. 다른 텍스트를 추가하지 마세요.

[작성 언어]
${targetLanguage}
`;

    try {
      let responseText = "";

      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
      } else {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://autostory-ai-writer.local",
              "X-Title": "AutoStory AI Writer",
            },
            body: JSON.stringify({
              model: modelName,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
              max_tokens: 50,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          responseText = data.choices[0]?.message?.content || "";
        }
      }

      const cleanedCategory = responseText.trim();

      // 반환된 카테고리가 목록에 있는지 확인
      if (FIXED_CATEGORIES.includes(cleanedCategory)) {
        logger.info(`AI 카테고리 결정: ${cleanedCategory}`);
        return cleanedCategory;
      }

      // 목록에 없으면 유사한 카테고리 검색
      for (const category of FIXED_CATEGORIES) {
        if (cleanedCategory.includes(category.substring(0, 2))) {
          logger.info(`유사 카테고리 매칭: ${cleanedCategory} -> ${category}`);
          return category;
        }
      }

      // 기본값 반환
      logger.warn(`카테고리 미매칭: ${cleanedCategory}, 기본값 사용`);
      return "기타·잡담";
    } catch (error) {
      aiLogger.error(`카테고리 분류 실패: ${error}`);
      return "기타·잡담";
    }
  }

  /**
   * [NEW] 스마트 SEO 태그 생성기
   * 본문을 분석하여 검색 유입 가능성이 높은 롱테일 키워드를 생성합니다.
   */
  public async generateSEOTags(
    content: string,
    targetLanguage: string = "Korean"
  ): Promise<string[]> {
    const settings = await secureConfig.getFullSettings();
    const apiKey = settings.aiApiKey || settings.openrouterApiKey;
    const modelName = settings.aiModel || "gemini-2.5-flash";

    if (!apiKey) return [];

    // 본문 요약 (토큰 절약)
    const summaryContent = content.replace(/<[^>]*>/g, " ").substring(0, 1500);

    const prompt = `
당신은 SEO(검색 엔진 최적화) 전문가입니다.
아래 블로그 글 본문을 분석하여, 검색 유입이 가장 많이 될법한 **'롱테일 키워드'** 10개를 추출하세요.

[제약 사항]
1. 단순 명사(예: '주식', '여행', '블로그')는 제외하고, 구체적인 검색 의도가 담긴 구문을 만드세요.
   - Bad: 주식, 여행, 리뷰, 블로그
   - Good: 주식 투자 전략 2025, 여름 휴가 여행지 추천, 블로그 시작부터 돈버는 법
2. 언어: 반드시 **${targetLanguage}**로 작성하세요.
3. 출력 형식: 오직 콤마(,)로 구분된 텍스트만 출력하세요. (번호 매기기, 해시태그(#) 금지)

[본문 내용]
${summaryContent}
    `;

    try {
      let tagsText = "";

      const provider = settings.aiProvider || "gemini";

      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(settings.aiApiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        tagsText = result.response.text();
      } else if (provider === "openrouter") {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${settings.openrouterApiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://autostory-ai-writer.local",
              "X-Title": "AutoStory AI Writer",
            },
            body: JSON.stringify({
              model: modelName,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
              max_tokens: 100,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          tagsText = data.choices[0]?.message?.content || "";
        }
      } else {
        throw new Error("지원하지 않는 AI 제공자입니다.");
      }

      // 결과 정제
      const tags = tagsText
        .split(",")
        .map((tag) => tag.trim().replace(/#/g, "")) // 해시태그 기호 제거
        .filter((tag) => tag.length > 0)
        .slice(0, 10); // 최대 10개

      logger.info(`Generated SEO Tags: ${tags.join(", ")}`);
      return tags;
    } catch (error) {
      logger.error(`SEO Tag Generation Failed: ${error}`);
      return [];
    }
  }

  /**
   * 로컬 AI로 카테고리 분류
   */
  private async classifyCategoryWithLocalAi(content: string): Promise<string> {
    const settings = await secureConfig.getFullSettings();
    const prompt = `
다음 콘텐츠를 분석하여 가장 적절한 카테고리를 선택하세요.

[카테고리 목록]
${CATEGORY_PROMPT_LIST}

[콘텐츠]
${content.substring(0, 1000)}

가장 적절한 카테고리명 하나만 출력하세요.
`;

    try {
      const result = await localAiService.chat(
        [{ role: "user", content: prompt }],
        {
          model: settings.localAiModel,
          temperature: 0.3,
          maxTokens: 50,
        }
      );

      if (result.success && result.content) {
        const cleanedCategory = result.content.trim();

        if (FIXED_CATEGORIES.includes(cleanedCategory)) {
          logger.info(`로컬 AI 카테고리 결정: ${cleanedCategory}`);
          return cleanedCategory;
        }

        for (const category of FIXED_CATEGORIES) {
          if (cleanedCategory.includes(category.substring(0, 2))) {
            logger.info(
              `유사 카테고리 매칭: ${cleanedCategory} -> ${category}`
            );
            return category;
          }
        }
      }

      return "기타·잡담";
    } catch (error) {
      aiLogger.error(`로컬 AI 카테고리 분류 실패: ${error}`);
      return "기타·잡담";
    }
  }
  /**
   * [신규] 이미지 분석 및 키워드 추출 (Vision API)
   * @param imagePath 이미지 파일 경로
   * @returns 이미지 설명 키워드 배열
   */
  public async analyzeImage(imagePath: string): Promise<string[]> {
    const settings = await secureConfig.getFullSettings();

    // 로컬 AI 우선 사용 (비전 기능이 있을 경우) - 현재는 Gemini만 지원 가정
    // if (settings.aiProvider === "local") ...

    if (!settings.aiApiKey && !settings.openrouterApiKey) {
      logger.warn("Image Analysis: No API Key found.");
      return [];
    }

    try {
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString("base64");
      const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

      const prompt = `
      Look at this image and generate 5-10 relevant English keywords that describe the visual content.
      Focus on objects, setting, and mood.
      Output ONLY the keywords separated by commas.
      Example: apple, fruit, red, healthy, food
      `;

      if (settings.aiProvider === "gemini") {
        const genAI = new GoogleGenerativeAI(settings.aiApiKey!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Vision supported

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
        ]);

        const text = result.response.text();
        return text
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter((k) => k.length > 0);
      }

      return [];
    } catch (error) {
      logger.error(`Image analysis failed: ${error}`);
      return [];
    }
  }
}
