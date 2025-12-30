import React, { useState, useEffect, useMemo } from "react";
import {
  ExtendedTemplate,
  TemplateType,
  TemplateCategory,
  WritingTone,
} from "../types/global";
import {
  Layout,
  MessageSquare,
  User,
  Search,
  Plus,
  Copy,
  Trash2,
  Save,
  Sparkles,
  Wand2,
  Tag,
  Share2,
  Check,
  X,
  MoreVertical,
} from "lucide-react";

const TYPE_CONFIG: Record<
  TemplateType,
  { label: string; icon: any; color: string; description: string }
> = {
  layout: {
    label: "레이아웃",
    icon: Layout,
    color: "blue",
    description: "블로그 글의 전체 구조와 스타일을 정의합니다.",
  },
  prompt: {
    label: "프롬프트",
    icon: MessageSquare,
    color: "purple",
    description: "글쓰기 방식과 구성 요소를 지시합니다.",
  },
  persona: {
    label: "페르소나",
    icon: User,
    color: "green",
    description: "글쓴이의 성격과 말투를 정의합니다.",
  },
};

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  tech: "기술/IT",
  business: "비즈니스",
  lifestyle: "라이프스타일",
  news: "뉴스/시사",
  tutorial: "튜토리얼",
  review: "리뷰",
  general: "일반",
};

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
  const [templates, setTemplates] = useState<ExtendedTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<TemplateType | "all">("all");
  const [selectedTemplate, setSelectedTemplate] =
    useState<ExtendedTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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

  const [showPromptInput, setShowPromptInput] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplateType, setNewTemplateType] =
    useState<TemplateType>("prompt");
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    if (window.electronAPI) {
      const list = await window.electronAPI.listTemplates();
      setTemplates(list);
    }
  };

  const filteredTemplates = useMemo(() => {
    let result = templates;
    if (activeTab !== "all") {
      result = result.filter((t) => t.templateType === activeTab);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          t.description?.toLowerCase().includes(term) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(term))
      );
    }
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
        return `# {{title}}\n\n## 도입부\n(독자의 관심을 끄는 도입부)\n\n## 본문\n{{content}}\n\n## 마무리\n(핵심 요약 및 CTA)\n\n## 태그\n(관련 태그)`;
      case "prompt":
        return `# 글쓰기 프롬프트\n\n## 목표\n(이 프롬프트의 목적)\n\n## 필수 구성요소\n1. 도입부: (설명)\n2. 본문: (설명)\n3. 결론: (설명)\n\n## 스타일 가이드\n- (스타일 지침 1)\n- (스타일 지침 2)\n\n## 이미지 태그\n[[IMAGE: 키워드]]`;
      case "persona":
        return `# 페르소나\n\n## 역할 정의\n(이 페르소나의 역할과 배경)\n\n## 말투 및 어조\n- (말투 특징 1)\n- (말투 특징 2)\n\n## 글쓰기 특징\n- (특징 1)\n- (특징 2)\n\n## 피해야 할 표현\n- (피해야 할 것)\n\n## 독자 대상\n(타겟 독자층)`;
      default:
        return "";
    }
  };

  const handleEdit = (template: ExtendedTemplate) => {
    setSelectedTemplate(template);
    setEditForm({ ...template, tags: template.tags || [] });
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    if (window.electronAPI) {
      await window.electronAPI.deleteTemplate(id);
      loadTemplates();
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null);
        setIsEditing(false);
      }
    }
  };

  const handleSave = async () => {
    if (!editForm.name) return alert("이름을 입력해주세요.");

    const templateData = { ...editForm, updatedAt: Date.now() };

    if (window.electronAPI) {
      if (selectedTemplate) {
        // @ts-ignore
        await window.electronAPI.updateTemplate(
          selectedTemplate.id,
          templateData
        );
      } else {
        // @ts-ignore
        await window.electronAPI.addTemplate({
          ...templateData,
          isDefault: false,
          createdAt: Date.now(),
        });
      }
      await loadTemplates();
      setIsEditing(false);
      setSelectedTemplate(null);
    }
  };

  const handleOptimize = async () => {
    if (!editForm.content) return;
    setIsOptimizing(true);
    try {
      const result = await window.electronAPI?.optimizeTemplate(
        editForm.content
      );
      if (result?.success && result.content) {
        setEditForm((prev) => ({ ...prev, content: result.content! }));
      } else {
        alert("최적화 실패: " + result?.error);
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

  const handleDuplicate = async (template: ExtendedTemplate) => {
    const duplicated = {
      ...template,
      name: `${template.name} (Copy)`,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    // @ts-ignore
    delete duplicated.id;
    // @ts-ignore
    await window.electronAPI.addTemplate(duplicated);
    await loadTemplates();
  };

  const handleCreateTemplateFromPrompt = async () => {
    if (!promptText.trim() || !newTemplateName)
      return alert("필수 정보를 입력하세요.");
    setIsGeneratingTemplate(true);
    try {
      const result = await window.electronAPI?.generateTemplateFromPrompt(
        promptText,
        newTemplateName,
        newTemplateDescription
      );
      if (result?.success && result.templateId) {
        await window.electronAPI?.updateTemplate(result.templateId, {
          templateType: newTemplateType,
          category: "general",
          tone: "friendly",
          tags: [],
          priority: 50,
        });
        alert("템플릿이 생성되었습니다.");
        setShowPromptInput(false);
        loadTemplates();
      } else {
        alert("생성 실패: " + result?.error);
      }
    } catch (error) {
      console.error(error);
      alert("오류 발생");
    } finally {
      setIsGeneratingTemplate(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-8 gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3">
            <Sparkles size={28} className="text-emerald-500" />
            Templates
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            다양한 스타일의 템플릿으로 글쓰기 품질을 높이세요.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowPromptInput(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl transition shadow-lg flex items-center gap-2 font-bold"
          >
            <Wand2 size={18} />
            AI 생성
          </button>
          <div className="relative group">
            <button className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl transition shadow-lg flex items-center gap-2 font-bold">
              <Plus size={18} />새 템플릿
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl hidden group-hover:block z-20 overflow-hidden">
              {(["layout", "prompt", "persona"] as TemplateType[]).map(
                (type) => {
                  const Icon = TYPE_CONFIG[type].icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleCreate(type)}
                      className="w-full px-4 py-3 text-left hover:bg-slate-700 flex items-center gap-3 text-slate-200 transition"
                    >
                      <Icon
                        size={16}
                        className={`text-${TYPE_CONFIG[type].color}-400`}
                      />
                      {TYPE_CONFIG[type].label}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 bg-slate-800/50 p-2 rounded-xl border border-slate-700 backdrop-blur">
        <div className="flex gap-1 bg-slate-900/50 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${
              activeTab === "all"
                ? "bg-slate-700 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            전체 ({templateCounts.all})
          </button>
          {(["layout", "prompt", "persona"] as TemplateType[]).map((type) => {
            const Icon = TYPE_CONFIG[type].icon;
            const isActive = activeTab === type;
            return (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-2 ${
                  isActive
                    ? `bg-${TYPE_CONFIG[type].color}-500/20 text-${TYPE_CONFIG[type].color}-300`
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon size={14} />
                {TYPE_CONFIG[type].label}
                <span className="opacity-50 text-xs ml-1">
                  ({templateCounts[type]})
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            placeholder="템플릿 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-6 flex-1 overflow-hidden">
        {/* List */}
        <div className="w-1/3 bg-slate-800/30 backdrop-blur border border-slate-700 rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-700 bg-slate-800/50">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {activeTab === "all"
                ? "All Templates"
                : TYPE_CONFIG[activeTab as TemplateType].label}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <Layout size={32} className="opacity-20 mb-2" />
                <span className="text-sm">템플릿이 없습니다.</span>
              </div>
            ) : (
              filteredTemplates.map((t) => {
                const Icon = TYPE_CONFIG[t.templateType].icon;
                const isSelected = selectedTemplate?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTemplate(t);
                      setIsEditing(false);
                    }}
                    className={`group p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-900/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                        : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg ${
                            isSelected
                              ? "bg-blue-500 text-white"
                              : "bg-slate-700 text-slate-400 group-hover:bg-slate-600 group-hover:text-white"
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        {t.isDefault && (
                          <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/30">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(t);
                          }}
                          className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white"
                        >
                          <Share2 size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(t);
                          }}
                          className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white"
                        >
                          <Copy size={12} />
                        </button>
                        {!t.isDefault && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(t.id);
                            }}
                            className="p-1 hover:bg-red-900/50 rounded text-slate-400 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <h3
                      className={`font-bold truncate mb-1 ${
                        isSelected ? "text-blue-100" : "text-slate-200"
                      }`}
                    >
                      {t.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                      {t.description || "설명 없음"}
                    </p>
                    <div className="flex gap-2 text-[10px] text-slate-500">
                      <span className="bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-700">
                        {t.category}
                      </span>
                      <span className="bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-700">
                        {t.tone}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="w-2/3 bg-slate-800/30 backdrop-blur border border-slate-700 rounded-2xl flex flex-col overflow-hidden relative">
          {!isEditing && !selectedTemplate && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
              <Layout size={64} className="opacity-10 mb-4" />
              <p className="text-lg font-medium">
                템플릿을 선택하거나 새로 만드세요.
              </p>
            </div>
          )}

          {isEditing ? (
            <div className="flex flex-col h-full bg-slate-900/50">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900">
                <h3 className="font-bold text-white flex items-center gap-2">
                  {selectedTemplate ? <Share2 size={18} /> : <Plus size={18} />}
                  {selectedTemplate ? "템플릿 편집" : "새 템플릿 생성"}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-bold text-white flex items-center gap-1"
                  >
                    {isOptimizing ? (
                      <Wand2 className="animate-spin" size={12} />
                    ) : (
                      <Wand2 size={12} />
                    )}
                    AI 최적화
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-xs font-bold text-white flex items-center gap-1"
                  >
                    <Save size={12} /> 저장
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300"
                  >
                    취소
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-1 block">
                      이름
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="템플릿 이름"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-1 block">
                      타입
                    </label>
                    <select
                      value={editForm.templateType}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          templateType: e.target.value as any,
                        })
                      }
                      disabled={selectedTemplate?.isDefault}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none appearance-none"
                    >
                      <option value="layout">Layout</option>
                      <option value="prompt">Prompt</option>
                      <option value="persona">Persona</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 mb-1 block">
                    설명
                  </label>
                  <input
                    type="text"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                    placeholder="템플릿에 대한 간단한 설명"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-1 block">
                      Category
                    </label>
                    <select
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          category: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-1 block">
                      Tone
                    </label>
                    <select
                      value={editForm.tone}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          tone: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                    >
                      {Object.entries(TONE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 mb-1 block">
                      Priority
                    </label>
                    <input
                      type="number"
                      value={editForm.priority}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          priority: parseInt(e.target.value),
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 mb-1 block">
                    콘텐츠 (Markdown)
                  </label>
                  <textarea
                    value={editForm.content}
                    onChange={(e) =>
                      setEditForm({ ...editForm, content: e.target.value })
                    }
                    className="w-full h-64 bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-sm text-slate-300 focus:border-blue-500 outline-none resize-none leading-relaxed"
                    placeholder="# 템플릿 내용을 작성하세요..."
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 mb-1 block">
                    태그
                  </label>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {editForm.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="bg-blue-900/30 text-blue-300 px-2 py-1 rounded text-xs border border-blue-800/50 flex items-center gap-1"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-400"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white"
                        placeholder="태그 추가 (Enter)"
                      />
                    </div>
                    <button
                      onClick={handleAddTag}
                      className="bg-slate-700 px-4 rounded-lg text-sm text-white hover:bg-slate-600"
                    >
                      추가
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            selectedTemplate && (
              <div className="flex flex-col h-full bg-white text-slate-800 overflow-y-auto">
                {/* Read Only Preview Mode */}
                <div className="p-6 bg-slate-50 border-b border-gray-200 sticky top-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-1">
                        {selectedTemplate.name}
                      </h2>
                      <p className="text-gray-500 text-sm">
                        {selectedTemplate.description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleEdit(selectedTemplate)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow hover:bg-blue-700 flex items-center gap-2"
                    >
                      <Edit3 size={16} /> 편집
                    </button>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <span className="px-2 py-1 bg-white border rounded text-xs font-medium text-gray-600">
                      {CATEGORY_LABELS[selectedTemplate.category || "general"]}
                    </span>
                    <span className="px-2 py-1 bg-white border rounded text-xs font-medium text-gray-600">
                      {TONE_LABELS[selectedTemplate.tone || "friendly"]}
                    </span>
                    <span className="px-2 py-1 bg-white border rounded text-xs font-medium text-gray-600">
                      P-{selectedTemplate.priority}
                    </span>
                  </div>
                </div>
                <div className="p-8 prose prose-slate max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700">
                    {selectedTemplate.content}
                  </pre>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {showPromptInput && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-950 border-b border-slate-800">
              <h3 className="text-xl font-bold text-white mb-1">
                AI 템플릿 생성
              </h3>
              <p className="text-sm text-slate-400">
                원하는 템플릿의 내용을 설명하면 AI가 자동으로 생성합니다.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white"
                  placeholder="예: IT 뉴스 분석기"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  프롬프트 (요구사항)
                </label>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className="w-full h-32 bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white resize-none"
                  placeholder="예: 최신 IT 뉴스를 3줄 요약하고, 비즈니스 관점에서 분석하는 페르소나를 만들어줘. 톤은 전문적이면서도 날카롭게."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowPromptInput(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  취소
                </button>
                <button
                  onClick={handleCreateTemplateFromPrompt}
                  disabled={isGeneratingTemplate}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2"
                >
                  {isGeneratingTemplate ? (
                    <Wand2 className="animate-spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {isGeneratingTemplate ? "생성 중..." : "생성하기"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Icon for Preview (Since Edit3 is not imported but used in JSX)
import { Edit3 } from "lucide-react";

export default Templates;
