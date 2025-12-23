import React, { useState, useEffect } from "react";
import { useToastHelpers } from "../components/Toast"; // Toast 알림 추가
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
  const [selectedPost, setSelectedPost] = useState<{
    name: string;
    content: string;
    path: string;
    category: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false); // 발행 중 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false); // 업로드 모달 상태
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false); // 링크 모달 상태
  const { showSuccess, showError, showInfo } = useToastHelpers();

  useEffect(() => {
    loadPosts();
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

  // [기능 추가] 포스트 삭제
  const handleDelete = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 부모 클릭 이벤트 방지

    if (!window.electronAPI) return;
    if (!confirm("정말 이 글을 삭제하시겠습니까? 복구할 수 없습니다.")) return;

    try {
      await window.electronAPI.deletePost(filePath);
      showSuccess("삭제 완료", "파일이 삭제되었습니다.");
      loadPosts(); // 목록 갱신
      if (selectedPost?.path === filePath) {
        setSelectedPost(null); // 선택된 글이었다면 상세 뷰 닫기
      }
    } catch (e: any) {
      showError("삭제 실패", e.message);
    }
  };

  // [기능 추가] 재발행 핸들러
  const handleRepublish = async (filePath: string, category: string) => {
    if (!window.electronAPI) return;

    if (!confirm("이 글을 티스토리에 발행하시겠습니까?")) return;

    setIsPublishing(true);
    showInfo("발행 시작", "브라우저를 열어 글을 발행합니다...");

    try {
      const result = await window.electronAPI.publishPost(filePath, category);

      if (result.success) {
        showSuccess("발행 성공", "글이 성공적으로 발행되었습니다!");
        loadPosts(); // 목록 갱신 (발행됨 태그 업데이트)
      } else {
        showError(
          "발행 실패",
          result.error || "알 수 없는 오류가 발생했습니다."
        );
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

  return (
    <div className="p-6 bg-gray-50 h-full flex flex-col text-slate-800">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        {selectedPost ? (
          <>
            <button
              onClick={handleBack}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← 목록으로
            </button>
            <span className="truncate flex-1">{selectedPost.name}</span>
            {/* [UI 추가] 상세 화면에서의 발행 버튼 */}
            <button
              onClick={() =>
                handleRepublish(selectedPost.path, selectedPost.category)
              }
              disabled={isPublishing}
              className={`text-sm px-4 py-2 rounded text-white font-bold transition ${
                isPublishing
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              {isPublishing ? "발행 중..." : "🚀 티스토리 발행"}
            </button>
          </>
        ) : (
          <>
            📂 생성된 글 목록
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setIsLinkModalOpen(true)}
                className="text-sm bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded transition flex items-center gap-1 shadow"
                title="링크 내용을 분석하여 글 생성"
              >
                🔗 링크 등록
              </button>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded transition flex items-center gap-1 shadow"
                title="파일 업로드 및 시리즈 생성"
              >
                📄 파일 업로드
              </button>
              <button
                onClick={loadPosts}
                className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded transition flex items-center gap-1"
                title="새로고침"
              >
                🔄 갱신
              </button>
            </div>
          </>
        )}
      </h2>

      <div className="flex-1 overflow-hidden bg-white rounded shadow border flex">
        {selectedPost ? (
          <div className="flex-1 p-6 overflow-y-auto font-mono text-sm whitespace-pre-wrap">
            {selectedPost.content}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-10 text-gray-500">로딩 중...</div>
            ) : posts.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                생성된 글이 없습니다.
              </div>
            ) : (
              <div className="divide-y">
                {posts.map((post, idx) => (
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
                      <span className="text-gray-400 text-sm group-hover:hidden">Example {">"}</span>
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
          showSuccess("시리즈 생성 완료", "파일 분석 및 글 생성이 완료되었습니다.");
        }} 
      />

      <LinkInputModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onSuccess={() => {
          loadPosts();
          showSuccess("글 생성 완료", "링크 분석 및 글 생성이 완료되었습니다.");
        }}
      />
    </div>
  );
};

export default PostList;
