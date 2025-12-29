/**
 * 티스토리 홈주제 상수 정의
 *
 * 사용자가 제공한 홈주제 태그 목록을 기반으로 정의됨
 */

export const HOME_TOPICS = [
  // 여행·맛집
  { name: "국내여행", category: "여행·맛집" },
  { name: "해외여행", category: "여행·맛집" },
  { name: "캠핑·등산", category: "여행·맛집" },
  { name: "맛집", category: "여행·맛집" },
  { name: "카페·디저트", category: "여행·맛집" },

  // 리빙·스타일
  { name: "생활정보", category: "리빙·스타일" },
  { name: "인테리어", category: "리빙·스타일" },
  { name: "패션·뷰티", category: "리빙·스타일" },
  { name: "요리", category: "리빙·스타일" },

  // 가족·연애
  { name: "일상", category: "가족·연애" },
  { name: "연애·결혼", category: "가족·연애" },
  { name: "육아", category: "가족·연애" },
  { name: "해외생활", category: "가족·연애" },
  { name: "군대", category: "가족·연애" },
  { name: "반려동물", category: "가족·연애" },

  // 직장·자기계발
  { name: "IT 인터넷", category: "직장·자기계발" },
  { name: "모바일", category: "직장·자기계발" },
  { name: "과학", category: "직장·자기계발" },
  { name: "IT 제품리뷰", category: "직장·자기계발" },
  { name: "경영·직장", category: "직장·자기계발" },

  // 시사·지식
  { name: "정치", category: "시사·지식" },
  { name: "사회", category: "시사·지식" },
  { name: "교육", category: "시사·지식" },
  { name: "국제", category: "시사·지식" },
  { name: "경제", category: "시사·지식" },

  // 도서·창작
  { name: "책", category: "도서·창작" },
  { name: "창작", category: "도서·창작" },

  // 엔터테인먼트
  { name: "TV", category: "엔터테인먼트" },
  { name: "스타", category: "엔터테인먼트" },
  { name: "영화", category: "엔터테인먼트" },
  { name: "음악", category: "엔터테인먼트" },
  { name: "만화·애니", category: "엔터테인먼트" },
  { name: "공연·전시·축제", category: "엔터테인먼트" },

  // 취미·건강
  { name: "취미", category: "취미·건강" },
  { name: "건강", category: "취미·건강" },
  { name: "스포츠일반", category: "취미·건강" },
  { name: "축구", category: "취미·건강" },
  { name: "야구", category: "취미·건강" },
  { name: "농구", category: "취미·건강" },
  { name: "배구", category: "취미·건강" },
  { name: "골프", category: "취미·건강" },
  { name: "자동차", category: "취미·건강" },
  { name: "게임", category: "취미·건강" },
  { name: "사진", category: "취미·건강" },
];

export const HOME_TOPIC_CATEGORIES = [
  "여행·맛집",
  "리빙·스타일",
  "가족·연애",
  "직장·자기계발",
  "시사·지식",
  "도서·창작",
  "엔터테인먼트",
  "취미·건강",
];

/**
 * 홈주제 UI 선택을 위한 인터페이스
 */
export interface HomeThemeSelection {
  materialId?: string;
  themeName?: string;
}
