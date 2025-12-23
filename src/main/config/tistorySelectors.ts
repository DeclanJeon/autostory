export const TISTORY_SELECTORS = {
  LOGIN: {
    KAKAO_URL: "https://accounts.kakao.com/login",
    TISTORY_MAIN_URL: "https://www.tistory.com",
    LOGIN_INDICATOR_CLASS: ".txt_login", // 이 요소가 있으면 로그인 안 된 상태
    USER_MENU: ".user_menu", // 로그인 성공 시 보이는 요소
    LINK_LOGIN: "a[href*='login']",
  },
  WRITE: {
    TITLE_INPUT: "#post-title-inp",
    // 에디터 iframe과 본문 영역
    EDITOR_IFRAME: "#editor-tistory_ifr",
    EDITOR_BODY: "body#tinymce",
    PUBLISH_LAYER_BTN: ["button:has-text('완료')", ".btn_apply"], // 완료 버튼
    FINAL_PUBLISH_BTN: ["#publish-btn", "button:has-text('발행')"], // 최종 발행 버튼
  },
  EDITOR_MODE: {
    // 모드 전환 버튼
    MODE_BUTTON: "#editor-mode-layer-btn",
    MODE_LAYER: ".editor-mode-layer",

    // 각 모드 선택 버튼
    HTML_MODE: "#editor-mode-html-tistory",
    MARKDOWN_MODE: "#editor-mode-markdown-tistory",
    BASIC_MODE: "#editor-mode-kakao-tistory",

    // 모드별 컨테이너
    HTML_CONTAINER: "#html-editor-container",
    MARKDOWN_CONTAINER: "#markdown-editor-container",
    KAKAO_CONTAINER: "#kakao-editor-container",

    // CodeMirror 에디터 (HTML/Markdown 모드)
    CODEMIRROR: ".CodeMirror",
    CODEMIRROR_LINES: ".CodeMirror-lines",
    CODEMIRROR_SCROLL: ".CodeMirror-scroll",

    // [NEW] 추가 셀렉터
    HTML_TEXTAREA: "#html-editor-container textarea",
    MODE_INDICATOR: ".editor-mode-indicator",

    // 에디터 상태 확인용
    EDITOR_INITIALIZED: "[data-editor-initialized='true']",
  },
  CATEGORY: {
    BUTTON: "#category-btn",
    LIST_CONTAINER: "#category-list",
    ITEM: '[id^="category-item-"]',
    ITEM_TEXT: ".mce-text",
    /** 특정 카테고리 ID로 항목 선택 */
    ITEM_WITH_ID: (id: string) => `[category-id="${id}"]`,
    /** 기본 fallback 카테고리 */
    FALLBACK_CATEGORY: "Issue",
  },
  HOME_TOPIC: {
    WRAPPER: "#home_subject",
    SELECT_BTN: ".select_btn",
    MENU_PANEL: ".mce-floatpanel.mce-menu",
    ITEM: ".mce-menu-item",
    ITEM_TEXT: ".mce-text",
    /** 선택 가능한 항목만 (disabled 제외) */
    SELECTABLE_ITEM: ".mce-menu-item:not(.disabled)",
    DISABLED_ITEM: ".mce-menu-item.disabled",
  },
  TAG: {
    INPUT: "#tagText",
  },
  // [NEW] 발행 관련 셀렉터
  PUBLISH: {
    COMPLETE_BTN: [
      "button:has-text('완료')",
      ".btn_apply",
      "#btn-publish-layer",
    ],
    PUBLISH_BTN: [
      "#publish-btn",
      "button:has-text('발행')",
      "button:has-text('공개 발행')",
      ".btn_publish",
    ],
    SAVE_DRAFT_BTN: ["button:has-text('저장')", ".btn_save"],
    PREVIEW_BTN: ["button:has-text('미리보기')", ".btn_preview"],
  },
  // [NEW] 카테고리 관리 페이지 셀렉터
  MANAGE_CATEGORY: {
    URL: (blogName: string) => `https://${blogName}.tistory.com/manage/category`,
    BTN_ADD: ".wrap_add .lab_add", // 카테고리 추가 버튼 (label 태그)
    INPUT_NAME: ".edit_item .tf_blog", // 카테고리명 입력
    
    // 주제 드롭다운
    DROPDOWN_BTN: ".opt_blog .btn_opt", 
    DROPDOWN_LAYER: ".opt_blog .layer_opt",
    
    // 주제 항목들
    TOPIC_ITEM_LABEL: ".list_opt .lab_btn",
    
    // 확인/저장 버튼
    BTN_CONFIRM: ".order_btn button[type='submit']", // 소분류 추가 확인 (작은 버튼)
    BTN_SAVE: ".set_btn .btn_save", // 전체 변경사항 저장 (큰 버튼)
  },
};

/**
 * 홈 토픽 키워드 매핑 테이블
 * @description AI 분석 시 본문 키워드와 홈주제를 매칭하는 데 사용
 */
/**
 * 홈주제 키워드 매핑 테이블
 * @description AI 분석 시 본문 키워드와 홈주제를 매칭하는 데 사용 (Fallback)
 * 사용자가 제공한 카테고리 구조를 반영
 */
export const HOME_TOPIC_KEYWORDS: Record<string, string[]> = {
  // === 여행·맛집 ===
  "- 국내여행": ["국내여행", "제주", "부산", "강원", "서울", "여행", "가볼만한곳", "숙소", "펜션", "호텔"],
  "- 해외여행": ["해외여행", "유럽", "일본", "동남아", "미국", "비행기", "여권", "공항", "환전"],
  "- 캠핑·등산": ["캠핑", "등산", "글램핑", "차박", "텐트", "산행", "트레킹", "야영"],
  "- 맛집": ["맛집", "먹방", "식당", "레스토랑", "메뉴", "음식점", "브런치", "노포"],
  "- 카페·디저트": ["카페", "디저트", "커피", "빵", "베이커리", "라떼", "케이크"],

  // === 리빙·스타일 ===
  "- 생활정보": ["생활정보", "꿀팁", "방법", "노하우", "청소", "정리", "살림", "세탁"],
  "- 인테리어": ["인테리어", "집꾸미기", "가구", "소품", "방꾸미기", "리모델링", "조명"],
  "- 패션·뷰티": ["패션", "뷰티", "화장품", "코디", "스타일", "옷", "메이크업", "피부"],
  "- 요리": ["요리", "레시피", "반찬", "도시락", "식단", "집밥", "만들기"],

  // === 가족·연애 ===
  "- 일상": ["일상", "생각", "일기", "기록", "하루", "잡담"],
  "- 연애·결혼": ["연애", "결혼", "웨딩", "커플", "사랑", "이별", "부부"],
  "- 육아": ["육아", "아기", "임신", "출산", "교육", "장난감", "이유식", "키즈"],
  "- 해외생활": ["해외생활", "유학", "이민", "워홀", "해외거주", "교민"],
  "- 군대": ["군대", "군인", "입대", "훈련소", "예비군", "복무"],
  "- 반려동물": ["반려동물", "강아지", "고양이", "집사", "사료", "댕댕이", "냥이"],

  // === 직장·자기계발 ===
  "- IT 인터넷": [
    "IT", "인터넷", "개발", "코딩", "소프트웨어", "웹", "앱", "AI", "클라우드", 
    "서버", "블록체인", "프로그래밍", "보안", "플랫폼", "스타트업"
  ],
  "- 모바일": ["모바일", "스마트폰", "어플", "iOS", "Android", "갤럭시", "아이폰", "태블릿"],
  "- 과학": ["과학", "우주", "물리", "화학", "생물", "연구", "실험", "기술"],
  "- IT 제품리뷰": ["리뷰", "후기", "언박싱", "노트북", "키보드", "마우스", "모니터", "가전"],
  "- 경영·직장": ["경영", "직장", "회사", "비즈니스", "취업", "이직", "면접", "커리어", "업무"],

  // === 시사·지식 ===
  "- 정치": ["정치", "국회", "선거", "정책", "정당", "투표"],
  "- 사회": ["사회", "이슈", "뉴스", "사건", "사고", "현상", "복지"],
  "- 교육": ["교육", "학교", "대학", "입시", "공부", "자격증", "시험", "학습"],
  "- 국제": ["국제", "세계", "외교", "글로벌", "해외뉴스"],
  "- 경제": ["경제", "주식", "투자", "금융", "부동산", "재테크", "증권", "환율"],

  // === 도서·창작 ===
  "- 책": ["책", "독서", "서평", "도서", "출판", "베스트셀러", "문학"],
  "- 창작": ["창작", "글쓰기", "에세이", "소설", "시", "수필"],

  // === 엔터테인먼트 ===
  "- TV": ["TV", "드라마", "예능", "방송", "OTT", "넷플릭스"],
  "- 스타": ["스타", "연예인", "아이돌", "배우", "가수", "팬덤"],
  "- 영화": ["영화", "무비", "개봉", "관람", "리뷰", "극장"],
  "- 음악": ["음악", "노래", "앨범", "콘서트", "음원", "팝송"],
  "- 만화·애니": ["만화", "애니", "웹툰", "애니메이션", "캐릭터"],
  "- 공연·전시·축제": ["공연", "전시", "축제", "뮤지컬", "연극", "행사", "박람회"],

  // === 취미·건강 ===
  "- 취미": ["취미", "DIY", "만들기", "수집", "취미생활"],
  "- 건강": ["건강", "운동", "다이어트", "헬스", "영양", "질병", "치료"],
  "- 스포츠일반": ["스포츠", "운동", "올림픽", "체육"],
  "- 축구": ["축구", "EPL", "손흥민", "K리그", "월드컵"],
  "- 야구": ["야구", "KBO", "MLB", "메이저리그", "프로야구"],
  "- 농구": ["농구", "NBA", "KBL"],
  "- 배구": ["배구", "V리그"],
  "- 골프": ["골프", "PGA", "LPGA", "라운딩", "스윙"],
  "- 자동차": ["자동차", "시승기", "차량", "드라이브", "전기차", "테슬라"],
  "- 게임": ["게임", "롤", "배그", "모바일게임", "PC게임", "콘솔", "공략"],
  "- 사진": ["사진", "카메라", "출사", "촬영", "포토"],
};

/**
 * 카테고리 키워드 매핑 테이블
 * @description 본문 내용을 분석하여 적합한 카테고리를 찾는 데 사용
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "IT 이야기": ["IT", "기술", "테크", "트렌드", "뉴스"],
  개발지식: ["개발", "프로그래밍", "코딩", "알고리즘", "자료구조"],
  "디자인 패턴": ["디자인패턴", "아키텍처", "설계", "패턴", "리팩토링"],
  Cloud: ["클라우드", "AWS", "Azure", "GCP", "서버리스"],
  Git: ["깃", "GitHub", "GitLab", "버전관리", "브랜치"],
  JAVA: ["자바", "Java", "JVM", "스프링", "Spring"],
  Go: ["고랭", "Golang", "Go언어"],
  Spring: ["스프링", "Spring Boot", "JPA", "Hibernate"],
  "알고리즘 | 자료구조": ["알고리즘", "자료구조", "정렬", "탐색", "그래프"],
  "Node.js": ["노드", "Node", "Express", "NestJS", "npm"],
  Python: ["파이썬", "Python", "Django", "Flask", "pandas"],
  JavaScript: ["자바스크립트", "JavaScript", "JS", "ES6", "TypeScript"],
  React: ["리액트", "React", "Redux", "Next.js", "훅"],
  CSS: ["CSS", "스타일", "SCSS", "Tailwind", "styled"],
  SQL: ["SQL", "데이터베이스", "MySQL", "PostgreSQL", "쿼리"],
  Android: ["안드로이드", "Android", "Kotlin", "앱개발"],
  Linux: ["리눅스", "Linux", "Ubuntu", "CentOS", "쉘"],
  "AI 활용법": ["AI", "인공지능", "ChatGPT", "GPT", "프롬프트"],
  "Docker&Kubernetes": [
    "도커",
    "Docker",
    "쿠버네티스",
    "Kubernetes",
    "컨테이너",
  ],
  Network: ["네트워크", "HTTP", "TCP", "IP", "프로토콜"],
  Error: ["에러", "오류", "버그", "디버깅", "해결"],
  "개발 Tip": ["팁", "노하우", "꿀팁", "효율", "생산성"],
  Issue: ["이슈", "뉴스", "소식", "업데이트", "발표"],
};
