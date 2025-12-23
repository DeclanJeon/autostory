const fs = require("fs");
const path = require("path");

exports.default = async function (context) {
  // 리눅스 빌드일 때만 실행
  if (context.electronPlatformName === "linux") {
    console.log(
      "  • 🛡️  Linux SUID Sandbox 문제 해결을 위해 chrome-sandbox 파일을 제거합니다..."
    );

    // chrome-sandbox 파일 경로 찾기
    const sandboxPath = path.join(context.appOutDir, "chrome-sandbox");

    // 파일이 존재하면 삭제
    if (fs.existsSync(sandboxPath)) {
      try {
        fs.unlinkSync(sandboxPath);
        console.log(
          "  • ✅ chrome-sandbox 제거 완료 (이제 --no-sandbox 플래그가 정상 작동합니다)"
        );
      } catch (err) {
        console.error(`  • ❌ chrome-sandbox 제거 실패: ${err.message}`);
      }
    } else {
      console.log(
        "  • ⚠️  chrome-sandbox 파일을 찾을 수 없습니다 (이미 제거되었거나 경로가 다름)"
      );
    }
  }
};
