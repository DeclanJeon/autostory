import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // useLocation 제거 가능
import { Template } from "../types/global";
import { useToastHelpers } from "../components/Toast";
import { useDraftStore } from "../stores/draftStore"; // 스토어 임포트

const WriteConfig: React.FC = () => {
  const navigate = useNavigate();

  // [수정] 스토어에서 데이터 및 상태 가져오기
  const { selectedIssues, targetCategory, setTargetCategory } = useDraftStore();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [instructions, setInstructions] = useState("");

  // 상태 관리
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoPublish, setAutoPublish] = useState(true);
  const [generatedResult, setGeneratedResult] = useState<{
    filePath: string;
    title: string;
  } | null>(null);
  const [log, setLog] = useState("");
  const [writeMode, setWriteMode] = useState<"auto" | "custom">("auto");

  // [NEW] 플랫폼 선택 상태 (초기값은 설정에서 로드 후 갱신)
  const [targetPlatforms, setTargetPlatforms] = useState({
    tistory: true,
    naver: false,
  });

  // [신규] 이미지 테스트 상태
  const [isTestingImage, setIsTestingImage] = useState(false);
  const [testResult, setTestResult] = useState<{
    keyword: string;
    imageUrls: string[];
  } | null>(null);

  useEffect(() => {
    // 템플릿 로드
    if (window.electronAPI) {
      window.electronAPI.listTemplates().then((list) => {
        setTemplates(list);
        if (list.length > 0) setSelectedTemplateId(list[0].id);
      });
    }

    // [디버그] 데이터 확인
    if (selectedIssues.length > 0) {
      console.log("Loaded Issues:", selectedIssues);
      const missingLinks = selectedIssues.filter((i: any) => !i.link && !i.url);
      if (missingLinks.length > 0) {
        console.warn(
          "⚠️ 경고: 일부 이슈에 링크 정보가 없습니다!",
          missingLinks
        );
      }
    }

    // [추가] 진입 시 데이터가 없으면 목록으로 리다이렉트 안내
    if (selectedIssues.length === 0) {
      // 상황에 따라 리다이렉트하거나 안내 메시지 표시
    }

    // [NEW] 사용자 설정 불러와서 플랫폼 기본값 적용
    window.electronAPI.getSettings().then((settings) => {
      setTargetPlatforms({
        tistory: settings.tistoryEnabled,
        naver: settings.naverEnabled && !!settings.naverBlogId,
      });
    });
  }, [selectedIssues.length]); // 의존성 추가

  const { showSuccess, showError, showInfo } = useToastHelpers();

  // 글 생성 및 자동 발행 핸들러
  const handleGenerateAndPublish = async () => {
    setIsGenerating(true);
    setLog("AI 콘텐츠 생성 및 자동 발행 중... (약 30초~1분 소요)");

    if (!window.electronAPI) {
      showError("오류 발생", "Electron API를 사용할 수 없습니다.");
      setIsGenerating(false);
      return;
    }

    try {
      // 1. 콘텐츠 생성 (autoPublish는 false로 설정하여 직접 제어)
      const result = await window.electronAPI.generateContent({
        issues: selectedIssues,
        instructions,
        templateId:
          writeMode === "auto" ? "auto-analysis-mode" : selectedTemplateId,
        category: targetCategory,
        autoPublish: false, // 일단 생성만 먼저 함
      });

      if (result.success && result.filePath) {
        setLog("✅ 콘텐츠 생성 완료. 자동 발행 시작...");

        if (autoPublish) {
          const platforms = [];
          if (targetPlatforms.tistory) platforms.push("tistory");
          if (targetPlatforms.naver) platforms.push("naver");

          if (platforms.length === 0) {
            showInfo("알림", "발행할 플랫폼이 선택되지 않았습니다.");
            setIsGenerating(false);
            return;
          }

          // 2. 다중 발행 호출
          const pubResult = await window.electronAPI.publishPostMulti({
            filePath: result.filePath,
            category: targetCategory,
            platforms,
          });

          if (pubResult.success) {
            const results = pubResult.results;
            let msg = "";

            // 결과 메시지 구성
            if (results?.tistory) {
              if (results.reservation) {
                msg += `✅ 티스토리 (예약: ${results.reservationDate})\n`;
              } else {
                msg += "✅ 티스토리 발행 성공\n";
              }
            }
            if (results?.naver) msg += "✅ 네이버 발행 성공\n";

            if (results?.errors && results.errors.length > 0) {
              msg += "\n❌ 오류:\n" + results.errors.join("\n");
              showInfo("일부 발행 실패", msg);
            } else {
              showSuccess("발행 완료!", msg);
            }
            setTimeout(() => navigate("/posts"), 1500);
          } else {
            showError("발행 중 오류", pubResult.error || "알 수 없는 오류");
          }
        } else {
          setLog(`생성 완료! 파일 저장됨.`);
          showInfo("생성 완료", "글이 생성되었습니다. 수동 발행이 필요합니다.");
          setTimeout(() => navigate("/posts"), 1000);
        }
      } else {
        setLog(`실패: ${result.error}`);
        showError(
          "발행 실패",
          result.error || "글 발행 중 오류가 발생했습니다."
        );
      }
    } catch (e: any) {
      const errorMessage = e?.message || "알 수 없는 오류가 발생했습니다.";
      setLog(errorMessage);
      showError("오류 발생", errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  // [신규] 이미지 검색 테스트 핸들러
  const handleTestImage = async () => {
    if (selectedIssues.length === 0) {
      alert("이슈를 먼저 선택하세요.");
      return;
    }

    setIsTestingImage(true);
    setTestResult(null);

    try {
      const sampleText = `${selectedIssues[0].title} ${selectedIssues[0].contentSnippet}`;

      const result = await window.electronAPI.testImageSearch({
        text: sampleText,
      });

      if (result.success && result.imageUrls && result.imageUrls.length > 0) {
        setTestResult({
          keyword: result.keyword || "unknown",
          imageUrls: result.imageUrls,
        });
      } else {
        alert(
          "이미지 검색 실패: " + (result.error || "이미지를 찾을 수 없습니다")
        );
      }
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setIsTestingImage(false);
    }
  };

  // [UX 개선] 데이터가 없을 때의 UI 처리
  if (selectedIssues.length === 0) {
    return (
      <div className="p-6 text-slate-800 flex flex-col items-center justify-center h-full">
        <div className="text-xl mb-4">선택된 글감이 없습니다.</div>
        <button
          onClick={() => navigate("/feeds")}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
        >
          글감 찾으러 가기
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 h-full overflow-y-auto text-slate-800">
      <h2 className="text-2xl font-bold mb-6">📝 AI 글 생성 및 자동 발행</h2>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-4 text-gray-700">
            📌 선택된 글 소재 ({selectedIssues.length}개)
          </h3>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {selectedIssues.map((item: any, idx: number) => (
              <div key={idx} className="text-sm p-2 border rounded bg-gray-50">
                <p className="font-bold text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-500 mt-1">{item.source}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow flex flex-col gap-4">
          <div>
            <label className="block font-medium mb-1">
              카테고리 (선택사항)
            </label>
            <input
              type="text"
              className="w-full border p-2 rounded"
              value={targetCategory}
              onChange={(e) => setTargetCategory(e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium mb-3 text-lg">
              🎨 작성 모드
            </label>
            <div className="flex gap-4">
              <label
                className={`flex-1 border-2 p-4 rounded-lg cursor-pointer transition ${
                  writeMode === "auto"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name="writeMode"
                    checked={writeMode === "auto"}
                    onChange={() => setWriteMode("auto")}
                    className="w-5 h-5 text-blue-600"
                  />
                  <span className="font-bold text-blue-700">
                    🤖 AI 자동 분석 (추천)
                  </span>
                </div>
                <p className="text-sm text-gray-600 ml-7">
                  AI가 소재를 분석하여 최적의 구조와 스타일로 글을 작성합니다.
                </p>
              </label>

              <label
                className={`flex-1 border-2 p-4 rounded-lg cursor-pointer transition ${
                  writeMode === "custom"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name="writeMode"
                    checked={writeMode === "custom"}
                    onChange={() => setWriteMode("custom")}
                    className="w-5 h-5 text-purple-600"
                  />
                  <span className="font-bold text-purple-700">
                    📋 템플릿 기반 작성
                  </span>
                </div>
                <p className="text-sm text-gray-600 ml-7">
                  미리 정의된 템플릿 구조에 맞춰 글을 작성합니다.
                </p>
              </label>
            </div>
          </div>

          {writeMode === "custom" && (
            <div className="animate-fade-in-down">
              <label className="block font-medium mb-1">템플릿 선택</label>
              <select
                className="w-full border p-2 rounded"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-medium mb-1">
              추가 지시사항 (Prompt)
            </label>
            <textarea
              className="w-full border p-2 rounded h-32 resize-none"
              placeholder="예: 초보자도 이해할 수 있게 쉽게 설명해주세요. 'AI'라는 키워드를 5번 이상 포함해주세요."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div className="mt-auto border-t pt-4">
            {/* [UPDATED] 자동 발행 옵션 UI */}
            <div className="flex flex-col gap-3 mb-4 bg-gray-50 p-4 rounded border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  🚀 자동 발행 대상
                </span>
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPublish}
                    onChange={(e) => setAutoPublish(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  생성 후 즉시 발행
                </label>
              </div>

              <div className="flex gap-4 mt-1">
                {/* 티스토리 체크박스 */}
                <label
                  className={`flex items-center gap-2 text-sm cursor-pointer p-2 rounded transition border ${
                    targetPlatforms.tistory
                      ? "bg-white border-orange-200 text-orange-700"
                      : "bg-gray-100 border-transparent text-gray-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={targetPlatforms.tistory}
                    onChange={(e) =>
                      setTargetPlatforms((prev) => ({
                        ...prev,
                        tistory: e.target.checked,
                      }))
                    }
                    disabled={!autoPublish}
                    className="text-orange-500 focus:ring-orange-500 rounded"
                  />
                  <span className="font-bold">Tistory</span>
                </label>

                {/* 네이버 체크박스 */}
                <label
                  className={`flex items-center gap-2 text-sm cursor-pointer p-2 rounded transition border ${
                    targetPlatforms.naver
                      ? "bg-white border-green-200 text-green-700"
                      : "bg-gray-100 border-transparent text-gray-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={targetPlatforms.naver}
                    onChange={(e) =>
                      setTargetPlatforms((prev) => ({
                        ...prev,
                        naver: e.target.checked,
                      }))
                    }
                    disabled={!autoPublish}
                    className="text-green-600 focus:ring-green-500 rounded"
                  />
                  <span className="font-bold">Naver</span>
                </label>
              </div>

              <p className="text-xs text-gray-400 mt-1">
                ※ 티스토리는 일일 15회 초과 시 자동으로 예약 발행됩니다.
              </p>
            </div>

            {log && (
              <div
                className={`text-sm mb-3 font-mono p-3 rounded ${
                  log.includes("실패") || log.includes("오류")
                    ? "bg-red-50 text-red-600"
                    : log.includes("🎉") || log.includes("완료")
                    ? "bg-green-50 text-green-600"
                    : "bg-blue-50 text-blue-600"
                }`}
              >
                {log}
              </div>
            )}

            <button
              onClick={handleGenerateAndPublish}
              disabled={isGenerating}
              className={`w-full py-4 text-white font-bold rounded-lg shadow-lg transition flex items-center justify-center gap-2 text-lg ${
                isGenerating
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              }`}
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin">⏳</span> 글 생성 및 발행 중...
                </>
              ) : (
                <>🚀 AI 글 생성 & 즉시 발행</>
              )}
            </button>

            <p className="text-xs text-gray-500 text-center mt-2">
              글 생성 후 자동으로 티스토리에 발행됩니다. (약 30초~1분 소요)
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white p-4 rounded shadow border border-indigo-100">
        <h3 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
          🖼️ 이미지 검색 테스트
        </h3>
        <p className="text-sm text-gray-600 mb-3">
          AI가 추출하는 키워드와 검색 결과를 미리 확인합니다.
        </p>

        <div className="flex gap-4 items-start">
          <button
            onClick={handleTestImage}
            disabled={isTestingImage}
            className={`px-4 py-2 rounded text-sm font-bold text-white transition ${
              isTestingImage
                ? "bg-indigo-300"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {isTestingImage ? "검색 중..." : "🔍 이미지 검색 테스트"}
          </button>

          {testResult && (
            <div className="flex-1 bg-gray-50 p-4 rounded border animate-fade-in-down">
              <div className="mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase">
                  Extracted Keyword
                </p>
                <p className="font-bold text-lg text-indigo-600">
                  {testResult.keyword}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {testResult.imageUrls.length}개 이미지 발견
                </p>
              </div>

              <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto">
                {testResult.imageUrls.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <div className="w-full h-20 bg-gray-200 rounded overflow-hidden">
                      <img
                        src={url}
                        alt={`Result ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://placehold.co/100x80/EEE/999?text=Error";
                        }}
                      />
                    </div>
                    <div className="absolute top-0 left-0 bg-black bg-opacity-60 text-white text-xs px-1 rounded-br">
                      {idx + 1}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="absolute bottom-0 right-0 bg-blue-500 text-white text-xs px-1 rounded-tl opacity-0 group-hover:opacity-100 transition"
                      title="URL 복사"
                    >
                      📋
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WriteConfig;
