module.exports = {
  hooks: {
    readPackage(pkg, context) {
      if (pkg.name === "electron") {
        pkg.scripts = pkg.scripts || {};
        // Electron의 postinstall 스크립트를 허용
        if (pkg.scripts.postinstall) {
          // 스크립트를 그대로 유지
        }
      }
      return pkg;
    },
  },
};
