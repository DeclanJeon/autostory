import React, { useEffect, useState } from "react";
import { MaterialItem } from "../types/global";

interface FeedItem {
  title: string;
  link: string;
  source: string;
  isoDate: string;
  contentSnippet: string;
}

interface MaterialSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    selectedItems: { type: "rss" | "post"; id: string }[],
    homeTheme?: string
  ) => void;
  defaultTab?: "rss" | "posts"; // [NEW] 기본 탭 설정
}

const MaterialSelectionModal: React.FC<MaterialSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  defaultTab = "rss", // [NEW] 기본값 "rss"
}) => {
  const [activeTab, setActiveTab] = useState<"rss" | "posts">(defaultTab);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [postListItems, setPostListItems] = useState<MaterialItem[]>([]); // [NEW] PostList의 발행되지 않은 글들
  const [selectedFeedLinks, setSelectedFeedLinks] = useState<Set<string>>(
    new Set()
  );
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(3);
  const [homeThemes, setHomeThemes] = useState<string[]>([]); // [NEW] 홈주제 목록
  const [selectedHomeTheme, setSelectedHomeTheme] = useState<string>(""); // [NEW] 선택된 홈주제

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab); // [NEW] 모달이 열릴 때 기본 탭으로 설정
      loadData();
      loadHomeThemes(); // [NEW] 홈주제 로드
      resetSelection();
    }
  }, [isOpen, defaultTab]); // [NEW] defaultTab 의존성 추가

  useEffect(() => {
    if (isOpen && activeTab === "rss") {
      loadFeeds();
    }
  }, [days]);

  const resetSelection = () => {
    setSelectedFeedLinks(new Set());
    setSelectedPostIds(new Set());
  };

  const loadData = async () => {
    if (activeTab === "rss") {
      await loadFeeds();
    } else {
      // [NEW] 소재 탭에서 두 가지 소스 모두 로드
      setLoading(true);
      try {
        await Promise.all([loadMaterials(), loadPostList()]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };

  const loadFeeds = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.fetchFeeds({
        days,
        forceRefresh: false,
      });
      setFeedItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMaterials = async () => {
    if (!window.electronAPI) return;
    try {
      const data = await window.electronAPI.getMaterials();
      // 아직 처리되지 않은(pending) 소재만 필터링
      const pendingMaterials = data.filter((m) => m.status !== "processed");
      setMaterials(pendingMaterials);
    } catch (e) {
      console.error(e);
    }
  };

  // [NEW] PostList에서 발행되지 않은 글들을 로드하여 MaterialItem으로 변환
  const loadPostList = async () => {
    if (!window.electronAPI) return;
    try {
      const posts = await window.electronAPI.listPosts();
      // 발행되지 않은(isPublished가 false 또는 undefined) 글들만 필터링
      const unpublishedPosts = posts.filter((p: any) => !p.isPublished);

      // PostFile을 MaterialItem 형식으로 변환
      const postMaterials: MaterialItem[] = unpublishedPosts.map(
        (post: any) => ({
          id: post.path, // 경로를 ID로 사용
          type: "post", // [NEW] 게시글 타입
          value: post.path, // 파일 경로
          title: post.name, // 파일명
          category: post.category || "General",
          tags: [],
          addedAt: new Date(post.createdAt || Date.now()).getTime(),
          status: "pending",
        })
      );

      setPostListItems(postMaterials);
    } catch (e) {
      console.error("PostList 로드 실패:", e);
    }
  };

  const handleTabChange = (tab: "rss" | "posts") => {
    setActiveTab(tab);
    loadData();
  };

  const toggleFeedSelection = (link: string) => {
    const newSet = new Set(selectedFeedLinks);
    if (newSet.has(link)) {
      newSet.delete(link);
    } else {
      newSet.add(link);
    }
    setSelectedFeedLinks(newSet);
  };

  const togglePostSelection = (id: string) => {
    const newSet = new Set(selectedPostIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPostIds(newSet);
  };

  const toggleAll = () => {
    if (activeTab === "rss") {
      if (selectedFeedLinks.size === feedItems.length) {
        setSelectedFeedLinks(new Set());
      } else {
        setSelectedFeedLinks(new Set(feedItems.map((f) => f.link)));
      }
    } else {
      const totalPostItems = [...materials, ...postListItems];
      if (selectedPostIds.size === totalPostItems.length) {
        setSelectedPostIds(new Set());
      } else {
        setSelectedPostIds(new Set(totalPostItems.map((m) => m.id)));
      }
    }
  };

  const getSelectedCount = () => {
    return activeTab === "rss" ? selectedFeedLinks.size : selectedPostIds.size;
  };

  // [NEW] 소재 탭에서의 전체 항목 수 계산 (링크 소재 + PostList)
  const getTotalPostCount = () => {
    return materials.length + postListItems.length;
  };

  const loadHomeThemes = async () => {
    if (!window.electronAPI) return;
    try {
      const themes = await window.electronAPI.getHomeThemes();
      if (Array.isArray(themes)) {
        setHomeThemes(themes);
      }
    } catch (e) {
      console.error("홈주제 로드 실패:", e);
    }
  };

  const handleConfirm = () => {
    const totalSelected = selectedFeedLinks.size + selectedPostIds.size;
    if (totalSelected === 0) {
      alert("발행할 항목을 선택해주세요.");
      return;
    }

    const selectedItems = [
      ...Array.from(selectedFeedLinks).map((link) => ({
        type: "rss" as const,
        id: link,
      })),
      ...Array.from(selectedPostIds).map((id) => ({
        type: "post" as const,
        id,
      })),
    ];

    onConfirm(selectedItems, selectedHomeTheme);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[110] backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-200">
        {/* 헤더 */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50 rounded-t-xl">
          <div>
            <h3 className="text-xl font-bold text-gray-800">
              📚 발행 항목 선택
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              RSS 피드 또는 저장된 소재 중 발행할 항목을 선택하세요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            &times;
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="px-5 pt-3 bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={() => handleTabChange("rss")}
              className={`flex-1 py-2 px-4 rounded-t-lg font-bold text-sm transition-colors ${
                activeTab === "rss"
                  ? "bg-white text-blue-600 border-t border-x border-gray-200"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              📡 RSS 피드 ({feedItems.length})
            </button>
            <button
              onClick={() => handleTabChange("posts")}
              className={`flex-1 py-2 px-4 rounded-t-lg font-bold text-sm transition-colors ${
                activeTab === "posts"
                  ? "bg-white text-purple-600 border-t border-x border-gray-200"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              📄 저장된 소재 ({getTotalPostCount()})
            </button>
          </div>
        </div>

        {/* RSS 탭에서만 기간 필터 표시 */}
        {activeTab === "rss" && (
          <div className="px-5 pt-2 pb-0 bg-gray-50">
            <div className="flex gap-2">
              {[3, 7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    days === d
                      ? "bg-blue-500 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {d === 30 ? "1개월" : `${d}일`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 리스트 영역 */}
        <div className="flex-1 overflow-y-auto p-5 bg-white">
          {loading ? (
            <div className="text-center py-10 text-gray-500">로딩 중...</div>
          ) : activeTab === "rss" && feedItems.length === 0 ? (
            <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-lg mb-2">📭</p>
              <p>RSS 피드가 없습니다.</p>
              <p className="text-xs mt-1">
                설정에서 RSS URL을 추가한 후 갱신해보세요.
              </p>
            </div>
          ) : activeTab === "posts" &&
            materials.length === 0 &&
            postListItems.length === 0 ? (
            <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-lg mb-2">📭</p>
              <p>발행할 소재가 없습니다.</p>
              <p className="text-xs mt-1">
                '링크 등록'으로 저장하거나, 파일 업로드로 글을 생성해보세요.
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-2">
                <button
                  onClick={toggleAll}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  {getSelectedCount() === getTotalPostCount()
                    ? "전체 해제"
                    : "전체 선택"}
                </button>
              </div>

              {/* RSS 피드 리스트 */}
              {activeTab === "rss" && (
                <div className="space-y-2">
                  {feedItems.map((item, idx) => {
                    const isSelected = selectedFeedLinks.has(item.link);
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleFeedSelection(item.link)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-100 hover:border-blue-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              isSelected
                                ? "bg-blue-500 border-blue-500"
                                : "border-gray-300 bg-white"
                            }`}
                          >
                            {isSelected && (
                              <span className="text-white text-xs">✓</span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                                {item.source}
                              </span>
                              <h4 className="font-medium text-gray-800 truncate">
                                {item.title}
                              </h4>
                            </div>
                            <p className="text-xs text-gray-500 line-clamp-2">
                              {item.contentSnippet}
                            </p>
                            <div className="text-xs text-gray-400 mt-1">
                              {new Date(item.isoDate).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 저장된 소재 리스트 */}
              {activeTab === "posts" && (
                <div className="space-y-2">
                  {/* 링크 소재 섹션 */}
                  {materials.length > 0 && (
                    <>
                      <div className="text-xs font-bold text-gray-500 mb-2 mt-4">
                        🔗 링크로 저장된 소재 ({materials.length})
                      </div>
                      {materials.map((item) => {
                        const isSelected = selectedPostIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => togglePostSelection(item.id)}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex items-center gap-3 ${
                              isSelected
                                ? "border-purple-500 bg-purple-50"
                                : "border-gray-100 hover:border-purple-200"
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center ${
                                isSelected
                                  ? "bg-purple-500 border-purple-500"
                                  : "border-gray-300 bg-white"
                              }`}
                            >
                              {isSelected && (
                                <span className="text-white text-xs">✓</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-bold ${
                                    item.type === "link"
                                      ? "bg-blue-100 text-blue-700"
                                      : item.type === "file"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {item.type.toUpperCase()}
                                </span>
                                <h4 className="font-medium text-gray-800 truncate">
                                  {item.title}
                                </h4>
                              </div>
                              <p className="text-xs text-gray-500 truncate">
                                {item.value}
                              </p>
                              {item.category && (
                                <span className="inline-block text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded mt-1">
                                  {item.category}
                                </span>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                {new Date(item.addedAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* PostList의 발행되지 않은 글 섹션 */}
                  {postListItems.length > 0 && (
                    <>
                      <div className="text-xs font-bold text-gray-500 mb-2 mt-4">
                        📝 PostList의 발행되지 않은 글 ({postListItems.length})
                      </div>
                      {postListItems.map((item) => {
                        const isSelected = selectedPostIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => togglePostSelection(item.id)}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all flex items-center gap-3 ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-50"
                                : "border-gray-100 hover:border-indigo-200"
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center ${
                                isSelected
                                  ? "bg-indigo-500 border-indigo-500"
                                  : "border-gray-300 bg-white"
                              }`}
                            >
                              {isSelected && (
                                <span className="text-white text-xs">✓</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs px-2 py-0.5 rounded font-bold bg-indigo-100 text-indigo-700">
                                  POST
                                </span>
                                <h4 className="font-medium text-gray-800 truncate">
                                  {item.title}
                                </h4>
                              </div>
                              <p className="text-xs text-gray-500 truncate">
                                {item.value}
                              </p>
                              {item.category && (
                                <span className="inline-block text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded mt-1">
                                  {item.category}
                                </span>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                {new Date(item.addedAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-between items-center">
          <div className="text-sm flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-blue-600">
                {getSelectedCount()}개 선택됨
              </span>
              {(selectedFeedLinks.size > 0 || selectedPostIds.size > 0) && (
                <span className="text-gray-500">
                  {selectedFeedLinks.size > 0 &&
                    `RSS ${selectedFeedLinks.size}`}
                  {selectedFeedLinks.size > 0 &&
                    selectedPostIds.size > 0 &&
                    " + "}
                  {selectedPostIds.size > 0 && `소재 ${selectedPostIds.size}`}
                </span>
              )}
            </div>

            {/* 홈주제 선택 드롭다운 - 티스토리 전용 */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-indigo-600 font-bold text-xs">
                홈주제
                <span className="text-indigo-400 font-normal"> (티스토리)</span>
                :
              </span>
              <select
                value={selectedHomeTheme}
                onChange={(e) => setSelectedHomeTheme(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">(자동 선택)</option>
                {homeThemes.map((theme, idx) => (
                  <option key={idx} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={
                selectedFeedLinks.size === 0 && selectedPostIds.size === 0
              }
              className={`px-6 py-2 rounded-lg font-bold text-white shadow-lg transition ${
                selectedFeedLinks.size === 0 && selectedPostIds.size === 0
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              }`}
            >
              🚀 자동 발행 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaterialSelectionModal;
