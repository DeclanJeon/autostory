/**
 * 네이버 스마트에디터 ONE 및 관리 페이지 선택자
 * Updated based on User provided HTML snippets (2025-12-27)
 */

/**
 * 네이버 블로그 주제 분류 매핑 (HTML 분석 기반)
 */
export const NAVER_THEME_CODES: Record<string, number> = {
  // 엔터테인먼트·예술
  문학: 5,
  책: 5,
  영화: 6,
  미술: 8,
  디자인: 8,
  공연: 7,
  전시: 7,
  음악: 11,
  드라마: 9,
  스타: 12,
  연예인: 12,
  만화: 13,
  애니: 13,
  방송: 10,

  // 생활·노하우·쇼핑
  일상: 14,
  생각: 14,
  육아: 15,
  결혼: 15,
  반려동물: 16,
  좋은글: 17,
  이미지: 17,
  패션: 18,
  미용: 18,
  인테리어: 19,
  DIY: 19,
  요리: 20,
  레시피: 20,
  상품리뷰: 21,
  리뷰: 21,
  원예: 36,
  재배: 36,

  // 취미·여가·여행
  게임: 22,
  스포츠: 23,
  사진: 24,
  자동차: 25,
  취미: 26,
  국내여행: 27,
  세계여행: 28,
  맛집: 29,

  // 지식·동향
  IT: 30,
  컴퓨터: 30,
  사회: 31,
  정치: 31,
  건강: 32,
  의학: 32,
  비즈니스: 33,
  경제: 33,
  어학: 35,
  외국어: 35,
  교육: 34,
  학문: 34,
};

export const NAVER_SELECTORS = {
  LOGIN: {
    URL: "https://nid.naver.com/nidlogin.login",
    MAIN_URL: "https://www.naver.com",
    USER_AREA_ID: "#gnb_name",
    LOGIN_BTN_CLASS: ".link_login",
  },
  WRITE: {
    // 글쓰기 기본 URL (blogId 필요)
    URL: (blogId: string) => `https://blog.naver.com/${blogId}/postwrite`,

    // 카테고리 관리 URL (blogId 필요)
    ADMIN_CATEGORY_URL: (blogId: string) =>
      `https://admin.blog.naver.com/${blogId}/config/blog`,

    // [팝업] 작성 중인 글 취소 (제공된 HTML: se-popup-button-cancel)
    POPUP_LAYER: ".se-popup-container",
    POPUP_CANCEL_BTN: "button.se-popup-button-cancel",
    POPUP_CONFIRM_BTN: "button.se-popup-button-confirm",

    // [에디터] 제목 및 본문
    // 네이버 스마트에디터 ONE의 제목 영역 - 정확한 선택자로 수정
    TITLE_INPUT:
      ".se-documentTitle .se-title-text .se-text-paragraph, .se-documentTitle .se-text-paragraph, .se-documentTitle",
    // 본문 영역 (클릭 포커스용) - data-a11y-title="본문" 속성 활용
    EDITOR_CONTENT_AREA:
      ".se-component.se-text[data-a11y-title='본문'] .se-text-paragraph, .se-component.se-text .se-module-text p, .se-component.se-text",
    // 본문 입력 영역 (직접 클릭용)
    BODY_INPUT:
      ".se-component.se-text[data-a11y-title='본문'], .se-component.se-text:not(.se-documentTitle)",
  },
  PUBLISH: {
    // 1. 상단 발행 버튼 (HTML: <button ... data-click-area="tpb.publish">)
    BTN_OPEN_DRAWER:
      "button.publish_btn__m9KHH, button[data-click-area='tpb.publish']",

    // 2. 발행 레이어 (Drawer)
    DRAWER_LAYER: ".layer_publish__vA9PX, .se-popup-container",

    // 3. 카테고리 선택 영역 (카테고리 선택 버튼 또는 라벨)
    // 발행 레이어 내의 카테고리 선택 버튼
    CATEGORY_SELECT_BTN:
      "button[data-click-area='tpb*i.category'], a[data-click-area='tpb*i.category']",
    // 카테고리 라벨 (카테고리 선택 후)
    CATEGORY_LABEL: (name: string) =>
      `.layer_publish__vA9PX label:has-text("${name}"), .layer_publish__vA9PX span:has-text("${name}")`,

    // 카테고리 리스트 레이어
    CATEGORY_LAYER: ".layer_category_list, .layer_publish__vA9PX",

    // 4. 주제 선택 버튼 (HTML: <a ... data-click-area="tpb*i.subject">)
    SUBJECT_OPEN_BTN: "a[data-click-area='tpb*i.subject']",

    // 주제 리스트 레이어
    SUBJECT_LAYER: ".layer_content_set_theme__sNW3O, .layer_publish__vA9PX",

    // 주제 아이템 (HTML: <label ... role="button">문학·책</label>)
    SUBJECT_ITEM_LABEL: (name: string) =>
      `.layer_content_set_theme__sNW3O label:has-text("${name}"), input[name="publishPublic"][value*="${name}"] + label`,

    // 주제 확인 버튼 (HTML: <button ... data-click-area="tpb*i.subjectok">)
    SUBJECT_CONFIRM_BTN: "button[data-click-area='tpb*i.subjectok']",
    SUBJECT_CANCEL_BTN: "button[data-click-area='tpb*i.subjectcel']",

    // 5. 태그 입력 (HTML: <input id="tag-input" ...>)
    TAG_INPUT: "input#tag-input, .tag_input__rvUB5",

    // 6. 최종 발행 버튼 (레이어 내부의 최종 발행 버튼)
    // HTML: <button ... class="confirm_btn__WEaBq" data-click-area="tpb*i.publish">
    BTN_FINAL_PUBLISH:
      ".layer_btn_area__UzyKH button.confirm_btn__WEaBq, button[data-testid='seOnePublishBtn'], .layer_publish__vA9PX button[data-click-area='tpb*i.publish']",

    // 7. 발행 취소 버튼
    BTN_CANCEL_PUBLISH:
      "button[data-click-area='tpb.cancel'], .layer_publish__vA9PX button[type='button']:not([data-click-area='tpb.publish'])",
  },
  ADMIN: {
    // 관리자 페이지 - 카테고리 관리

    // 카테고리 탭/메뉴
    CATEGORY_TAB: "a:has-text('카테고리'), button:has-text('카테고리')",

    // [HTML 분석 기반 Selector 수정]

    // 1. 카테고리 추가 버튼 (이미지 클래스 활용)
    BTN_ADD_CATEGORY: ".category_list_area .list_btn img._addCategoryView",

    // 2. [NEW] 트리 내 인라인 입력창 (우선순위 높음)
    TREE_INLINE_INPUT: "#tree li input.cat_input",

    // 3. 우측 설정 패널 - 카테고리명 입력 (Fallback)
    INPUT_CATEGORY_NAME: "input#category_name",

    // 4. 우측 설정 패널 - 공개 설정
    RADIO_PUBLIC: "input#pub_c1",

    // 5. 주제 분류
    THEME_SELECT_BAR: "#theme_select_bar",
    THEME_LAYER: "#themeSelectLayer",
    THEME_LABEL: (seq: number) => `label[for="seq${seq}"]`,

    // 6. 저장 버튼
    BTN_CONFIRM: "#submit_button",
    BTN_CANCEL: "button.btn_cancel, button:has-text('취소')",

    // 7. 카테고리 트리 및 아이템 확인
    CATEGORY_TREE: "#tree",
    CATEGORY_LIST_ITEM: (name: string) =>
      `li:has(span._categoryName:has-text("${name}")), li:has(label span:has-text("${name}")), .tree-node:has-text("${name}")`,
    CATEGORY_ITEM_TEXT: "#tree li .drag-label ._categoryName",

    // 카테고리명 텍스트 요소
    CATEGORY_NAME_SPAN: "span._categoryName, label span",

    // 카테고리 편집 영역
    CATEGORY_EDIT_AREA: ".category_add, .category_edit_area",
  },
};
