import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useToastHelpers } from "../components/Toast";
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
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(""); // [OPTIMIZATION] 검색 필터 추가
  const { showSuccess, showError, showInfo } = useToastHelpers();

  // [NEW] 발행 플랫폼 선택 상태
  const [targetPlatforms, setTargetPlatforms] = useState({
    tistory: true,
    naver: false,
  });

  useEffect(() => {
    loadPosts();
    // 설정값 불러와서 초기 상태 설정
    if (window.electronAPI) {
      window.electronAPI.getSettings().then((settings) => {
        setTargetPlatforms({
          tistory: true, // 티스토리는 항상 기본값
          naver: settings.naverEnabled && !!settings.naverBlogId,
        });
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

  // [수정] 다중 발행 핸들러
  const handleMultiPublish = async (filePath: string, category: string) => {
    if (!window.electronAPI) return;

    const platforms = [];
    if (targetPlatforms.tistory) platforms.push("tistory");
    if (targetPlatforms.naver) platforms.push("naver");

    if (platforms.length === 0) {
      showError("발행할 플랫폼을 하나 이상 선택해주세요.");
      return;
    }

    if (
      !confirm(`선택한 플랫폼([${platforms.join(", ")}])에 발행하시겠습니까?`)
    )
      return;

    setIsPublishing(true);
    showInfo("발행 시작", "브라우저를 제어하여 글을 발행합니다...");

    try {
      const result = await window.electronAPI.publishPostMulti({
        filePath,
        platforms,
        category,
      });

      if (result.success) {
        const results = result.results;
        let msg = "결과:\n";
        if (results?.tistory) msg += "✅ 티스토리 성공\n";
        if (results?.naver) msg += "✅ 네이버 성공\n";

        if (results?.errors && results.errors.length > 0) {
          msg += "\n⚠️ 일부 오류:\n" + results.errors.join("\n");
          showError("부분 완료", msg);
        } else {
          showSuccess("발행 완료!", msg);
        }
        loadPosts();
      } else {
        showError("발행 실패", result.error || "알 수 없는 오류");
      }
    } catch (error: any) {
      showError("오류", error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleBack = () => {
    setSelectedPost(null);
  };

  // [OPTIMIZATION] 필터링 로직 최적화 (검색어 포함)
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

  const handleDelete = useCallback(
    async (filePath: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.electronAPI) return;
      if (!confirm("정말 삭제하시겠습니까? 복구할 수 없습니다.")) return;

      try {
        await window.electronAPI.deletePost(filePath);
        showSuccess("삭제되었습니다.");
        loadPosts();
        setSelectedPost((prev) => (prev?.path === filePath ? null : prev));
      } catch (e: any) {
        showError(e.message);
      }
    },
    []
  );

  return (
    <div className="p-6 bg-gray-50 h-full flex flex-col text-slate-800">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        {selectedPost ? (
          <>
            <button
              onClick={handleBack}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← 뒤로가기
            </button>
            <span className="truncate flex-1">{selectedPost.name}</span>

            <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
              <label className="flex items-center gap-1 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={targetPlatforms.tistory}
                  onChange={(e) =>
                    setTargetPlatforms((prev) => ({
                      ...prev,
                      tistory: e.target.checked,
                    }))
                  }
                  className="rounded text-orange-500 focus:ring-orange-500"
                />
                티스토리
              </label>
              <div className="w-px h-4 bg-gray-300"></div>
              <label className="flex items-center gap-1 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={targetPlatforms.naver}
                  onChange={(e) =>
                    setTargetPlatforms((prev) => ({
                      ...prev,
                      naver: e.target.checked,
                    }))
                  }
                  className="rounded text-green-500 focus:ring-green-500"
                />
                네이버
              </label>
              <button
                onClick={() =>
                  handleMultiPublish(selectedPost.path, selectedPost.category)
                }
                disabled={isPublishing}
                className={`ml-2 text-sm px-4 py-1.5 rounded text-white font-bold transition flex items-center gap-2 ${
                  isPublishing
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow"
                }`}
              >
                {isPublishing ? (
                  <>
                    <span className="animate-spin text-xs">⏳</span> 발행 중...
                  </>
                ) : (
                  "발행하기"
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            포스트 목록
            <div className="ml-auto flex gap-2 items-center">
              <input
                type="text"
                placeholder="제목 검색..."
                className="text-sm border rounded px-3 py-1.5 w-48 focus:outline-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button
                onClick={() => setIsLinkModalOpen(true)}
                className="text-sm bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded shadow"
              >
                🔗 링크 변환
              </button>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded shadow"
              >
                📂 파일 변환
              </button>
              <button
                onClick={loadPosts}
                className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded"
                title="새로고침"
              >
                🔄
              </button>
            </div>
          </>
        )}
      </h2>

      {!selectedPost && (
        <div className="flex gap-1 mb-3 border-b border-gray-300">
          <button
            onClick={() => setActiveTab("draft")}
            className={`px-5 py-2 font-bold text-sm rounded-t-lg transition-colors ${
              activeTab === "draft"
                ? "bg-white text-blue-600 border-t border-l border-r border-gray-300 -mb-[1px]"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            작성 중{" "}
            <span className="ml-1 px-1.5 py-0.5 bg-gray-200 rounded-full text-xs">
              {posts.filter((p) => !p.isPublished).length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("published")}
            className={`px-5 py-2 font-bold text-sm rounded-t-lg transition-colors ${
              activeTab === "published"
                ? "bg-white text-green-600 border-t border-l border-r border-gray-300 -mb-[1px]"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            발행됨{" "}
            <span className="ml-1 px-1.5 py-0.5 bg-gray-200 rounded-full text-xs">
              {posts.filter((p) => p.isPublished).length}
            </span>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden bg-white rounded-b-lg rounded-tr-lg shadow border border-gray-300 flex">
        {selectedPost ? (
          <div className="flex-1 p-6 overflow-y-auto font-mono text-sm whitespace-pre-wrap">
            {selectedPost.content}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-20 text-gray-400">로딩 중...</div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                {searchTerm
                  ? "검색 결과가 없습니다."
                  : activeTab === "draft"
                  ? "작성 중인 글이 없습니다."
                  : "발행된 글이 없습니다."}
              </div>
            ) : (
              <div className="divide-y">
                {filteredPosts.map((post, idx) => (
                  <div
                    key={idx}
                    onClick={() => handlePostClick(post)}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition flex justify-between items-center group"
                  >
                    <div>
                      <h4 className="font-bold text-gray-800 flex items-center gap-2">
                        {post.name}
                        {post.isPublished && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            발행완료
                          </span>
                        )}
                      </h4>
                      <div className="flex gap-2 text-xs text-gray-500 mt-1">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          {post.category}
                        </span>
                        <span>{new Date(post.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => handleDelete(post.path, e)}
                        className="hidden group-hover:block text-red-500 hover:bg-red-50 p-2 rounded transition"
                        title="삭제"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => {
          loadPosts();
          showSuccess("파일 분석 및 글 생성이 완료되었습니다.");
        }}
      />

      <LinkInputModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onSuccess={() => {
          loadPosts();
          showSuccess("링크 분석 및 글 생성이 완료되었습니다.");
        }}
      />
    </div>
  );
};

export default PostList;
