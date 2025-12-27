/**
 * 네이버 블로그 관리자 페이지 카테고리 영역 분석 스크립트
 * 사용법: npx ts-node scripts/inspect-naver-category-page.ts
 */

const { chromium } = require("playwright");

async function inspectNaverCategoryPage() {
  console.log("브라우저를 시작합니다...");

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome", // 기존 Chrome 사용
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  try {
    console.log("1. 관리자 페이지로 이동 중...");
    // 실제 블로그 ID로 변경 필요
    const blogId = process.env.NAVER_BLOG_ID || "your-blog-id";
    const adminUrl = `https://admin.blog.naver.com/${blogId}/config/blog`;

    console.log(`URL: ${adminUrl}`);
    console.log(
      "로그인이 필요합니다. 로그인을 완료한 후 Enter를 눌러주세요..."
    );

    await page.goto(adminUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // 사용자가 수동으로 로그인할 시간 제공
    console.log("\n========================================");
    console.log("브라우저가 열렸습니다.");
    console.log("1. 네이버에 로그인하세요.");
    console.log("2. 카테고리 설정 페이지로 이동하세요.");
    console.log('3. 카테고리 "추가" 버튼을 찾아서 마우스를 올려두세요.');
    console.log("4. 이 터미널에서 Enter를 누르면 HTML을 캡처합니다.");
    console.log("========================================\n");

    // 사용자 입력 대기
    await new Promise((resolve) => {
      process.stdin.once("data", resolve);
    });

    console.log("\n2. 페이지 HTML 캡처 중...");

    // 페이지 전체 HTML 캡처
    const fullHtml = await page.content();

    // 카테고리 관련 영역만 추출 시도
    const categorySections = await page.evaluate(() => {
      const results = [];

      // 가능한 카테고리 관련 요소들
      const selectors = [
        ".category_list",
        ".category_wrap",
        ".blog-category",
        '[class*="category"]',
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.push({
            selector,
            count: elements.length,
            html: elements[0].outerHTML.substring(0, 2000),
          });
        }
      }

      return results;
    });

    console.log("\n=== 발견된 카테고리 관련 영역 ===");
    categorySections.forEach((section, i) => {
      console.log(`\n[${i + 1}] Selector: ${section.selector}`);
      console.log(`Count: ${section.count}`);
      console.log(`HTML Preview:\n${section.html}\n`);
    });

    // 파일로 저장
    const fs = require("fs");
    const outputDir = "tmp-naver-html";

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 전체 HTML 저장
    fs.writeFileSync(
      `${outputDir}/admin-category-page-full.html`,
      fullHtml,
      "utf-8"
    );

    // 스크린샷 저장
    await page.screenshot({
      path: `${outputDir}/admin-category-page.png`,
      fullPage: true,
    });

    console.log("\n3. 파일 저장 완료:");
    console.log(`   - ${outputDir}/admin-category-page-full.html`);
    console.log(`   - ${outputDir}/admin-category-page.png`);

    // 카테고리 추가 버튼을 찾기 위한 추가 정보 수집
    console.log("\n4. 버튼 요소 분석 중...");
    const buttonInfo = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll('button, a, div[role="button"]')
      );
      const relevant = [];

      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        const className = btn.className || "";
        const dataAttrs = {};

        Array.from(btn.attributes).forEach((attr) => {
          if (attr.name.startsWith("data-")) {
            dataAttrs[attr.name] = attr.value;
          }
        });

        // 관련 있는 버튼 필터링
        if (
          text.includes("추가") ||
          text.includes("카테고리") ||
          className.includes("add") ||
          className.includes("category")
        ) {
          relevant.push({
            tag: btn.tagName,
            text: text.substring(0, 50),
            className: className.substring(0, 100),
            dataAttrs,
            html: btn.outerHTML.substring(0, 500),
          });
        }
      }

      return relevant;
    });

    console.log("\n=== 발견된 관련 버튼 ===");
    buttonInfo.forEach((btn, i) => {
      console.log(`\n[${i + 1}] ${btn.tag} - "${btn.text}"`);
      console.log(`Class: ${btn.className}`);
      if (Object.keys(btn.dataAttrs).length > 0) {
        console.log(`Data attributes:`, btn.dataAttrs);
      }
      console.log(`HTML: ${btn.html}`);
    });
  } catch (error) {
    console.error("오류 발생:", error.message);
  } finally {
    console.log("\n브라우저를 종료하려면 Enter를 눌러주세요...");
    await new Promise((resolve) => {
      process.stdin.once("data", resolve);
    });

    await browser.close();
    console.log("완료!");
  }
}

inspectNaverCategoryPage().catch(console.error);
