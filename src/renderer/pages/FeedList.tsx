import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftStore } from "../stores/draftStore";
import type { MaterialItem } from "../types/global";

interface FeedItem {
  title: string;
  link: string;
  source: string;
  isoDate: string;
  contentSnippet: string;
}

const FeedList: React.FC = () => {
  // [신규] 탭 상태 (RSS vs 저장된 소재)
  const [activeTab, setActiveTab] = useState<"rss" | "saved">("rss");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [savedMaterials, setSavedMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(3); // 기본 3일
  const [selectedSource, setSelectedSource] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // [추가] 스토어 훅 사용
  const { setSelectedIssues } = useDraftStore();

  useEffect(() => {
    if (activeTab === "rss") {
      loadFeeds(false);
    } else {
      loadSavedMaterials();
    }
  }, [activeTab, days]);

  const loadFeeds = async (forceRefresh: boolean = false) => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.fetchFeeds({ days, forceRefresh });
      setItems(data);
    } catch (e) {
      console.error("Feed loading failed", e);
    } finally {
      setLoading(false);
    }
  };

  // [신규] 저장된 소재 목록 로드
  const loadSavedMaterials = async () => {
    if (!window.electronAPI) return;
    try {
      const data = await window.electronAPI.getMaterials();
      setSavedMaterials(data);
    } catch (e) {
      console.error("Failed to load materials:", e);
    }
  };

  // [신규] 소재 삭제 핸들러
  const handleDeleteMaterial = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    if (!confirm("이 소재를 삭제하시겠습니까?")) return;

    try {
      await window.electronAPI.deleteMaterial(id);
      loadSavedMaterials();
      selectedItems.delete(id); // 선택 상태 업데이트
      setSelectedItems(new Set(selectedItems));
    } catch (e: any) {
      alert("삭제 실패: " + e.message);
    }
  };

  // [신규] 선택된 소재 일괄 발행
  const handleBatchPublish = async () => {
    if (activeTab !== "saved") return;

    const selectedIds = Array.from(selectedItems);

    if (selectedIds.length === 0) {
      alert("발행할 소재를 선택해주세요.");
      return;
    }

    if (
      !confirm(`${selectedIds.length}개의 소재를 순차적으로 발행하시겠습니까?`)
    )
      return;

    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.oneClickPublish({
        mode: "queue",
        selectedIds,
      });

      if (result.success) {
        alert(
          "일괄 발행이 시작되었습니다. 대시보드에서 진행 상황을 확인하세요."
        );
        navigate("/");
      } else {
        alert("시작 실패: " + (result.error || "알 수 없는 오류"));
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  const sources = ["All", ...Array.from(new Set(items.map((i) => i.source)))];

  const filteredItems = items.filter((item) => {
    const matchesSource =
      selectedSource === "All" || item.source === selectedSource;
    const matchesKeyword =
      searchTerm === "" ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.contentSnippet.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSource && matchesKeyword;
  });

  const toggleSelection = (link: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(link)) {
      newSet.delete(link);
    } else {
      newSet.add(link);
    }
    setSelectedItems(newSet);
  };

  const handleCreateDraft = () => {
    // 선택된 아이템들만 추려서 스토어에 저장
    const selectedData = items.filter((i) => selectedItems.has(i.link));

    if (selectedData.length === 0) {
      alert("선택된 이슈가 없습니다.");
      return;
    }

    // [수정] Zustand 스토어에 저장 (영속성 보장)
    setSelectedIssues(selectedData);

    // 이동 (state 전달 제거)
    navigate("/write-config");
  };

  const handleMaterialDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    if (!confirm("이 소재를 삭제하시겠습니까?")) return;

    try {
      await window.electronAPI.deleteMaterial(id);
      loadSavedMaterials();
      const newSet = new Set(selectedItems);
      newSet.delete(id);
      setSelectedItems(newSet);
    } catch (e: any) {
      alert("삭제 실패: " + e.message);
    }
  };

  return (
    <div className="p-6 bg-gray-100 h-full flex flex-col text-slate-800">
      <div className="flex justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold flex items-center gap-2 whitespace-nowrap">
          📰 글 소재 발굴
          <button
            onClick={() => loadFeeds(true)}
            className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded transition flex items-center gap-1"
            title="새로고침 (RSS 다시 가져오기)"
          >
            🔄 갱신
          </button>
        </h2>

        <div className="flex gap-2 flex-1 justify-end">
          {/* 검색 필터 */}
          <input
            type="text"
            placeholder="키워드 검색..."
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

          {/* 기간 필터 버튼 */}
          <div className="flex bg-white rounded shadow overflow-hidden whitespace-nowrap">
            {[3, 7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-2 text-sm font-medium ${
                  days === d
                    ? "bg-blue-600 text-white"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                {d === 30 ? "1개월" : `${d}일`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* [신규] 탭 네비게이션 */}
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
          📡 RSS 피드 ({items.length})
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
          💾 저장된 소재 ({savedMaterials.length})
        </button>
      </div>

      {/* 리스트 영역 */}
      <div className="flex-1 overflow-y-auto pr-2">
        {loading ? (
          <div className="text-center py-20 text-gray-500">
            RSS 데이터를 분석하고 있습니다... <br />
            (네트워크 상태에 따라 시간이 소요될 수 있습니다)
          </div>
        ) : activeTab === "rss" && filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            표시할 뉴스가 없습니다. 설정에서 RSS URL을 확인해주세요.
          </div>
        ) : activeTab === "saved" && savedMaterials.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            저장된 소재가 없습니다. 링크 등록에서 소재를 추가해보세요!
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {/* RSS 피드 렌더링 */}
            {activeTab === "rss" &&
              filteredItems.map((item, idx) => {
                const isSelected = selectedItems.has(item.link);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleSelection(item.link)}
                    className={`p-4 rounded-lg shadow cursor-pointer transition border-2 ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-white bg-white hover:border-blue-200"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.link, "_blank");
                        }}
                        title="원문 보기"
                        className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded cursor-pointer hover:bg-blue-200 transition-colors"
                      >
                        {item.source} 🔗
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.isoDate).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {item.contentSnippet}
                    </p>
                  </div>
                );
              })}

            {/* 저장된 소재 렌더링 */}
            {activeTab === "saved" &&
              savedMaterials.map((item) => {
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
                          title="삭제"
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

      {/* 하단 플로팅 액션 바 */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-6 right-6 left-72 bg-gray-800 text-white p-4 rounded-lg shadow-xl flex justify-between items-center animate-slide-up">
          <span className="font-bold text-lg">
            {activeTab === "rss"
              ? `${selectedItems.size}개의 이슈 선택됨`
              : `${selectedItems.size}개의 소재 선택됨`}
          </span>
          {activeTab === "rss" ? (
            <button
              onClick={handleCreateDraft}
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded font-bold shadow transition"
            >
              AI 글쓰기 시작하기 →
            </button>
          ) : (
            <button
              onClick={handleBatchPublish}
              className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded font-bold shadow transition"
            >
              🚀 일괄 자동 발행 시작
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedList;
