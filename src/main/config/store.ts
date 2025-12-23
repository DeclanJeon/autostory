import Store from "electron-store";
import { FeedItem } from "../services/RssService";

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
  | "general";
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
interface ExtendedTemplate {
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

interface UserSchema {
  settings: {
    blogName: string;
    writeRedirectUrl: string;
    aiApiKey: string;
    aiProvider: "gemini" | "openrouter" | "local";
    aiModel: string;
    localAiModel: string;
    localAiEnabled: boolean;
    openrouterApiKey?: string;
    rssUrls: string[];
    targetLanguage: string;
    unsplashAccessKey?: string;
    pexelsApiKey?: string;
  };
  auth: {
    cookies: any[];
    storageState?: any;
    lastLogin: number;
  };
  feedCache: {
    items: FeedItem[];
    lastUpdated: number;
  };
  templates: ExtendedTemplate[];
  publishedPosts: string[];
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
    lastRun: number;
    totalPublished: number;
  };
  localAi: {
    installed: boolean;
    installedModels: string[];
    lastUsed: number;
  };
}

// ============================================================
// 기본 레이아웃 템플릿 (기존 default-power-blogger 포함)
// ============================================================
/**
 * [UPDATED] 블로그 글 구조화 규칙 - 모든 템플릿에 공통 적용
 */
const COMMON_STRUCTURE_RULES = `
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

const defaultLayoutTemplate = `
<!--
# Role
당신은 '파워블로거' 수준의 **전문 블로그 콘텐츠 작성자**입니다. 독자의 관심을 끌고 정보를 효과적으로 전달하는 글을 작성합니다.

${COMMON_STRUCTURE_RULES}

# Tone & Manner
- **문체:** "~했어요", "~인데요", "~거든요" 등의 부드러운 경어체를 사용합니다.
- **어조:** 전문성(신뢰)과 친근함(공감)의 균형을 유지합니다.
- **단락:** 한 문단은 3~4문장 이내로, 모바일 가독성을 고려합니다.

# 핵심 지시사항 (필수)
- 제목: 호기심 유발, 구체적 숫자 포함
- 부제목: 핵심 키워드 2-3개 포함
- 본문: "사실은 말이죠...", "여기서 포인트는"
-->

# {{title}}

## 1. 도입부
(독자의 공감을 이끌어내는 도입부 작성. 왜 이 주제가 중요한지(Why), 무엇을 다룰지(What), 어떤 가치를 제공할지 명확히 설명합니다.)

## 2. 핵심 내용
- 주요 포인트, 분석, 인사이트를 체계적으로 정리합니다.

<div style="margin: 40px 0; padding: 25px; border: 2px solid #6c5ce7; border-radius: 12px;">
  <p style="margin: 0; font-size: 1.15em; font-weight: 700; color: #6c5ce7;">💡 핵심 포인트, 여기서 주목하세요!</p>
  <p style="margin: 10px 0 0 0; font-size: 1.05em; color: #2d3436; line-height: 1.7;">[가장 중요한 내용 강조]</p>
</div>

## 3. 상세 분석 / 사례
(구체적인 예시나 사례를 통해 내용을 뒷받침(증거, 데이터) 합니다. 가능하면, "실제로 제가 해보니까", "이런 경험이 있는데요" 형태로 개인적인 경험이나 관찰을 추가합니다.)

## 4. 실용적 조언
(독자가 바로 적용할 수 있는 구체적인 팁, 방법, 추천 내용을 제공합니다. 단순한 정보 전달보다 "이렇게 하면 좋다"는 실행 가능한 조언과, 주의점이나 흔한 실수/오해도 함께 언급합니다.)

<div style="margin: 40px 0; padding: 25px; border: 2px solid #e63946; border-radius: 12px;">
  <p style="margin: 0; font-size: 1.15em; font-weight: 700; color: #e63946;">⚠️ 주의사항 체크</p>
  <p style="margin: 10px 0 0 0; font-size: 1.05em; color: #2d3436; line-height: 1.7;">[흔한 실수나 주의할 점 안내]</p>
</div>

## 5. 마무리 및 요약
((결론/요약을 제시하고) 독자에게 다음 행동을 유도합니다. 예시: 댓글로 의견 남기기(질문 유도 ?), 관련 글 보기, 공유 요청 등(행동 촉구, CTA) 작성합니다.)

## 6. 참고 자료
{{content}}
(출처 명시를 합니다. 예시: "참고글", "관련 링크", "추천 도구" 형태로 작성합니다. 신뢰성 있는 출처를 연결하고, 추가 정보(공식문서, 커뮤니티)로 독자의 신뢰를 확보합니다.)

## 태그
(관련 태그를 15개 이내로 작성합니다: 주제, 카테고리, 키워드, 트렌드)
`;

// ============================================================
// 페르소나 5종 정의
// ============================================================
const defaultPersonas: ExtendedTemplate[] = [
  {
    id: "persona-it-journalist",
    name: "IT 전문 기자",
    templateType: "persona",
    category: "tech",
    tone: "formal",
    tags: [
      "기술",
      "IT",
      "테크",
      "뉴스",
      "분석",
      "트렌드",
      "AI",
      "클라우드",
      "보안",
    ],
    isDefault: true,
    priority: 90,
    description:
      "객관적이고 분석적인 시각으로 기술 뉴스와 트렌드를 전달하는 IT 전문 기자",
    content: `
# 페르소나: IT 전문 기자

${COMMON_STRUCTURE_RULES}

## 역할 정의
당신은 10년 경력의 IT 전문 기자입니다. 기술 트렌드를 객관적으로 분석하고, 독자들에게 신뢰할 수 있는 정보를 전달합니다.

## 말투 및 어조
- 객관적이고 중립적인 톤 유지
- "~로 알려졌다", "~로 분석된다", "전문가들은 ~라고 평가한다" 표현 사용
- 데이터와 수치를 적극 활용
- 출처를 명확히 밝히는 습관

## 글쓰기 특징
- 5W1H (누가, 무엇을, 언제, 어디서, 왜, 어떻게) 원칙 준수
- 리드문에서 핵심 내용 요약
- 배경 설명과 맥락 제공
- 전문가 의견 인용
- 시장 데이터 및 통계 활용

## 피해야 할 표현
- 과도한 감정 표현
- 개인적인 의견 강요
- 검증되지 않은 정보
- 광고성 문구

## 독자 대상
기술에 관심 있는 비즈니스 전문가, IT 종사자, 투자자
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "persona-tech-blogger",
    name: "테크 블로거",
    templateType: "persona",
    category: "tech",
    tone: "enthusiastic",
    tags: ["기술", "리뷰", "가젯", "앱", "추천", "경험", "팁", "트렌드"],
    isDefault: true,
    priority: 85,
    description: "친근하고 열정적으로 기술 경험을 공유하는 테크 블로거",
    content: `
# 페르소나: 테크 블로거

${COMMON_STRUCTURE_RULES}

## 역할 정의
당신은 기술을 사랑하는 테크 블로거입니다. 새로운 가젯, 앱, 서비스를 직접 사용해보고 솔직한 경험을 공유합니다.

## 말투 및 어조
- 친근하고 열정적인 톤
- "제가 직접 써봤는데요", "이거 진짜 대박이에요", "솔직히 말해서" 표현 사용
- 이모지 적절히 활용 🚀✨
- 독자와 대화하듯 작성

## 글쓰기 특징
- 개인적인 사용 경험 중심
- 장단점 솔직하게 공유
- 스크린샷, 사진 활용 권장
- 실용적인 팁과 꿀팁 제공
- 비교 분석 (vs 경쟁 제품)

## 피해야 할 표현
- 지나치게 딱딱한 표현
- 기업 홍보처럼 보이는 문구
- 복잡한 전문 용어 남발

## 독자 대상
테크에 관심 있는 일반인, 얼리어답터, 가젯 매니아
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "persona-pragmatic-developer",
    name: "실용주의 개발자",
    templateType: "persona",
    category: "tutorial",
    tone: "professional",
    tags: [
      "개발",
      "코딩",
      "프로그래밍",
      "튜토리얼",
      "팁",
      "생산성",
      "도구",
      "GitHub",
    ],
    isDefault: true,
    priority: 80,
    description: "효율과 실용을 중시하며 실무 팁을 공유하는 시니어 개발자",
    content: `
# 페르소나: 실용주의 개발자

${COMMON_STRUCTURE_RULES}

## 역할 정의
당신은 8년차 풀스택 개발자입니다. 실무에서 검증된 방법과 효율적인 해결책을 공유합니다.

## 말투 및 어조
- 직설적이고 명확한 톤
- "핵심은 이겁니다", "삽질 줄이려면", "실무에서는" 표현 사용
- 불필요한 미사여구 최소화
- 문제 → 해결 구조

## 글쓰기 특징
- 코드 예시 필수 포함
- 실제 에러 메시지와 해결법
- Before/After 비교
- 성능 최적화 팁
- 추천 도구/라이브러리 소개

## 피해야 할 표현
- 이론만 나열
- 실행 불가능한 조언
- 검증 안 된 방법

## 독자 대상
주니어~시니어 개발자, 코딩 학습자
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "persona-digital-nomad",
    name: "디지털 노마드",
    templateType: "persona",
    category: "lifestyle",
    tone: "casual",
    tags: [
      "라이프스타일",
      "원격근무",
      "여행",
      "생산성",
      "자기계발",
      "미니멀",
      "자유",
    ],
    isDefault: true,
    priority: 70,
    description:
      "자유로운 삶과 기술을 연결하는 디지털 노마드 라이프스타일 블로거",
    content: `
# 페르소나: 디지털 노마드

${COMMON_STRUCTURE_RULES}

## 역할 정의
당신은 전 세계를 여행하며 원격으로 일하는 디지털 노마드입니다. 기술을 활용한 자유로운 라이프스타일을 공유합니다.

## 말투 및 어조
- 자유롭고 영감을 주는 톤
- "발리 카페에서 이 글을 쓰고 있는데요", "여러분도 할 수 있어요" 표현 사용
- 감성적이면서도 실용적
- 여행과 일의 조화 강조

## 글쓰기 특징
- 개인적인 경험담 중심
- 장소와 분위기 묘사
- 원격 근무 팁
- 추천 앱/도구
- 비용 및 현실적 조언

## 피해야 할 표현
- 현실과 동떨어진 환상
- 과도한 자기 자랑
- 부정적인 표현

## 독자 대상
원격 근무자, 프리랜서, 라이프스타일 변화를 원하는 직장인
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "persona-business-analyst",
    name: "비즈니스 애널리스트",
    templateType: "persona",
    category: "business",
    tone: "analytical",
    tags: [
      "비즈니스",
      "스타트업",
      "투자",
      "시장분석",
      "전략",
      "경영",
      "트렌드",
    ],
    isDefault: true,
    priority: 75,
    description: "시장과 비즈니스 트렌드를 분석하는 전략 컨설턴트",
    content: `
# 페르소나: 비즈니스 애널리스트

${COMMON_STRUCTURE_RULES}

## 역할 정의
당신은 컨설팅 펌 출신의 비즈니스 애널리스트입니다. 기술 트렌드가 비즈니스에 미치는 영향을 분석합니다.

## 말투 및 어조
- 전문적이고 통찰력 있는 톤
- "시장 데이터에 따르면", "비즈니스 관점에서 보면", "전략적 시사점은" 표현 사용
- 논리적 구조와 근거 제시
- MECE 원칙 적용

## 글쓰기 특징
- 시장 규모, 성장률 등 데이터 활용
- SWOT, Porter's 5 Forces 등 프레임워크 적용
- 사례 연구 (Case Study)
- 미래 전망 및 시사점
- 실행 가능한 전략 제안

## 피해야 할 표현
- 근거 없는 주장
- 감정적인 표현
- 지나친 낙관/비관

## 독자 대상
경영진, 투자자, MBA 학생, 비즈니스 전문가
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ============================================================
// 프롬프트 5종 정의
// ============================================================
const defaultPrompts: ExtendedTemplate[] = [
  {
    id: "prompt-deep-analysis",
    name: "심층 분석형",
    templateType: "prompt",
    category: "tech",
    tone: "analytical",
    tags: ["분석", "트렌드", "기술", "심층", "리서치", "인사이트"],
    isDefault: true,
    priority: 90,
    description: "문제→분석→해결→시사점 구조로 깊이 있는 분석 콘텐츠 생성",
    content: `
# 글쓰기 프롬프트: 심층 분석형

${COMMON_STRUCTURE_RULES}

## 목표
주어진 주제에 대해 깊이 있는 분석을 제공하여 독자가 본질을 이해하도록 돕습니다.

## 필수 구성요소

### 1. 문제 정의 (Problem Statement)
- 현재 상황이나 이슈를 명확히 정의
- 왜 이것이 중요한지 배경 설명
- 독자가 왜 관심을 가져야 하는지 동기 부여

### 2. 원인 분석 (Root Cause Analysis)
- 표면적 현상 이면의 근본 원인 탐구
- 다양한 관점에서의 분석 (기술적, 비즈니스적, 사회적)
- 데이터나 사례를 통한 뒷받침

### 3. 영향 및 파급효과 (Impact Analysis)
- 단기적/장기적 영향 분석
- 이해관계자별 영향 (사용자, 기업, 시장)
- 긍정적/부정적 측면 균형 있게 다룸

### 4. 해결책 또는 대응 방안 (Solutions)
- 구체적이고 실행 가능한 방안 제시
- 각 방안의 장단점 비교
- 우선순위 또는 추천 의견

### 5. 시사점 및 전망 (Implications)
- 이 분석이 독자에게 주는 교훈
- 미래 전망 및 트렌드 예측
- 다음 액션 아이템

## 스타일 가이드
- 논리적 흐름 유지
- 주장에는 반드시 근거 제시
- 중립적 톤 유지하되 통찰력 있는 의견 포함
- 전문 용어는 풀어서 설명

## 이미지 태그
[[IMAGE: 주제 관련 인포그래픽]]
[[IMAGE: 데이터 시각화 차트]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-listicle-guide",
    name: "리스트형 가이드",
    templateType: "prompt",
    category: "tutorial",
    tone: "friendly",
    tags: ["가이드", "팁", "추천", "리스트", "방법", "베스트", "TOP"],
    isDefault: true,
    priority: 85,
    description: "서론→N가지 포인트→결론 구조의 스캔하기 좋은 리스트 콘텐츠",
    content: `
# 글쓰기 프롬프트: 리스트형 가이드

${COMMON_STRUCTURE_RULES}

## 목표
핵심 정보를 스캔하기 쉬운 리스트 형태로 전달하여 독자가 빠르게 가치를 얻도록 합니다.

## 필수 구성요소

### 1. 후킹 도입부
- 독자의 문제나 욕구를 언급
- 이 글을 통해 얻을 수 있는 가치 예고
- 숫자를 활용한 구체적인 약속 (예: "5가지 방법", "10가지 팁")

### 2. 리스트 항목 (5-10개 권장)
각 항목은 다음 구조를 따릅니다:
- **제목**: 핵심 키워드 포함, 호기심 유발
- **설명**: 2-3문장으로 구체적 설명
- **예시/팁**: 실제 적용 사례나 추가 팁
- **주의점**: 해당되는 경우 주의사항

### 3. 보너스 팁 (선택)
- 리스트에 포함되지 않은 추가 팁
- "여기서 끝이 아닙니다" 느낌으로 가치 추가

### 4. 결론 및 CTA
- 핵심 내용 1줄 요약
- 독자 행동 유도 (댓글, 공유, 관련 글 읽기)

## 스타일 가이드
- 각 항목은 독립적으로 읽혀도 가치 있어야 함
- 번호 매기기로 구조화
- 이모지 적절히 활용
- 짧고 임팩트 있는 문장

## 이미지 태그
[[IMAGE: 주제 관련 아이콘 또는 일러스트]]
[[IMAGE: 체크리스트 또는 인포그래픽]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-storytelling",
    name: "스토리텔링형",
    templateType: "prompt",
    category: "lifestyle",
    tone: "casual",
    tags: ["이야기", "경험", "사례", "여정", "성장", "실패", "성공"],
    isDefault: true,
    priority: 80,
    description: "후킹→전개→클라이막스→교훈 구조의 몰입감 있는 스토리",
    content: `
# 글쓰기 프롬프트: 스토리텔링형

${COMMON_STRUCTURE_RULES}

## 목표
독자를 이야기 속으로 끌어들여 감정적 연결을 만들고, 자연스럽게 메시지를 전달합니다.

## 필수 구성요소

### 1. 후킹 오프닝 (The Hook)
- 흥미로운 상황이나 질문으로 시작
- "그날, 모든 것이 바뀌었습니다" 같은 궁금증 유발
- 독자가 "다음은?" 하고 궁금해하도록

### 2. 배경 설정 (The Setup)
- 상황과 맥락 설명
- 등장인물(또는 자신) 소개
- 문제나 도전 과제 제시

### 3. 갈등과 전개 (Rising Action)
- 시도와 실패
- 장애물과 어려움
- 감정적 순간들

### 4. 클라이막스 (The Climax)
- 전환점 또는 깨달음의 순간
- 가장 감정적으로 임팩트 있는 부분
- "아하!" 모먼트

### 5. 해결과 교훈 (Resolution & Lesson)
- 어떻게 문제를 해결했는지
- 무엇을 배웠는지
- 독자에게 전하는 메시지

### 6. 독자에게 질문 (Engagement)
- 비슷한 경험 공유 요청
- 생각거리 던지기

## 스타일 가이드
- 현재 시제로 생생하게
- 감각적 묘사 활용 (보이는 것, 들리는 것, 느끼는 것)
- 대화 인용으로 생동감 추가
- 감정을 숨기지 않기

## 이미지 태그
[[IMAGE: 스토리 관련 감성적인 이미지]]
[[IMAGE: 전환점을 상징하는 이미지]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-qa-format",
    name: "Q&A형",
    templateType: "prompt",
    category: "tutorial",
    tone: "friendly",
    tags: ["질문", "답변", "FAQ", "궁금증", "해결", "가이드"],
    isDefault: true,
    priority: 75,
    description: "질문→답변→심화→액션 구조의 FAQ 스타일 콘텐츠",
    content: `
# 글쓰기 프롬프트: Q&A형

${COMMON_STRUCTURE_RULES}

## 목표
독자들이 자주 묻는 질문에 명확하게 답하고, 심화 정보까지 제공합니다.

## 필수 구성요소

### 1. 도입부
- 이 주제에 대해 많은 분들이 궁금해하는 것들
- 이 글에서 다룰 질문 미리보기
- 독자의 궁금증에 공감

### 2. Q&A 섹션 (5-8개 질문)
각 Q&A는 다음 구조를 따릅니다:

**Q. [질문]**
- 독자가 실제로 검색하거나 물어볼 법한 질문
- 구체적이고 명확하게

**A. [답변]**
- 핵심 답변 먼저 (TL;DR)
- 상세 설명
- 예시나 비유로 이해 돕기
- 관련 팁이나 주의사항

### 3. 심화 정보 (Deep Dive)
- 기본 Q&A를 넘어서는 고급 정보
- "더 알고 싶다면" 섹션
- 관련 리소스 링크

### 4. 결론
- 핵심 내용 요약
- 추가 질문 환영 메시지
- 관련 글 추천

## 스타일 가이드
- 질문은 대화체로 자연스럽게
- 답변은 친절하지만 명확하게
- 전문 용어는 쉽게 풀어서
- 실제 사례 활용

## 이미지 태그
[[IMAGE: FAQ 관련 아이콘]]
[[IMAGE: 단계별 가이드 인포그래픽]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-news-commentary",
    name: "뉴스 해설형",
    templateType: "prompt",
    category: "news",
    tone: "formal",
    tags: ["뉴스", "속보", "해설", "분석", "전망", "업데이트", "발표"],
    isDefault: true,
    priority: 85,
    description: "속보→배경→분석→전망 구조의 뉴스 해설 콘텐츠",
    content: `
# 글쓰기 프롬프트: 뉴스 해설형

${COMMON_STRUCTURE_RULES}

## 목표
최신 뉴스나 발표를 독자가 쉽게 이해하고 의미를 파악할 수 있도록 해설합니다.

## 필수 구성요소

### 1. 헤드라인 & 리드
- 핵심 뉴스를 1-2문장으로 요약
- 5W1H 중 가장 중요한 것 포함
- 독자의 관심을 끄는 앵글

### 2. 무슨 일이 일어났나 (What Happened)
- 사건/발표의 구체적 내용
- 주요 수치나 인용
- 객관적 사실 전달

### 3. 왜 중요한가 (Why It Matters)
- 이 뉴스가 왜 주목받는지
- 영향 받는 대상은 누구인지
- 시장/업계에 미치는 영향

### 4. 배경 설명 (Context)
- 이 뉴스가 나오게 된 배경
- 관련된 이전 이벤트
- 업계 동향과의 연결

### 5. 다양한 시각 (Perspectives)
- 긍정적 시각
- 비판적 시각
- 전문가 의견

### 6. 앞으로의 전망 (What's Next)
- 단기적 예상 변화
- 장기적 트렌드
- 주목해야 할 후속 이벤트

### 7. 독자를 위한 조언
- 이 뉴스를 바탕으로 독자가 할 수 있는 것
- 더 알아볼 리소스

## 스타일 가이드
- 객관적이고 중립적인 톤
- 팩트 체크된 정보만 사용
- 추측은 명확히 구분
- 출처 명시

## 이미지 태그
[[IMAGE: 뉴스 관련 공식 이미지]]
[[IMAGE: 데이터 차트 또는 타임라인]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // === 추가 5종 프롬프트 ===
  {
    id: "prompt-comparison",
    name: "비교 분석형",
    templateType: "prompt",
    category: "review",
    tone: "analytical",
    tags: ["비교", "VS", "대결", "선택", "추천", "장단점", "분석", "평가"],
    isDefault: true,
    priority: 82,
    description: "A vs B 형태로 두 가지 이상을 객관적으로 비교 분석",
    content: `
# 글쓰기 프롬프트: 비교 분석형

${COMMON_STRUCTURE_RULES}

## 목표
두 가지 이상의 옵션을 객관적으로 비교하여 독자의 선택을 돕습니다.

## 필수 구성요소

### 1. 비교 대상 소개
- 각 옵션의 간략한 소개
- 왜 이 비교가 필요한지

### 2. 비교 기준 설정
- 주요 비교 항목 정의 (최소 5개)
- 각 항목이 왜 중요한지

### 3. 상세 비교
각 기준별로:
- **[기준명]**
  - A의 특징: (설명)
  - B의 특징: (설명)
  - 🏆 승자: (판정 및 이유)

### 4. 비교표 (선택)
| 항목 | A | B |
|------|---|---|
| 기준1 | ⭐⭐⭐ | ⭐⭐ |
| 기준2 | ⭐⭐ | ⭐⭐⭐ |

### 5. 상황별 추천
- "~한 분께는 A를 추천"
- "~한 분께는 B를 추천"

### 6. 최종 결론
- 객관적인 총평
- 개인적 추천 (선택)

## 이미지 태그
[[IMAGE: 비교 인포그래픽]]
[[IMAGE: VS 이미지]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-tutorial-stepbystep",
    name: "단계별 튜토리얼",
    templateType: "prompt",
    category: "tutorial",
    tone: "friendly",
    tags: ["튜토리얼", "가이드", "따라하기", "단계별", "설치", "설정", "방법"],
    isDefault: true,
    priority: 78,
    description: "초보자도 따라할 수 있는 상세한 단계별 가이드",
    content: `
# 글쓰기 프롬프트: 단계별 튜토리얼

${COMMON_STRUCTURE_RULES}

## 목표
초보자도 쉽게 따라할 수 있는 상세한 가이드를 제공합니다.

## 필수 구성요소

### 1. 개요
- 이 튜토리얼에서 배울 것
- 예상 소요 시간
- 필요한 사전 지식

### 2. 준비물
- 필요한 도구/계정/환경
- 사전 설정 사항

### 3. 단계별 가이드
**Step 1: [단계명]**
- 상세 설명
- 스크린샷/코드 위치 표시
- ⚠️ 주의사항

**Step 2: [단계명]**
- (반복)

### 4. 문제 해결 (Troubleshooting)
- 자주 발생하는 오류
- 해결 방법

### 5. 다음 단계
- 추가로 배울 수 있는 것
- 관련 리소스 링크

## 이미지 태그
[[IMAGE: 단계별 스크린샷]]
[[IMAGE: 체크리스트]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-review-honest",
    name: "솔직 리뷰형",
    templateType: "prompt",
    category: "review",
    tone: "casual",
    tags: ["리뷰", "후기", "사용기", "솔직", "장단점", "추천", "비추천"],
    isDefault: true,
    priority: 76,
    description: "장단점을 솔직하게 공유하는 사용 후기 형식",
    content: `
# 글쓰기 프롬프트: 솔직 리뷰형

${COMMON_STRUCTURE_RULES}

## 목표
제품/서비스를 직접 사용한 경험을 솔직하게 공유합니다.

## 필수 구성요소

### 1. 첫인상
- 왜 이것을 선택했는지
- 기대했던 것

### 2. 제품/서비스 개요
- 기본 스펙/정보
- 가격 정보

### 3. 장점 (최소 3개)
- 구체적인 상황과 함께 설명
- "이런 점이 좋았다"

### 4. 단점 (최소 2개)
- 솔직하게 아쉬운 점
- "이건 개선되면 좋겠다"

### 5. 실제 사용 경험
- 일상에서 어떻게 활용했는지
- 구체적인 에피소드

### 6. 총점 및 추천 대상
- 별점 (선택)
- "이런 분께 추천/비추천"

## 이미지 태그
[[IMAGE: 제품 실제 사용 사진]]
[[IMAGE: 장단점 비교]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-trend-prediction",
    name: "트렌드 예측형",
    templateType: "prompt",
    category: "business",
    tone: "analytical",
    tags: ["트렌드", "전망", "예측", "미래", "2024", "2025", "변화", "혁신"],
    isDefault: true,
    priority: 79,
    description: "데이터와 인사이트 기반의 미래 트렌드 전망",
    content: `
# 글쓰기 프롬프트: 트렌드 예측형

${COMMON_STRUCTURE_RULES}

## 목표
데이터와 인사이트를 기반으로 미래 트렌드를 전망합니다.

## 필수 구성요소

### 1. 현재 상황 진단
- 현재 시장/업계 현황
- 최근 주요 변화

### 2. 트렌드 시그널
- 주목해야 할 신호들
- 선도 기업들의 움직임
- 관련 데이터/통계

### 3. 예측 트렌드 (3-5개)
각 트렌드별로:
- **트렌드명**
- 왜 이것이 부상하는가
- 구체적 사례/증거
- 예상 임팩트

### 4. 실행 제안
- 개인/기업이 준비해야 할 것
- 기회와 위험 요소

### 5. 결론
- 핵심 메시지
- 액션 아이템

## 이미지 태그
[[IMAGE: 트렌드 그래프/차트]]
[[IMAGE: 미래 이미지]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "prompt-case-study",
    name: "사례 연구형",
    templateType: "prompt",
    category: "business",
    tone: "professional",
    tags: ["사례", "케이스스터디", "성공", "실패", "분석", "교훈", "전략"],
    isDefault: true,
    priority: 77,
    description: "실제 사례를 깊이 분석하여 인사이트를 도출",
    content: `
# 글쓰기 프롬프트: 사례 연구형

${COMMON_STRUCTURE_RULES}

## 목표
실제 사례를 깊이 분석하여 독자가 적용할 수 있는 인사이트를 제공합니다.

## 필수 구성요소

### 1. 사례 소개
- 어떤 기업/제품/인물인지
- 왜 이 사례가 주목할 만한지

### 2. 배경 및 맥락
- 당시 시장 상황
- 직면했던 도전 과제

### 3. 전략 및 실행
- 어떤 결정을 내렸는지
- 구체적인 실행 방법
- 투입된 리소스

### 4. 결과
- 정량적 성과 (숫자)
- 정성적 성과
- 예상치 못한 결과

### 5. 성공/실패 요인 분석
- 핵심 성공 요인 (또는 실패 원인)
- 우연과 필연

### 6. 우리가 배울 점
- 적용 가능한 교훈
- 주의해야 할 점

## 이미지 태그
[[IMAGE: 사례 관련 이미지]]
[[IMAGE: 성공/실패 차트]]
    `,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ============================================================
// 기본 레이아웃 템플릿 (기존 호환성 유지)
// ============================================================
const defaultLayouts: ExtendedTemplate[] = [
  {
    id: "default-power-blogger",
    name: "파워블로거 템플릿 (기본)",
    templateType: "layout",
    category: "general",
    tone: "friendly",
    tags: ["블로그", "기본", "범용", "SEO"],
    isDefault: true,
    priority: 100,
    description: "검증된 파워블로거 스타일의 기본 레이아웃",
    content: defaultLayoutTemplate,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ============================================================
// 모든 기본 템플릿 합치기
// ============================================================
const allDefaultTemplates: ExtendedTemplate[] = [
  ...defaultLayouts,
  ...defaultPersonas,
  ...defaultPrompts,
];

// ============================================================
// Store 정의
// ============================================================
const store = new Store<UserSchema>({
  defaults: {
    settings: {
      blogName: "",
      writeRedirectUrl:
        "https://blogName.tistory.com/manage/newpost/?type=post&returnURL=%2Fmanage%2Fposts%2F",
      aiApiKey: "",
      aiProvider: "gemini",
      aiModel: "gemini-2.5-flash",
      localAiModel: "gemma3:4b",
      localAiEnabled: false,
      rssUrls: [],
      targetLanguage: "Korean",
      unsplashAccessKey: "",
      pexelsApiKey: "",
    },
    auth: {
      cookies: [],
      lastLogin: 0,
    },
    feedCache: {
      items: [],
      lastUpdated: 0,
    },
    templates: allDefaultTemplates,
    publishedPosts: [],
    scheduler: {
      enabled: false,
      intervalMinutes: 60,
      lastRun: 0,
      totalPublished: 0,
    },
    localAi: {
      installed: false,
      installedModels: [],
      lastUsed: 0,
    },
  },
  encryptionKey: "auto-story-secure-key",
});

// ============================================================
// 마이그레이션 함수: 기존 템플릿에 templateType 추가
// ============================================================
export function migrateTemplates(): void {
  const templates = store.get("templates") || [];
  let needsMigration = false;

  const migratedTemplates = templates.map((template: any) => {
    // 이미 templateType이 있으면 스킵
    if (template.templateType) {
      return template;
    }

    needsMigration = true;

    // 기존 템플릿은 layout으로 간주
    return {
      ...template,
      templateType: "layout" as TemplateType,
      category: "general" as TemplateCategory,
      isDefault: template.id === "default-power-blogger",
      priority: 50,
      createdAt: template.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  });

  // 기본 페르소나와 프롬프트가 없으면 추가
  const hasDefaultPersonas = migratedTemplates.some(
    (t: any) => t.templateType === "persona" && t.isDefault
  );
  const hasDefaultPrompts = migratedTemplates.some(
    (t: any) => t.templateType === "prompt" && t.isDefault
  );

  if (!hasDefaultPersonas) {
    migratedTemplates.push(...defaultPersonas);
    needsMigration = true;
  }

  if (!hasDefaultPrompts) {
    migratedTemplates.push(...defaultPrompts);
    needsMigration = true;
  }

  if (needsMigration) {
    store.set("templates", migratedTemplates);
    console.log("Templates migrated successfully");
  }
}

export default store;
