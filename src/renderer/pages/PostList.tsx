import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useToastHelpers } from "../components/Toast";
import {
  Zap,
  Home,
  Trash2,
  RefreshCw,
  UploadCloud,
  HomeIcon,
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
  const [searchTerm, setSearchTerm] = useState(""); // [OPTIMIZATION] 검색 필터 추가
  const { showSuccess, showError, showInfo } = useToastHelpers();

  // [NEW] 홈주제 관련 상태
  const [homeThemes, setHomeThemes] = useState<string[]>([]);
  const [isFetchingHomeTheme, setIsFetchingHomeTheme] = useState(false);
  const [suggestedTheme, setSuggestedTheme] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();

    // [NEW] 홈주제 목록 로드
    if (window.electronAPI) {
      window.electronAPI
        .getHomeThemes?.()
        .then((themes) => {
          if (themes) {
            setHomeThemes(themes);
          }
        })
        .catch((err) => {
          console.error("홈주제 목록 로드 실패:", err);
        });
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

  // [NEW] 홈주제 추천 함수 (현재는 Dashboard에서 발행 직전에만 사용)
  const fetchSuggestedHomeTheme = async (title: string, content: string) => {
    if (!title || !content) {
      setSuggestedTheme(null);
      return;
    }

    setIsFetchingHomeTheme(true);
    try {
      const result = await window.electronAPI.getSuggestedHomeTheme({
        title,
        content,
      });

      if (result.success && result.theme) {
        setSuggestedTheme(result.theme);
        showInfo("AI 추천 홈주제", `홈주제 "${result.theme}"을 추천했습니다.`);
      } else {
        setSuggestedTheme(null);
      }
    } catch (error) {
      console.error("홈주제 추천 실패:", error);
      setSuggestedTheme(null);
    } finally {
      setIsFetchingHomeTheme(false);
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // 1. 탭 필터
      const tabMatch =
        activeTab === "published" ? post.isPublished : !post.isPublished;
      if (!tabMatch) return false;

      // 2. 검색어 필터
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
    <div className="p-6 bg-gray-50 h-full flex flex-col">
      <h1 className="text-3xl font-bold mb-6">게시글 관리</h1>

      {/* 상태 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* [NEW] 홈주제 추천 카드 */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg shadow-md border-l-4 border-cyan-200 relative">
          <div className="flex items-center gap-2">
            <HomeIcon size={20} className="text-cyan-700" />
            <div className="flex flex-col">
              <h3 className="font-bold text-cyan-900">AI 추천 홈주제</h3>
              <p className="text-xs text-cyan-700">
                티스토리 발행 시 자동으로 분석되어 선택됩니다
              </p>
            </div>
          </div>

          {/* [NEW] 홈주제 선택 영역 */}
          <div className="mt-2">
            <p className="text-sm text-gray-600 mb-2">현재 추천 주제:</p>
            {isFetchingHomeTheme && (
              <div className="text-xs text-gray-500 animate-pulse">
                AI 분석 중...
              </div>
            )}
            {!isFetchingHomeTheme && suggestedTheme ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="px-3 py-1 bg-cyan-100 text-cyan-900 rounded-full font-bold text-sm animate-pulse">
                  {suggestedTheme}
                </span>
              </div>
            ) : (
              <div className="text-sm text-gray-500 mt-1">
                게시글을 선택하면 자동으로 추천됩니다
              </div>
            )}
          </div>
        </div>

        {/* 사용량 카드 (공통 UI) */}
        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={16} className="text-blue-500" />
            <h3 className="text-gray-600 font-bold">전체 포스트</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-800">{posts.length}</p>
              <p className="text-xs text-gray-500">Total Posts</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {posts.filter((p) => p.isPublished).length}
              </p>
              <p className="text-xs text-gray-500">발행 완료</p>
            </div>
          </div>
        </div>

        {/* 작업 버튼 */}
        <div className="bg-white p-4 rounded-lg shadow-md border-l-4 border-gray-200">
          <h3 className="text-gray-600 font-bold mb-3">빠른 실행</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setIsLinkModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded transition"
            >
              <Trash2 size={18} /> 링크 분석
            </button>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition"
            >
              <UploadCloud size={18} /> 파일 변환
            </button>
            <button
              onClick={loadPosts}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition"
            >
              <RefreshCw size={18} /> 새로고침
            </button>
          </div>
        </div>
      </div>

      {/* 글 목록 */}
      <div className="flex-1 overflow-auto bg-white rounded-lg shadow-md border-l-4 border-gray-300">
        {/* 검색 및 필터 */}
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex gap-3 items-center">
          <div className="flex-1 relative">
            <RefreshCw
              size={16}
              className="text-gray-400 absolute left-3 top-1/2"
            />
            <input
              type="text"
              placeholder="제목 검색..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded focus:outline-blue-500 focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* 탭 버튼 */}
        <div className="flex border-b border-gray-200 px-2">
          <button
            onClick={() => setActiveTab("draft")}
            className={`flex-1 py-3 text-sm font-bold transition ${
              activeTab === "draft"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-200"
            }`}
          >
            작성 중 ({posts.filter((p) => !p.isPublished).length})
          </button>
          <button
            onClick={() => setActiveTab("published")}
            className={`flex-1 py-3 text-sm font-bold transition ${
              activeTab === "published"
                ? "text-green-600 border-b-2 border-green-600"
                : "text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-200"
            }`}
          >
            발행됨 ({posts.filter((p) => p.isPublished).length})
          </button>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center py-10 text-gray-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-blue-500"></div>
              로딩 중...
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <p className="text-lg mb-2">
                {searchTerm
                  ? `"${searchTerm}" 검색 결과가 없습니다.`
                  : activeTab === "draft"
                  ? "작성 중인 글이 없습니다."
                  : "발행된 글이 없습니다."}
              </p>
              <button
                onClick={loadPosts}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                <RefreshCw size={20} className="inline-block mr-2" /> 새로고침
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredPosts.map((post, idx) => (
                <div
                  key={idx}
                  onClick={() => handlePostClick(post)}
                  className="group cursor-pointer hover:bg-gray-50 p-3 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-800 group-hover:text-blue-600 flex items-center justify-between">
                        {post.name}
                        {post.isPublished && (
                          <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            발행완료
                          </span>
                        )}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          {post.category}
                        </span>
                        <span>
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 상세 보기 (선택된 게시글) */}
      {selectedPost && (
        <div className="mt-6 bg-white rounded-lg shadow-md border-l-4 border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
            <div className="flex items-center gap-2">
              <HomeIcon size={24} className="text-blue-500" />
              <div className="flex flex-col">
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedPost.name}
                </h3>
                <p className="text-sm text-gray-500">
                  {selectedPost.category} ·{" "}
                  {new Date(selectedPost.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedPost(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              닫기 ×
            </button>
          </div>

          {/* 본문 미리보기 */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-bold text-gray-700 mb-2">
              본문 미리보기
            </h4>
            <div className="max-h-64 overflow-y-auto">
              <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                {selectedPost.content}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 모달들 */}
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
