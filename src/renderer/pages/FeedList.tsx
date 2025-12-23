import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftStore } from "../stores/draftStore"; // 스토어 임포트

interface FeedItem {
  title: string;
  link: string;
  source: string;
  isoDate: string;
  contentSnippet: string;
}

const FeedList: React.FC = () => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(3); // 기본 3일
  const [selectedSource, setSelectedSource] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // [추가] 스토어 훅 사용
  const { setSelectedIssues } = useDraftStore();

  useEffect(() => {
    loadFeeds(false);
  }, [days]);

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

      {/* 리스트 영역 */}
      <div className="flex-1 overflow-y-auto pr-2">
        {loading ? (
          <div className="text-center py-20 text-gray-500">
            RSS 데이터를 분석하고 있습니다... <br />
            (네트워크 상태에 따라 시간이 소요될 수 있습니다)
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            표시할 뉴스가 없습니다. 설정에서 RSS URL을 확인해주세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredItems.map((item, idx) => {
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
                        window.open(item.link, '_blank');
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
          </div>
        )}
      </div>

      {/* 하단 플로팅 액션 바 */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-6 right-6 left-72 bg-gray-800 text-white p-4 rounded-lg shadow-xl flex justify-between items-center animate-slide-up">
          <span className="font-bold text-lg">
            {selectedItems.size}개의 이슈 선택됨
          </span>
          <button
            onClick={handleCreateDraft}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded font-bold shadow transition"
          >
            AI 글쓰기 시작하기 →
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedList;
