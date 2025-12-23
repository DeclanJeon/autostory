import React, { useState, useEffect, useMemo } from "react";
import {
  ExtendedTemplate,
  TemplateType,
  TemplateCategory,
  WritingTone,
} from "../types/global";

/**
 * 템플릿 타입별 라벨 및 아이콘
 */
const TYPE_CONFIG: Record<
  TemplateType,
  { label: string; icon: string; color: string; description: string }
> = {
  layout: {
    label: "레이아웃",
    icon: "📐",
    color: "blue",
    description: "블로그 글의 전체 구조와 스타일을 정의합니다.",
  },
  prompt: {
    label: "프롬프트",
    icon: "📝",
    color: "purple",
    description: "글쓰기 방식과 구성 요소를 지시합니다.",
  },
  persona: {
    label: "페르소나",
    icon: "🎭",
    color: "green",
    description: "글쓴이의 성격과 말투를 정의합니다.",
  },
};

/**
 * 카테고리 라벨
 */
const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  tech: "기술/IT",
  business: "비즈니스",
  lifestyle: "라이프스타일",
  news: "뉴스/시사",
  tutorial: "튜토리얼",
  review: "리뷰",
  general: "일반",
};

/**
 * 톤 라벨
 */
const TONE_LABELS: Record<WritingTone, string> = {
  formal: "격식체",
  casual: "일상체",
  humorous: "유머러스",
  analytical: "분석적",
  enthusiastic: "열정적",
  professional: "전문적",
  friendly: "친근함",
};

const Templates: React.FC = () => {
  // ============================================================
  // State
  // ============================================================
  const [templates, setTemplates] = useState<ExtendedTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<TemplateType | "all">("all");
  const [selectedTemplate, setSelectedTemplate] =
    useState<ExtendedTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // 편집 폼 상태
  const [editForm, setEditForm] = useState<Partial<ExtendedTemplate>>({
    name: "",
    content: "",
    description: "",
    templateType: "layout",
    category: "general",
    tone: "friendly",
    tags: [],
    priority: 50,
  });

  // 프롬프트 생성 모달
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplateType, setNewTemplateType] =
    useState<TemplateType>("prompt");
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);

  // 태그 입력
  const [tagInput, setTagInput] = useState("");

  // ============================================================
  // Effects
  // ============================================================
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    if (window.electronAPI) {
      const list = await window.electronAPI.listTemplates();
      setTemplates(list);
    }
  };

  // ============================================================
  // Computed
  // ============================================================
  const filteredTemplates = useMemo(() => {
    let result = templates;

    // 탭 필터
    if (activeTab !== "all") {
      result = result.filter((t) => t.templateType === activeTab);
    }

    // 검색 필터
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          t.description?.toLowerCase().includes(term) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(term))
      );
    }

    // 정렬: 기본 템플릿 먼저, 그 다음 priority 순
    return result.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (b.priority || 0) - (a.priority || 0);
    });
  }, [templates, activeTab, searchTerm]);

  const templateCounts = useMemo(() => {
    return {
      all: templates.length,
      layout: templates.filter((t) => t.templateType === "layout").length,
      prompt: templates.filter((t) => t.templateType === "prompt").length,
      persona: templates.filter((t) => t.templateType === "persona").length,
    };
  }, [templates]);

  // ============================================================
  // Handlers
  // ============================================================
  const handleCreate = (type: TemplateType = "layout") => {
    setSelectedTemplate(null);
    setEditForm({
      name: "",
      content: getDefaultContent(type),
      description: "",
      templateType: type,
      category: "general",
      tone: "friendly",
      tags: [],
      priority: 50,
    });
    setIsEditing(true);
  };

  const getDefaultContent = (type: TemplateType): string => {
    switch (type) {
      case "layout":
        return `# {{title}}

## 도입부
(독자의 관심을 끄는 도입부)

## 본문
{{content}}

## 마무리
(핵심 요약 및 CTA)

## 태그
(관련 태그)`;

      case "prompt":
        return `# 글쓰기 프롬프트

## 목표
(이 프롬프트의 목적)

## 필수 구성요소
1. 도입부: (설명)
2. 본문: (설명)
3. 결론: (설명)

## 스타일 가이드
- (스타일 지침 1)
- (스타일 지침 2)

## 이미지 태그
[[IMAGE: 키워드]]`;

      case "persona":
        return `# 페르소나

## 역할 정의
(이 페르소나의 역할과 배경)

## 말투 및 어조
- (말투 특징 1)
- (말투 특징 2)

## 글쓰기 특징
- (특징 1)
- (특징 2)

## 피해야 할 표현
- (피해야 할 것)

## 독자 대상
(타겟 독자층)`;

      default:
        return "";
    }
  };

  const handleEdit = (template: ExtendedTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      name: template.name,
      content: template.content,
      description: template.description || "",
      templateType: template.templateType,
      category: template.category || "general",
      tone: template.tone || "friendly",
      tags: template.tags || [],
      priority: template.priority || 50,
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    const template = templates.find((t) => t.id === id);

    if (template?.isDefault) {
      alert("기본 템플릿은 삭제할 수 없습니다.");
      return;
    }

    if (confirm("정말 삭제하시겠습니까?")) {
      await window.electronAPI.deleteTemplate(id);
      loadTemplates();
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null);
        setIsEditing(false);
      }
    }
  };

  const handleSave = async () => {
    if (!editForm.name) {
      alert("이름을 입력해주세요.");
      return;
    }

    const templateData = {
      ...editForm,
      updatedAt: Date.now(),
    };

    if (selectedTemplate) {
      await window.electronAPI.updateTemplate(
        selectedTemplate.id,
        templateData
      );
    } else {
      await window.electronAPI.addTemplate({
        ...templateData,
        isDefault: false,
        createdAt: Date.now(),
      } as Omit<ExtendedTemplate, "id">);
    }

    await loadTemplates();
    setIsEditing(false);
    setSelectedTemplate(null);
  };

  const handleOptimize = async () => {
    if (!editForm.content) return;
    setIsOptimizing(true);
    try {
      const result = await window.electronAPI.optimizeTemplate(
        editForm.content
      );
      if (result.success && result.content) {
        setEditForm((prev) => ({ ...prev, content: result.content! }));
      } else {
        alert("최적화 실패: " + result.error);
      }
    } catch (e) {
      alert("최적화 중 오류 발생");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !editForm.tags?.includes(tagInput.trim())) {
      setEditForm((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()],
      }));
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditForm((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t !== tag),
    }));
  };

  const insertVariable = (variable: string) => {
    setEditForm((prev) => ({
      ...prev,
      content: (prev.content || "") + ` {{${variable}}}`,
    }));
  };

  const handleDuplicate = async (template: ExtendedTemplate) => {
    const duplicated = {
      ...template,
      name: `${template.name} (복사본)`,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    delete (duplicated as any).id;

    await window.electronAPI.addTemplate(duplicated);
    await loadTemplates();
  };

  // ============================================================
  // 프롬프트로 생성
  // ============================================================
  const samplePrompts = [
    {
      title: "기술 심층 분석",
      type: "prompt" as TemplateType,
      prompt:
        "기술 트렌드를 심층 분석하는 프롬프트를 만들어주세요. 문제 정의 → 원인 분석 → 영향 분석 → 해결책 → 시사점 구조로 구성해주세요.",
    },
    {
      title: "IT 전문 기자",
      type: "persona" as TemplateType,
      prompt:
        "IT 전문 기자 페르소나를 만들어주세요. 객관적이고 분석적인 톤으로, 데이터 중심의 글쓰기 스타일을 정의해주세요.",
    },
    {
      title: "리스트형 가이드",
      type: "prompt" as TemplateType,
      prompt:
        "팁이나 방법을 리스트 형태로 정리하는 프롬프트를 만들어주세요. 후킹 도입 → N가지 포인트 → 보너스 팁 → 결론 구조로 구성해주세요.",
    },
    {
      title: "친근한 블로거",
      type: "persona" as TemplateType,
      prompt:
        "친근하고 열정적인 테크 블로거 페르소나를 만들어주세요. 개인 경험을 공유하고 독자와 대화하듯 글을 쓰는 스타일로 정의해주세요.",
    },
  ];

  const handleSelectSamplePrompt = (sample: (typeof samplePrompts)[0]) => {
    setPromptText(sample.prompt);
    setNewTemplateType(sample.type);
    setNewTemplateName(sample.title);
  };

  const handleCreateTemplateFromPrompt = async () => {
    if (!promptText.trim()) {
      alert("프롬프트를 입력해주세요.");
      return;
    }

    if (!newTemplateName) {
      alert("템플릿 이름을 입력해주세요.");
      return;
    }

    setIsGeneratingTemplate(true);

    try {
      // AI로 템플릿 생성
      const result = await window.electronAPI.generateTemplateFromPrompt(
        promptText,
        newTemplateName,
        newTemplateDescription
      );

      if (result.success && result.templateId) {
        // 생성된 템플릿 타입 업데이트
        await window.electronAPI.updateTemplate(result.templateId, {
          templateType: newTemplateType,
          category: "general",
          tone: "friendly",
          tags: [],
          priority: 50,
        });

        alert("템플릿이 생성되었습니다.");
        setShowPromptInput(false);
        setPromptText("");
        setNewTemplateName("");
        setNewTemplateDescription("");
        loadTemplates();
      } else {
        alert("템플릿 생성 실패: " + result.error);
      }
    } catch (error) {
      console.error("Failed to create template:", error);
      alert("템플릿 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="p-6 bg-gray-50 h-full flex flex-col text-slate-800">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">템플릿 관리</h2>
          <p className="text-sm text-gray-500 mt-1">
            레이아웃, 프롬프트, 페르소나를 관리하여 다양한 스타일의 글을
            생성하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPromptInput(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
          >
            ✨ AI로 생성
          </button>
          <div className="relative group">
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
              + 새로 만들기 ▼
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border hidden group-hover:block z-10">
              {(["layout", "prompt", "persona"] as TemplateType[]).map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => handleCreate(type)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span>{TYPE_CONFIG[type].icon}</span>
                    <span>{TYPE_CONFIG[type].label}</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 탭 & 검색 */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex bg-white rounded-lg shadow p-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-md transition font-medium ${
              activeTab === "all"
                ? "bg-gray-800 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            전체 ({templateCounts.all})
          </button>
          {(["layout", "prompt", "persona"] as TemplateType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-4 py-2 rounded-md transition font-medium flex items-center gap-1 ${
                activeTab === type
                  ? `bg-${TYPE_CONFIG[type].color}-600 text-white`
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span>{TYPE_CONFIG[type].icon}</span>
              <span>{TYPE_CONFIG[type].label}</span>
              <span className="text-xs opacity-75">
                ({templateCounts[type]})
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1">
          <input
            type="text"
            placeholder="템플릿 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-xs border rounded-lg px-4 py-2 focus:outline-blue-500"
          />
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex gap-6 flex-1 overflow-hidden">
        {/* 좌측: 템플릿 목록 */}
        <div className="w-1/3 bg-white rounded-lg shadow overflow-hidden flex flex-col">
          <div className="p-3 bg-gray-50 border-b">
            <p className="text-sm text-gray-600">
              {activeTab === "all"
                ? "모든 템플릿"
                : TYPE_CONFIG[activeTab as TemplateType].description}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredTemplates.length === 0 ? (
              <div className="p-6 text-center text-gray-400">
                {searchTerm ? "검색 결과가 없습니다." : "템플릿이 없습니다."}
              </div>
            ) : (
              filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  className={`p-4 border-b hover:bg-gray-50 cursor-pointer transition ${
                    selectedTemplate?.id === t.id
                      ? "bg-blue-50 border-l-4 border-l-blue-500"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedTemplate(t);
                    setIsEditing(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">
                          {TYPE_CONFIG[t.templateType]?.icon || "📄"}
                        </span>
                        <h3 className="font-bold truncate">{t.name}</h3>
                        {t.isDefault && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                            기본
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {t.description}
                      </p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {t.category && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {CATEGORY_LABELS[t.category] || t.category}
                          </span>
                        )}
                        {t.tone && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                            {TONE_LABELS[t.tone] || t.tone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(t);
                      }}
                      className="text-xs bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
                    >
                      편집
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(t);
                      }}
                      className="text-xs bg-blue-100 text-blue-600 px-3 py-1 rounded hover:bg-blue-200"
                    >
                      복제
                    </button>
                    {!t.isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(t.id);
                        }}
                        className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded hover:bg-red-200"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 우측: 상세/편집 */}
        <div className="w-2/3 bg-white rounded-lg shadow flex flex-col overflow-hidden">
          {isEditing ? (
            // 편집 모드
            <div className="flex flex-col h-full p-6 gap-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">
                  {selectedTemplate ? "템플릿 편집" : "새 템플릿 만들기"}
                </h3>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setSelectedTemplate(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    이름 *
                  </label>
                  <input
                    type="text"
                    placeholder="템플릿 이름"
                    className="w-full border p-2 rounded focus:outline-blue-500"
                    value={editForm.name || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">타입</label>
                  <select
                    className="w-full border p-2 rounded focus:outline-blue-500"
                    value={editForm.templateType}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        templateType: e.target.value as TemplateType,
                      })
                    }
                    disabled={selectedTemplate?.isDefault}
                  >
                    <option value="layout">📐 레이아웃</option>
                    <option value="prompt">📝 프롬프트</option>
                    <option value="persona">🎭 페르소나</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">설명</label>
                <input
                  type="text"
                  placeholder="템플릿 설명 (선택)"
                  className="w-full border p-2 rounded focus:outline-blue-500"
                  value={editForm.description || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>

              {/* 메타데이터 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    카테고리
                  </label>
                  <select
                    className="w-full border p-2 rounded focus:outline-blue-500"
                    value={editForm.category || "general"}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        category: e.target.value as TemplateCategory,
                      })
                    }
                  >
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">톤</label>
                  <select
                    className="w-full border p-2 rounded focus:outline-blue-500"
                    value={editForm.tone || "friendly"}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        tone: e.target.value as WritingTone,
                      })
                    }
                  >
                    {Object.entries(TONE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    우선순위
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="w-full border p-2 rounded focus:outline-blue-500"
                    value={editForm.priority || 50}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        priority: parseInt(e.target.value) || 50,
                      })
                    }
                  />
                </div>
              </div>

              {/* 태그 */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  태그 (소재 매칭용)
                </label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {(editForm.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="태그 입력 후 추가"
                    className="flex-1 border p-2 rounded text-sm focus:outline-blue-500"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), handleAddTag())
                    }
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  >
                    추가
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  예: 기술, IT, AI, 개발, 프로그래밍 (원클릭 발행 시 소재와
                  매칭됩니다)
                </p>
              </div>

              {/* 변수 삽입 */}
              <div className="flex gap-2 text-sm items-center">
                <span className="text-gray-500">변수 삽입:</span>
                {["title", "content", "category", "date"].map((v) => (
                  <button
                    key={v}
                    onClick={() => insertVariable(v)}
                    className="bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 text-blue-600 font-mono"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={handleOptimize}
                  disabled={isOptimizing}
                  className={`text-xs px-3 py-1 rounded border flex items-center gap-1 ${
                    isOptimizing
                      ? "bg-gray-100 text-gray-400"
                      : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                  }`}
                >
                  {isOptimizing ? "최적화 중..." : "✨ AI 최적화"}
                </button>
              </div>

              {/* 콘텐츠 에디터 */}
              <div className="flex-1 min-h-[300px]">
                <textarea
                  className="w-full h-full border p-4 rounded font-mono text-sm resize-none focus:outline-blue-500"
                  placeholder="템플릿 내용을 입력하세요..."
                  value={editForm.content || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, content: e.target.value })
                  }
                />
              </div>

              {/* 저장 버튼 */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setSelectedTemplate(null);
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  저장
                </button>
              </div>
            </div>
          ) : selectedTemplate ? (
            // 상세 보기
            <div className="h-full flex flex-col">
              <div className="p-6 border-b">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">
                    {TYPE_CONFIG[selectedTemplate.templateType]?.icon}
                  </span>
                  <h3 className="text-xl font-bold">{selectedTemplate.name}</h3>
                  {selectedTemplate.isDefault && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                      기본 템플릿
                    </span>
                  )}
                </div>
                <p className="text-gray-500">{selectedTemplate.description}</p>

                <div className="flex gap-2 mt-3 flex-wrap">
                  <span
                    className={`text-xs px-2 py-1 rounded bg-${
                      TYPE_CONFIG[selectedTemplate.templateType].color
                    }-100 text-${
                      TYPE_CONFIG[selectedTemplate.templateType].color
                    }-700`}
                  >
                    {TYPE_CONFIG[selectedTemplate.templateType].label}
                  </span>
                  {selectedTemplate.category && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {CATEGORY_LABELS[selectedTemplate.category]}
                    </span>
                  )}
                  {selectedTemplate.tone && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                      {TONE_LABELS[selectedTemplate.tone]}
                    </span>
                  )}
                  {selectedTemplate.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded">
                  {selectedTemplate.content}
                </pre>
              </div>

              <div className="p-4 border-t flex justify-end gap-2">
                <button
                  onClick={() => handleDuplicate(selectedTemplate)}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  복제
                </button>
                <button
                  onClick={() => handleEdit(selectedTemplate)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  편집
                </button>
              </div>
            </div>
          ) : (
            // 선택 안됨
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-5xl mb-4">📋</p>
                <p>왼쪽에서 템플릿을 선택하세요.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI 생성 모달 */}
      {showPromptInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-3/4 max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-bold">✨ AI로 템플릿 생성</h2>
              <button
                onClick={() => {
                  setShowPromptInput(false);
                  setPromptText("");
                  setNewTemplateName("");
                  setNewTemplateDescription("");
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* 좌측: 샘플 프롬프트 */}
              <div className="w-1/3 border-r overflow-y-auto p-4 bg-gray-50">
                <h3 className="font-semibold mb-3">📚 샘플 프롬프트</h3>
                <p className="text-xs text-gray-500 mb-3">
                  클릭하여 시작점으로 사용하세요
                </p>

                {samplePrompts.map((sample, index) => (
                  <div
                    key={index}
                    className="mb-3 p-3 bg-white rounded-lg border cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition"
                    onClick={() => handleSelectSamplePrompt(sample)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{TYPE_CONFIG[sample.type].icon}</span>
                      <h4 className="font-medium text-sm">{sample.title}</h4>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {sample.prompt}
                    </p>
                  </div>
                ))}
              </div>

              {/* 우측: 입력 폼 */}
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      생성할 템플릿 타입
                    </label>
                    <div className="flex gap-2">
                      {(["prompt", "persona", "layout"] as TemplateType[]).map(
                        (type) => (
                          <button
                            key={type}
                            onClick={() => setNewTemplateType(type)}
                            className={`flex-1 p-3 rounded-lg border-2 transition ${
                              newTemplateType === type
                                ? `border-${TYPE_CONFIG[type].color}-500 bg-${TYPE_CONFIG[type].color}-50`
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <span className="text-xl">
                              {TYPE_CONFIG[type].icon}
                            </span>
                            <p className="font-medium mt-1">
                              {TYPE_CONFIG[type].label}
                            </p>
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      프롬프트 입력 *
                    </label>
                    <textarea
                      className="w-full border p-3 rounded-lg font-mono text-sm resize-none focus:outline-purple-500 h-32"
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      placeholder="어떤 템플릿을 만들고 싶은지 설명해주세요..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        템플릿 이름 *
                      </label>
                      <input
                        type="text"
                        className="w-full border p-2 rounded-lg focus:outline-purple-500"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="예: 기술 분석 프롬프트"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        설명 (선택)
                      </label>
                      <input
                        type="text"
                        className="w-full border p-2 rounded-lg focus:outline-purple-500"
                        value={newTemplateDescription}
                        onChange={(e) =>
                          setNewTemplateDescription(e.target.value)
                        }
                        placeholder="템플릿 설명"
                      />
                    </div>
                  </div>
                </div>

                {isGeneratingTemplate && (
                  <div className="mt-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
                    <p className="mt-4 text-gray-600">
                      AI가 템플릿을 생성하고 있습니다...
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowPromptInput(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                disabled={isGeneratingTemplate}
              >
                취소
              </button>
              <button
                onClick={handleCreateTemplateFromPrompt}
                className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={
                  !promptText.trim() || !newTemplateName || isGeneratingTemplate
                }
              >
                {isGeneratingTemplate ? "생성 중..." : "✨ 생성하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Templates;
