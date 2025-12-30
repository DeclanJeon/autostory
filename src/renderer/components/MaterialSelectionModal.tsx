import React, { useEffect, useState } from "react";
import { MaterialItem } from "../types/global";
import {
  X,
  Check,
  Rss,
  FileText,
  Calendar,
  Link as LinkIcon,
  Globe,
  File,
  Filter,
  CheckCircle2,
  Circle,
} from "lucide-react";

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
  defaultTab?: "rss" | "posts";
}

const MaterialSelectionModal: React.FC<MaterialSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  defaultTab = "rss",
}) => {
  const [activeTab, setActiveTab] = useState<"rss" | "posts">(defaultTab);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [postListItems, setPostListItems] = useState<MaterialItem[]>([]);
  const [selectedFeedLinks, setSelectedFeedLinks] = useState<Set<string>>(
    new Set()
  );
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(3);
  const [homeThemes, setHomeThemes] = useState<string[]>([]);
  const [selectedHomeTheme, setSelectedHomeTheme] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      loadData();
      loadHomeThemes();
      resetSelection();
    }
  }, [isOpen, defaultTab]);

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
      const pendingMaterials = data.filter((m) => m.status !== "processed");
      setMaterials(pendingMaterials);
    } catch (e) {
      console.error(e);
    }
  };

  const loadPostList = async () => {
    if (!window.electronAPI) return;
    try {
      const posts = await window.electronAPI.listPosts();
      const unpublishedPosts = posts.filter((p: any) => !p.isPublished);
      const postMaterials: MaterialItem[] = unpublishedPosts.map(
        (post: any) => ({
          id: post.path,
          type: "post",
          value: post.path,
          title: post.name,
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
    if (newSet.has(link)) newSet.delete(link);
    else newSet.add(link);
    setSelectedFeedLinks(newSet);
  };

  const togglePostSelection = (id: string) => {
    const newSet = new Set(selectedPostIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPostIds(newSet);
  };

  const toggleAll = () => {
    if (activeTab === "rss") {
      if (selectedFeedLinks.size === feedItems.length)
        setSelectedFeedLinks(new Set());
      else setSelectedFeedLinks(new Set(feedItems.map((f) => f.link)));
    } else {
      const totalPostItems = [...materials, ...postListItems];
      if (selectedPostIds.size === totalPostItems.length)
        setSelectedPostIds(new Set());
      else setSelectedPostIds(new Set(totalPostItems.map((m) => m.id)));
    }
  };

  const getSelectedCount = () => {
    return activeTab === "rss" ? selectedFeedLinks.size : selectedPostIds.size;
  };

  const getTotalPostCount = () => {
    return materials.length + postListItems.length;
  };

  const loadHomeThemes = async () => {
    if (!window.electronAPI) return;
    try {
      const themes = await window.electronAPI.getHomeThemes();
      if (Array.isArray(themes)) setHomeThemes(themes);
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-slate-950 border-b border-slate-800 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="text-blue-500" />
              발행 항목 선택
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              발행할 RSS 피드나 저장된 소재를 선택해주세요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition bg-slate-800 hover:bg-slate-700 p-2 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900">
          <button
            onClick={() => handleTabChange("rss")}
            className={`flex-1 py-4 text-sm font-bold transition-all relative ${
              activeTab === "rss"
                ? "text-blue-400 bg-slate-800/50"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Rss size={16} />
              RSS 피드{" "}
              <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full text-xs">
                {feedItems.length}
              </span>
            </div>
            {activeTab === "rss" && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500"></div>
            )}
          </button>

          <button
            onClick={() => handleTabChange("posts")}
            className={`flex-1 py-4 text-sm font-bold transition-all relative ${
              activeTab === "posts"
                ? "text-purple-400 bg-slate-800/50"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <FileText size={16} />
              저장된 소재{" "}
              <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full text-xs">
                {getTotalPostCount()}
              </span>
            </div>
            {activeTab === "posts" && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-500"></div>
            )}
          </button>
        </div>

        {/* Toolbar (Filter & Actions) */}
        <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {activeTab === "rss" && (
              <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                {[3, 7, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      days === d
                        ? "bg-blue-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {d === 30 ? "1개월" : `${d}일`}
                  </button>
                ))}
              </div>
            )}
            {activeTab === "posts" && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Filter size={12} />
                유형별 필터: 전체
              </span>
            )}
          </div>

          <button
            onClick={toggleAll}
            className="text-xs font-medium text-slate-400 hover:text-blue-400 flex items-center gap-1 px-2 py-1 hover:bg-slate-800 rounded transition"
          >
            <CheckCircle2 size={14} />
            {getSelectedCount() ===
            (activeTab === "rss" ? feedItems.length : getTotalPostCount())
              ? "전체 해제"
              : "전체 선택"}
          </button>
        </div>

        {/* Content List Area */}
        <div className="flex-1 overflow-y-auto bg-slate-950/50 p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-3">
              <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="text-sm">데이터를 불러오는 중입니다...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* RSS Items */}
              {activeTab === "rss" &&
                feedItems.map((item, idx) => {
                  const isSelected = selectedFeedLinks.has(item.link);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleFeedSelection(item.link)}
                      className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                          : "bg-slate-800/40 border-slate-700 hover:bg-slate-800 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex gap-4">
                        <div
                          className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSelected
                              ? "bg-blue-500 border-blue-500 text-white"
                              : "border-slate-600 group-hover:border-slate-500"
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={4} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-800/50">
                              {item.source}
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar size={10} />
                              {new Date(item.isoDate).toLocaleDateString()}
                            </span>
                          </div>
                          <h3
                            className={`font-bold text-base mb-1 truncate pr-4 ${
                              isSelected ? "text-blue-100" : "text-slate-200"
                            }`}
                          >
                            {item.title}
                          </h3>
                          <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed">
                            {item.contentSnippet}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Post Items */}
              {activeTab === "posts" &&
                [...materials, ...postListItems].map((item) => {
                  const isSelected = selectedPostIds.has(item.id);
                  const isLink = item.type === "link";
                  const isFile = item.type === "file";
                  const isPost = item.type === "post";

                  return (
                    <div
                      key={item.id}
                      onClick={() => togglePostSelection(item.id)}
                      className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-purple-900/20 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                          : "bg-slate-800/40 border-slate-700 hover:bg-slate-800 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex gap-4">
                        <div
                          className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSelected
                              ? "bg-purple-500 border-purple-500 text-white"
                              : "border-slate-600 group-hover:border-slate-500"
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={4} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isLink && (
                              <span className="text-[10px] font-bold text-cyan-300 bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-800/50 flex items-center gap-1">
                                <LinkIcon size={10} /> LINK
                              </span>
                            )}
                            {isFile && (
                              <span className="text-[10px] font-bold text-amber-300 bg-amber-900/40 px-2 py-0.5 rounded border border-amber-800/50 flex items-center gap-1">
                                <File size={10} /> FILE
                              </span>
                            )}
                            {isPost && (
                              <span className="text-[10px] font-bold text-indigo-300 bg-indigo-900/40 px-2 py-0.5 rounded border border-indigo-800/50 flex items-center gap-1">
                                <FileText size={10} /> POST
                              </span>
                            )}

                            <span className="text-xs text-slate-500">
                              {new Date(item.addedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h3
                            className={`font-bold text-base mb-1 truncate pr-4 ${
                              isSelected ? "text-purple-100" : "text-slate-200"
                            }`}
                          >
                            {item.title}
                          </h3>
                          <p className="text-slate-400 text-xs truncate">
                            {item.value}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Empty States */}
              {!loading && activeTab === "rss" && feedItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                  <Rss size={48} className="mb-4 opacity-50" />
                  <p>표시할 RSS 피드가 없습니다.</p>
                </div>
              )}
              {!loading &&
                activeTab === "posts" &&
                getTotalPostCount() === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                    <FileText size={48} className="mb-4 opacity-50" />
                    <p>저장된 소재가 없습니다.</p>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-900 border-t border-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="bg-slate-800 rounded-lg px-4 py-2 border border-slate-700 flex items-center gap-2">
                <span className="text-slate-400 text-xs">선택된 항목:</span>
                <span className="text-blue-400 font-bold text-lg">
                  {getSelectedCount()}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-700 mx-2 hidden md:block"></div>

              {/* Home Theme Dropdown */}
              <div className="flex items-center gap-2 flex-1 md:flex-none">
                <label className="text-slate-400 text-xs whitespace-nowrap">
                  홈주제 (티스토리):
                </label>
                <select
                  value={selectedHomeTheme}
                  onChange={(e) => setSelectedHomeTheme(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-2 outline-none focus:border-blue-500 w-full md:w-48"
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

            <div className="flex gap-3 w-full md:w-auto">
              <button
                onClick={onClose}
                className="flex-1 md:flex-none px-6 py-3 rounded-xl font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
              >
                취소
              </button>
              <button
                onClick={handleConfirm}
                disabled={getSelectedCount() === 0}
                className={`flex-1 md:flex-none px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
                  getSelectedCount() === 0
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 hover:shadow-blue-500/25 hover:scale-105"
                }`}
              >
                <Check size={18} />
                자동 발행 시작
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaterialSelectionModal;
