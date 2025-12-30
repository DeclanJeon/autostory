import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useToastHelpers } from "../components/Toast";
import {
  Zap,
  Home,
  Trash2,
  RefreshCw,
  UploadCloud,
  FileText,
  Search,
  CheckCircle2,
  X,
  Link as LinkIcon,
  Eye,
  Edit3,
  Calendar,
  Layers,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import FileUploadModal from "../components/FileUploadModal";
import LinkInputModal from "../components/LinkInputModal";

interface PostFile {
  name: string;
  path: string;
  category: string;
  createdAt: string;
  isPublished?: boolean;
}

const PostList: React.FC = () => {
  const [posts, setPosts] = useState<PostFile[]>([]);
  const [activeTab, setActiveTab] = useState<"draft" | "published">("draft");
  const [selectedPost, setSelectedPost] = useState<{
    name: string;
    content: string;
    path: string;
    category: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { showSuccess, showError, showInfo } = useToastHelpers();
  const [homeThemes, setHomeThemes] = useState<string[]>([]);
  const [postImages, setPostImages] = useState<any[]>([]);

  const loadPostImages = async (postPath: string) => {
    if ((window.electronAPI as any)?.getPostImages) {
      try {
        const images = await (window.electronAPI as any).getPostImages(
          postPath
        );
        setPostImages(images || []);
      } catch (e) {
        console.error("Failed to load images", e);
      }
    }
  };

  useEffect(() => {
    if (selectedPost) {
      loadPostImages(selectedPost.path);
    } else {
      setPostImages([]);
    }
  }, [selectedPost]);

  useEffect(() => {
    loadPosts();
    if (window.electronAPI) {
      window.electronAPI
        .getHomeThemes?.()
        .then((themes) => themes && setHomeThemes(themes))
        .catch((err) => console.error("홈주제 목록 로드 실패:", err));
    }
  }, []);

  const loadPosts = async () => {
    if (window.electronAPI) {
      setLoading(true);
      try {
        const result = await window.electronAPI.listPosts();
        setPosts(result);
      } catch (e) {
        console.error("Failed to load posts", e);
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePostClick = async (post: PostFile) => {
    if (window.electronAPI) {
      try {
        const content = await window.electronAPI.readPost(post.path);
        setSelectedPost({
          name: post.name,
          content,
          path: post.path,
          category: post.category,
        });
      } catch (e) {
        console.error("Failed to read post", e);
      }
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const tabMatch =
        activeTab === "published" ? post.isPublished : !post.isPublished;
      if (!tabMatch) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          post.name.toLowerCase().includes(term) ||
          post.category.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [posts, activeTab, searchTerm]);

  const handleDelete = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    if (!confirm("정말 삭제하시겠습니까? 복구할 수 없습니다.")) return;

    try {
      await window.electronAPI.deletePost(filePath);
      showSuccess("삭제되었습니다.");
      loadPosts();
      setSelectedPost((prev) => (prev?.path === filePath ? null : prev));
    } catch (error: any) {
      showError(error.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-8 gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-3">
            <FileText size={28} className="text-purple-500" />
            Post Manager
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            생성된 문서를 관리하고, 발행 상태를 확인하세요.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setIsLinkModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
          >
            <LinkIcon size={16} /> 링크 소재
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
          >
            <UploadCloud size={16} /> 파일 변환
          </button>
          <button
            onClick={loadPosts}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Stats / Quick Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-shrink-0">
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <h3 className="text-sm text-slate-400 font-medium">전체 문서</h3>
            <p className="text-2xl font-bold text-white mt-1">{posts.length}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300">
            <Layers size={20} />
          </div>
        </div>
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <h3 className="text-sm text-slate-400 font-medium">발행 완료</h3>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {posts.filter((p) => p.isPublished).length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-green-900/30 flex items-center justify-center text-green-400">
            <CheckCircle2 size={20} />
          </div>
        </div>
        <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 p-5 rounded-2xl flex items-center gap-4 relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-indigo-200 font-bold mb-1 flex items-center gap-2">
              <Sparkles size={14} /> AI 홈주제 추천
            </h3>
            <p className="text-xs text-indigo-300/70">
              {homeThemes.length > 0
                ? `${homeThemes.length}개의 주제가 감지되었습니다.`
                : "발행 시 자동으로 분석됩니다."}
            </p>
          </div>
          <Home
            size={64}
            className="absolute -right-4 -bottom-4 text-indigo-500/10"
          />
        </div>
      </div>

      {/* Main Layout: List & Preview */}
      <div className="flex-1 min-h-0 flex gap-6">
        {/* Left: List */}
        <div className="flex-1 bg-slate-800/30 backdrop-blur border border-slate-700 rounded-2xl flex flex-col overflow-hidden">
          {/* Search & Tabs */}
          <div className="p-4 border-b border-slate-700 flex flex-col gap-4">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                placeholder="문서 제목 또는 카테고리 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => {
                  setActiveTab("draft");
                  setSelectedPost(null);
                }}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                  activeTab === "draft"
                    ? "bg-slate-700 text-white shadow"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                작성 중 ({posts.filter((p) => !p.isPublished).length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("published");
                  setSelectedPost(null);
                }}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                  activeTab === "published"
                    ? "bg-green-900/40 text-green-400 shadow"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                발행됨 ({posts.filter((p) => p.isPublished).length})
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <RefreshCw size={24} className="animate-spin mb-2 opacity-50" />
                <span>Loading...</span>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <FileText size={24} className="mb-2 opacity-30" />
                <span className="text-sm">문서가 없습니다.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPosts.map((post, idx) => (
                  <div
                    key={idx}
                    onClick={() => handlePostClick(post)}
                    className={`group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedPost?.path === post.path
                        ? "bg-purple-900/20 border-purple-500/50"
                        : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {post.isPublished && (
                          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">
                            PUB
                          </span>
                        )}
                        <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                          {post.category}
                        </span>
                      </div>
                      <h4
                        className={`text-sm font-bold truncate ${
                          selectedPost?.path === post.path
                            ? "text-white"
                            : "text-slate-300 group-hover:text-white"
                        }`}
                      >
                        {post.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                        <Calendar size={10} />
                        {new Date(post.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDelete(post.path, e)}
                      className="p-2 text-slate-600 hover:text-red-400 hover:bg-slate-700 rounded transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Preview (Conditional) */}
        {selectedPost ? (
          <div className="w-[45%] bg-white rounded-2xl border border-slate-700 flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-200">
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">
                    {selectedPost.category}
                  </span>
                </div>
                <h2 className="text-gray-900 font-bold text-lg leading-tight">
                  {selectedPost.name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              <div className="prose prose-sm max-w-none text-slate-800">
                <div className="whitespace-pre-wrap font-sans">
                  {selectedPost.content}
                </div>
              </div>
            </div>
            {/* Images Section */}
            <div className="p-4 bg-gray-50 border-t border-slate-200 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ImageIcon size={16} /> Attached Images
                </h3>
                <label className="cursor-pointer text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-md transition flex items-center gap-1">
                  <UploadCloud size={12} /> Add Image
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={async (e) => {
                      if (
                        e.target.files &&
                        e.target.files.length > 0 &&
                        selectedPost
                      ) {
                        const api = window.electronAPI as any;
                        if (api?.uploadPostImage) {
                          const files = Array.from(e.target.files);
                          for (const file of files) {
                            const fileObj = file as any;
                            try {
                              const filePath = api.getFilePath
                                ? api.getFilePath(fileObj)
                                : fileObj.path;
                              await api.uploadPostImage(
                                selectedPost.path,
                                filePath
                              );
                            } catch (err) {
                              console.error(err);
                            }
                          }
                          showSuccess("Images uploaded");
                          loadPostImages(selectedPost.path);
                        }
                      }
                    }}
                  />
                </label>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 min-h-[80px]">
                {postImages.length === 0 ? (
                  <div className="w-full text-center text-xs text-gray-400 py-4 border-2 border-dashed border-gray-200 rounded-lg">
                    No images attached. Drag & drop or upload content related
                    images here.
                  </div>
                ) : (
                  postImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative group min-w-[80px] w-20 h-20 rounded-md overflow-hidden border border-gray-200 bg-white"
                    >
                      <img
                        src={`file://${img.path}`}
                        alt={img.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm("Delete this image?")) {
                            await (window.electronAPI as any).deletePostImage(
                              selectedPost.path,
                              img.name
                            );
                            loadPostImages(selectedPost.path);
                          }
                        }}
                        className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 size={10} />
                      </button>
                      {/* Keyword Tooltip */}
                      {img.keywords && img.keywords.length > 0 && (
                        <div className="absolute bottom-0 left-0 w-full bg-black/60 text-[8px] text-white p-0.5 truncate text-center">
                          {img.keywords[0]}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="px-4 pb-2 bg-gray-50 flex justify-end">
              <span className="text-xs text-gray-400 flex items-center">
                <Eye size={12} className="mr-1" /> Preview Mode
              </span>
            </div>
          </div>
        ) : (
          <div className="w-[45%] bg-slate-800/20 border border-slate-700/50 rounded-2xl flex flex-col items-center justify-center text-slate-600 border-dashed">
            <FileText size={48} className="mb-4 opacity-20" />
            <p>문서를 선택하여 내용을 미리보세요.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => {
          showSuccess("변환 완료");
          loadPosts();
        }}
      />

      <LinkInputModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onSuccess={() => {
          showSuccess("링크 분석 완료");
          loadPosts();
        }}
      />
    </div>
  );
};

export default PostList;
