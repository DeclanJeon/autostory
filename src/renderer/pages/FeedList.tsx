import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftStore } from "../stores/draftStore";
import { useFeedStore } from "../stores/feedStore";
import type { MaterialItem } from "../types/global";
import {
  Rss,
  Search,
  RotateCw,
  Clock,
  ExternalLink,
  Trash2,
  FileText,
  Filter,
  Check,
  Calendar,
  Layers,
  Sparkles,
  Send,
} from "lucide-react";

const FeedList: React.FC = () => {
  // UI State
  const [activeTab, setActiveTab] = useState<"rss" | "saved">("rss");
  const [savedMaterials, setSavedMaterials] = useState<MaterialItem[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  // Filter State
  const [days, setDays] = useState(3);
  const [selectedSource, setSelectedSource] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [hidePublished, setHidePublished] = useState(true);

  const navigate = useNavigate();
  const { setSelectedIssues } = useDraftStore();

  const {
    feeds,
    isLoading: loadingFeeds,
    fetchFeeds,
    lastUpdated,
  } = useFeedStore();

  useEffect(() => {
    if (activeTab === "rss") {
      fetchFeeds(false);
    } else {
      loadSavedMaterials();
    }
  }, [activeTab]);

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

  const filteredFeeds = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return feeds.filter((item) => {
      const itemDate = new Date(item.isoDate);
      if (itemDate < cutoffDate) return false;
      if (
        searchTerm &&
        !item.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !item.contentSnippet?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      if (selectedSource !== "All" && item.source !== selectedSource)
        return false;
      if (hidePublished && item.isPublished) return false;
      return true;
    });
  }, [feeds, days, searchTerm, selectedSource, hidePublished]);

  const sources = useMemo(() => {
    return ["All", ...Array.from(new Set(feeds.map((i) => i.source)))];
  }, [feeds]);

  const handleRefresh = () => {
    fetchFeeds(true);
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
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-8 gap-6 overflow-hidden">
      {/* Header Area */}
      <div className="flex flex-col gap-4 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 flex items-center gap-3">
              <Rss size={28} className="text-blue-500" />
              Content Feeds
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              RSS 피드를 관리하고 포스팅 소재를 선택하세요.
            </p>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => {
                setActiveTab("rss");
                setSelectedItems(new Set());
              }}
              className={`px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === "rss"
                  ? "bg-blue-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Rss size={16} /> RSS 피드
              <span className="bg-slate-900/50 px-2 py-0.5 rounded text-xs ml-1">
                {feeds.length}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab("saved");
                setSelectedItems(new Set());
              }}
              className={`px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === "saved"
                  ? "bg-purple-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers size={16} /> 저장된 소재
              <span className="bg-slate-900/50 px-2 py-0.5 rounded text-xs ml-1">
                {savedMaterials.length}
              </span>
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex flex-wrap items-center gap-4 shadow-sm backdrop-blur-md">
          {/* Refresh Button (RSS) */}
          {activeTab === "rss" && (
            <button
              onClick={handleRefresh}
              className={`p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg border border-slate-600 transition flex items-center gap-2 ${
                loadingFeeds ? "animate-pulse" : ""
              }`}
              disabled={loadingFeeds}
            >
              <RotateCw
                size={16}
                className={loadingFeeds ? "animate-spin" : ""}
              />
              {loadingFeeds ? "갱신 중..." : "새로고침"}
            </button>
          )}

          {/* View Toggle */}
          {activeTab === "rss" && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none px-3 border-r border-slate-700">
              <div
                className={`w-10 h-5 rounded-full p-1 transition-colors ${
                  hidePublished ? "bg-blue-600" : "bg-slate-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={hidePublished}
                  onChange={(e) => setHidePublished(e.target.checked)}
                />
                <div
                  className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
                    hidePublished ? "translate-x-5" : "translate-x-0"
                  }`}
                ></div>
              </div>
              <span>발행됨 숨기기</span>
            </label>
          )}

          {/* Search */}
          <div className="flex-1 relative group">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors"
            />
            <input
              type="text"
              placeholder={
                activeTab === "rss"
                  ? "피드 검색 (제목, 내용, 태그...)"
                  : "소재 검색..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Filters */}
          {activeTab === "rss" && (
            <>
              <div className="relative">
                <Filter
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-8 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 appearance-none"
                >
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex bg-slate-900 rounded-lg border border-slate-700 p-1">
                {[1, 3, 7, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                      days === d
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {d === 30 ? "30일" : `${d}일`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent -mr-2 pr-2">
        {activeTab === "rss" ? (
          loadingFeeds && feeds.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <RotateCw size={48} className="animate-spin mb-4 opacity-50" />
              <p>RSS 피드를 동기화하고 있습니다...</p>
            </div>
          ) : filteredFeeds.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <FileText size={48} className="mb-4 opacity-50" />
              <p>표시할 피드가 없습니다. 필터를 조정해 보세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
              {filteredFeeds.map((item, idx) => {
                const isSelected = selectedItems.has(item.link);
                const isPublished = item.isPublished;

                return (
                  <div
                    key={`${item.link}-${idx}`}
                    onClick={() => !isPublished && toggleSelection(item.link)}
                    className={`group relative flex flex-col p-5 rounded-2xl border transition-all duration-200 ${
                      isPublished
                        ? "bg-slate-800/20 border-slate-800 opacity-50 cursor-not-allowed grayscale"
                        : isSelected
                        ? "bg-blue-900/20 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)] cursor-pointer"
                        : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg cursor-pointer"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isPublished
                              ? "bg-slate-800 text-slate-500 border-slate-700"
                              : "bg-blue-900/30 text-blue-300 border-blue-800/50"
                          }`}
                        >
                          {item.source}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(item.isoDate).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.link, "_blank");
                        }}
                        className="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </div>

                    <h3
                      className={`font-bold text-lg mb-2 leading-snug line-clamp-2 ${
                        isPublished
                          ? "text-slate-500 line-through"
                          : isSelected
                          ? "text-blue-100"
                          : "text-slate-200 group-hover:text-white"
                      }`}
                    >
                      {item.title}
                    </h3>

                    <p className="text-sm text-slate-400 line-clamp-3 mb-4 flex-1">
                      {item.contentSnippet}
                    </p>

                    {/* Status / Checkbox */}
                    <div className="flex justify-between items-center mt-auto pt-3 border-t border-slate-700/50">
                      {isPublished ? (
                        <span className="text-xs font-bold text-green-500 flex items-center gap-1">
                          <Check size={12} /> 발행 완료
                        </span>
                      ) : (
                        <div
                          className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                            isSelected
                              ? "text-blue-400"
                              : "text-slate-500 group-hover:text-slate-300"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-blue-500 border-blue-500"
                                : "border-slate-600 group-hover:border-slate-500"
                            }`}
                          >
                            {isSelected && (
                              <Check
                                size={10}
                                className="text-white"
                                strokeWidth={3}
                              />
                            )}
                          </div>
                          {isSelected ? "선택됨" : "클릭하여 선택"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : // Saved Materials View
        savedMaterials.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Layers size={48} className="mb-4 opacity-50" />
            <p>저장된 소재가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
            {savedMaterials.map((item) => {
              const isSelected = selectedItems.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleSelection(item.id)}
                  className={`group relative p-5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "bg-purple-900/20 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                      : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                        item.type === "link"
                          ? "bg-cyan-900/30 text-cyan-300 border-cyan-800/50"
                          : item.type === "file"
                          ? "bg-emerald-900/30 text-emerald-300 border-emerald-800/50"
                          : "bg-indigo-900/30 text-indigo-300 border-indigo-800/50"
                      }`}
                    >
                      {item.type.toUpperCase()}
                    </span>
                    <div className="flex gap-2">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(item.addedAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => handleMaterialDelete(item.id, e)}
                        className="text-slate-500 hover:text-red-400 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <h3
                    className={`font-bold text-lg mb-2 truncate ${
                      isSelected ? "text-purple-100" : "text-slate-200"
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-400 truncate mb-2">
                    {item.value}
                  </p>

                  {item.category && (
                    <span className="inline-block text-xs bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded border border-slate-600">
                      {item.category}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      {selectedItems.size > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-8 animate-in slide-in-from-bottom-5 z-20 w-fit min-w-[300px] justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">Selected Items</span>
            <span className="font-bold text-xl flex items-center gap-2">
              {selectedItems.size}{" "}
              <span className="text-sm font-normal text-slate-400">
                개 선택됨
              </span>
            </span>
          </div>

          {activeTab === "rss" ? (
            <button
              onClick={handleCreateDraft}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
            >
              <Sparkles size={18} />
              AI 초안 생성
            </button>
          ) : (
            <button
              onClick={handleBatchPublish}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
            >
              <Send size={18} />
              일괄 발행 (큐)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedList;
