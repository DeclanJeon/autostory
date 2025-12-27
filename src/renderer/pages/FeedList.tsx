import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftStore } from "../stores/draftStore";
import { useFeedStore } from "../stores/feedStore";
import type { MaterialItem } from "../types/global";

const FeedList: React.FC = () => {
  // UI State
  const [activeTab, setActiveTab] = useState<"rss" | "saved">("rss");
  const [savedMaterials, setSavedMaterials] = useState<MaterialItem[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  // Filter State (로컬에서 즉시 필터링)
  const [days, setDays] = useState(3);
  const [selectedSource, setSelectedSource] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [hidePublished, setHidePublished] = useState(true);

  const navigate = useNavigate();
  const { setSelectedIssues } = useDraftStore();

  // [OPTIMIZATION 1] Global Store 구독
  const {
    feeds,
    isLoading: loadingFeeds,
    fetchFeeds,
    lastUpdated,
  } = useFeedStore();

  // [OPTIMIZATION 2] 초기 진입 시 캐시 확인 후 필요하면 로드
  useEffect(() => {
    if (activeTab === "rss") {
      fetchFeeds(false); // 캐시 있으면 IPC 호출 안 함
    } else {
      loadSavedMaterials();
    }
  }, [activeTab]);

  // Saved Materials 로딩 (기존 방식 유지)
  const loadSavedMaterials = async () => {
    if (!window.electronAPI) return;
    setLoadingMaterials(true);
    try {
      const data = await window.electronAPI.getMaterials();
      setSavedMaterials(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMaterials(false);
    }
  };

  // [OPTIMIZATION 3] 클라이언트 사이드 필터링 (useMemo)
  const filteredFeeds = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return feeds.filter((item) => {
      const itemDate = new Date(item.isoDate);

      // 1. 날짜 조건
      if (itemDate < cutoffDate) return false;

      // 2. 검색어 조건
      if (
        searchTerm &&
        !item.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !item.contentSnippet?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      // 3. 소스 조건
      if (selectedSource !== "All" && item.source !== selectedSource)
        return false;

      // 4. 발행 여부 조건
      if (hidePublished && item.isPublished) return false;

      return true;
    });
  }, [feeds, days, searchTerm, selectedSource, hidePublished]);

  // Source 목록 추출 (Memoization)
  const sources = useMemo(() => {
    return ["All", ...Array.from(new Set(feeds.map((i) => i.source)))];
  }, [feeds]);

  const handleRefresh = () => {
    fetchFeeds(true); // 강제 새로고침
  };

  const toggleSelection = (link: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(link)) newSet.delete(link);
    else newSet.add(link);
    setSelectedItems(newSet);
  };

  const handleCreateDraft = () => {
    const selectedData = filteredFeeds.filter((i) => selectedItems.has(i.link));
    if (selectedData.length === 0) {
      alert("선택된 항목이 없습니다.");
      return;
    }
    // Draft Store 호환 매핑
    const draftIssues = selectedData.map((item) => ({
      ...item,
      description: item.contentSnippet,
    }));

    // @ts-ignore
    setSelectedIssues(draftIssues);
    navigate("/write-config");
  };

  const handleMaterialDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    if (!confirm("삭제하시겠습니까?")) return;

    try {
      await window.electronAPI.deleteMaterial(id);
      loadSavedMaterials();
      const newSet = new Set(selectedItems);
      newSet.delete(id);
      setSelectedItems(newSet);
    } catch (e: any) {
      alert("오류 : " + e.message);
    }
  };

  const handleBatchPublish = async () => {
    if (activeTab !== "saved") return;
    const selectedIds: string[] = Array.from(selectedItems);
    if (selectedIds.length === 0) {
      alert("선택된 항목이 없습니다.");
      return;
    }
    if (!confirm(`${selectedIds.length}개를 일괄 발행하시겠습니까?`)) return;
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.oneClickPublish({
        mode: "queue",
        selectedIds,
      });
      if (result.success) {
        alert("작업이 큐에 등록되었습니다. 대시보드에서 확인하세요.");
        navigate("/");
      } else {
        alert("오류 : " + (result.error || "알 수 없는 오류"));
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  return (
    <div className="p-6 bg-gray-100 h-full flex flex-col text-slate-800">
      <div className="flex justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold flex items-center gap-2 whitespace-nowrap">
          {activeTab === "rss" ? "RSS 피드" : "저장된 자료"}
          {activeTab === "rss" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className={`text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded transition flex items-center gap-1 ${
                  loadingFeeds ? "animate-pulse" : ""
                }`}
                title="새로고침 (RSS 다시 불러오기)"
                disabled={loadingFeeds}
              >
                🔄 {loadingFeeds ? "로딩 중..." : "새로고침"}
              </button>
              {lastUpdated > 0 && !loadingFeeds && (
                <span className="text-xs text-gray-400 font-normal">
                  {new Date(lastUpdated).toLocaleTimeString()} 업데이트됨
                </span>
              )}
            </div>
          )}
        </h2>

        <div className="flex gap-2 flex-1 justify-end items-center">
          {/* 발행된 글 숨기기 */}
          {activeTab === "rss" && (
            <label className="flex items-center gap-2 mr-2 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={hidePublished}
                onChange={(e) => setHidePublished(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              발행된 글 숨기기
            </label>
          )}

          {/* 검색어 */}
          <input
            type="text"
            placeholder="검색어 입력..."
            className="bg-white border px-3 py-2 rounded shadow text-sm focus:outline-blue-500 w-48"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {/* 소스 필터 */}
          <select
            className="bg-white border px-3 py-2 rounded shadow text-sm font-medium focus:outline-none max-w-[150px]"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* 날짜 필터 (클라이언트 사이드) */}
          <div className="flex bg-white rounded shadow overflow-hidden whitespace-nowrap">
            {[1, 3, 7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-2 text-sm font-medium ${
                  days === d
                    ? "bg-blue-600 text-white"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                {d === 30 ? "30일" : `${d}일`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 탭 버튼 */}
      <div className="flex gap-4 mb-4 border-b border-gray-300">
        <button
          onClick={() => {
            setActiveTab("rss");
            setSelectedItems(new Set());
          }}
          className={`pb-2 border-b-2 font-bold ${
            activeTab === "rss"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          RSS 피드 ({feeds.length > 0 ? filteredFeeds.length : 0})
        </button>
        <button
          onClick={() => {
            setActiveTab("saved");
            setSelectedItems(new Set());
          }}
          className={`pb-2 border-b-2 font-bold ${
            activeTab === "saved"
              ? "border-purple-500 text-purple-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          저장된 자료 ({savedMaterials.length})
        </button>
      </div>

      {/* 리스트 영역 */}
      <div className="flex-1 overflow-y-auto pr-2">
        {activeTab === "rss" ? (
          loadingFeeds && feeds.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              RSS 피드 가져오는 중... <br />
            </div>
          ) : filteredFeeds.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              표시할 항목이 없습니다. 필터를 조정하거나 RSS를 추가하세요.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredFeeds.map((item, idx) => {
                const isSelected = selectedItems.has(item.link);
                const isPublished = item.isPublished;
                return (
                  <div
                    key={`${item.link}-${idx}`}
                    onClick={() => !isPublished && toggleSelection(item.link)}
                    className={`p-4 rounded-lg shadow transition border-2 relative overflow-hidden ${
                      isPublished
                        ? "bg-gray-100 border-gray-200 cursor-not-allowed opacity-70"
                        : isSelected
                        ? "border-blue-500 bg-blue-50 cursor-pointer"
                        : "border-white bg-white hover:border-blue-200 cursor-pointer"
                    }`}
                  >
                    {isPublished && (
                      <div className="absolute top-0 right-0 bg-green-500 text-white text-xs px-2 py-1 rounded-bl-lg font-bold z-10">
                        발행됨
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-2">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.link, "_blank");
                        }}
                        title="원문 보기"
                        className={`text-xs font-bold px-2 py-1 rounded cursor-pointer transition-colors ${
                          isPublished
                            ? "bg-gray-200 text-gray-500"
                            : "text-blue-600 bg-blue-100 hover:bg-blue-200"
                        }`}
                      >
                        {item.source} 🔗
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.isoDate).toLocaleString()}
                      </span>
                    </div>
                    <h3
                      className={`text-lg font-bold mb-2 ${
                        isPublished
                          ? "text-gray-500 line-through"
                          : "text-gray-800"
                      }`}
                    >
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {item.contentSnippet}
                    </p>
                  </div>
                );
              })}
            </div>
          )
        ) : loadingMaterials ? (
          <div className="text-center py-20 text-gray-500">로딩 중...</div>
        ) : savedMaterials.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            저장된 자료가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {savedMaterials.map((item) => {
              const isSelected = selectedItems.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelection(item.id)}
                  className={`p-4 rounded-lg shadow cursor-pointer transition border-2 ${
                    isSelected
                      ? "border-purple-500 bg-purple-50"
                      : "border-white bg-white hover:border-purple-200"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        item.type === "link"
                          ? "bg-blue-100 text-blue-700"
                          : item.type === "file"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.type.toUpperCase()}
                    </span>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-gray-400">
                        {new Date(item.addedAt).toLocaleString()}
                      </span>
                      <button
                        onClick={(e) => handleMaterialDelete(item.id, e)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-600 truncate mb-1">
                    {item.value}
                  </p>
                  {item.category && (
                    <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 하단 플로팅 버튼 */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-6 right-6 left-72 bg-gray-800 text-white p-4 rounded-lg shadow-xl flex justify-between items-center animate-slide-up z-50">
          <span className="font-bold text-lg">
            {selectedItems.size}개 선택됨
          </span>
          {activeTab === "rss" ? (
            <button
              onClick={handleCreateDraft}
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded font-bold shadow transition"
            >
              AI 초안 생성
            </button>
          ) : (
            <button
              onClick={handleBatchPublish}
              className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded font-bold shadow transition"
            >
              일괄 발행 큐 등록
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedList;
