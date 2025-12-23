#!/bin/bash

# Linux AppImage Sandbox 권한 문제 해결 스크립트
# 이 스크립트는 AppImage 실행 파일의 sandbox 권한 문제를 해결합니다

APPIMAGE_PATH="$1"

if [ -z "$APPIMAGE_PATH" ]; then
    echo "사용법: $0 <AppImage_파일_경로>"
    echo "예시: $0 ./AutoStory-1.1.0-linux.AppImage"
    exit 1
fi

if [ ! -f "$APPIMAGE_PATH" ]; then
    echo "오류: 파일을 찾을 수 없습니다 - $APPIMAGE_PATH"
    exit 1
fi

echo "AppImage Sandbox 권한 문제 해결 시작..."
echo "대상 파일: $APPIMAGE_PATH"

# AppImage 임시 마운트 디렉토리 생성
TEMP_DIR=$(mktemp -d)
echo "임시 디렉토리 생성: $TEMP_DIR"

# AppImage 마운트
"$APPIMAGE_PATH" --appimage-extract > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "오류: AppImage 추출 실패"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# chrome-sandbox 파일 권한 수정
if [ -f "squashfs-root/chrome-sandbox" ]; then
    echo "chrome-sandbox 권한 수정 중..."
    sudo chown root:root squashfs-root/chrome-sandbox
    sudo chmod 4755 squashfs-root/chrome-sandbox
    echo "chrome-sandbox 권한 수정 완료"
else
    echo "경고: chrome-sandbox 파일을 찾을 수 없습니다"
fi

# 수정된 AppImage 재생성
echo "수정된 AppImage 재생성 중..."
ARCHIVE_FILE=$(find . -name "*.AppImage" -not -path "./squashfs-root/*" | head -1)
if [ -n "$ARCHIVE_FILE" ]; then
    # AppImageTool이 있는지 확인
    if command -v appimagetool &> /dev/null; then
        appimagetool squashfs-root "${APPIMAGE_PATH%.AppImage}-fixed.AppImage"
        echo "수정된 AppImage 생성 완료: ${APPIMAGE_PATH%.AppImage}-fixed.AppImage"
    else
        echo "오류: appimagetool을 찾을 수 없습니다. 수동으로 설치해주세요."
        echo "설치 명령어: wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
        echo "           chmod +x appimagetool-x86_64.AppImage"
        echo "           sudo mv appimagetool-x86_64.AppImage /usr/local/bin/appimagetool"
    fi
fi

# 임시 디렉토리 정리
rm -rf squashfs-root
rm -rf "$TEMP_DIR"

echo "Sandbox 권한 수정 완료!"
echo ""
echo "실행 옵션:"
echo "1. 수정된 AppImage 실행: ${APPIMAGE_PATH%.AppImage}-fixed.AppImage"
echo "2. 또는 원본 AppImage에 --no-sandbox 옵션으로 실행:"
echo "   $APPIMAGE_PATH --no-sandbox"