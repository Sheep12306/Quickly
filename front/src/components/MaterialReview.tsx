import React, { useMemo, useRef, useState } from "react";
import {
  Upload,
  FileText,
  Sparkles,
  Minus,
  Plus,
  RotateCcw,
  Eye,
  EyeOff,
  ClipboardPaste,
  Timer,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type {
  AIModelConfig,
  MaterialAnalysis,
  MaterialQuestion,
  MaterialQuizProgress,
  MaterialQuizPurpose,
  MaterialQuizResult,
  MaterialQuizSession,
  QuestionType,
  QuestionTypeCounts,
} from "../types";
import { EMPTY_MATERIAL_PROGRESS } from "../types";
import { analyzeMaterial } from "../utils/materialAnalysis";
import {
  MAX_LIBRARY_FILE_BYTES,
  LIBRARY_FILE_ACCEPT,
  isSupportedMaterialFile,
  extractMaterialFile,
} from "../utils/extractMaterial";
import { useI18n } from "../i18n";
import { buildQuizHtml, downloadQuizWord, printQuizPdf } from "../utils/exportQuiz";
import MaterialQuiz from "./MaterialQuiz";

interface MaterialReviewProps {
  modelConfig: AIModelConfig;
  onComplete: (result: MaterialQuizResult, materialName: string) => void;
  onSaveToLibrary?: (name: string, content: string, format?: string) => void | Promise<void>;
  onSaveSession?: (session: MaterialQuizSession) => void | Promise<void>;
  onUpdateSession?: (id: string, progress: MaterialQuizProgress) => void;
}

interface LoadedMaterial {
  name: string;
  content: string;
  source: "file" | "paste";
}

const MAX_AI_CHARS = 20000;

type SelectedTypes = Record<QuestionType, boolean>;

const TYPE_ORDER: QuestionType[] = ["choice", "truefalse", "fill", "short"];

export default function MaterialReview({
  modelConfig,
  onComplete,
  onSaveToLibrary,
  onSaveSession,
  onUpdateSession,
}: MaterialReviewProps) {
  const { t, locale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [material, setMaterial] = useState<LoadedMaterial | null>(null);
  const [analysis, setAnalysis] = useState<MaterialAnalysis | null>(null);
  const [counts, setCounts] = useState<QuestionTypeCounts>({ choice: 0, truefalse: 0, fill: 0, short: 0 });
  const [selectedTypes, setSelectedTypes] = useState<SelectedTypes>({
    choice: true, truefalse: true, fill: true, short: true,
  });
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<MaterialQuestion[] | null>(null);
  const [generatedMode, setGeneratedMode] = useState<"ai" | "simulator" | null>(null);
  const [quizPurpose, setQuizPurpose] = useState<MaterialQuizPurpose>("formative");
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizVersion, setQuizVersion] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [exportWithAnswers, setExportWithAnswers] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  const totalQuestions = useMemo(
    () => TYPE_ORDER.reduce((sum, type) => sum + (selectedTypes[type] ? counts[type] : 0), 0),
    [counts, selectedTypes],
  );

  const typeMeta: Record<QuestionType, { label: string; desc: string }> = {
    choice: { label: t.materialReview.typeChoice, desc: t.materialReview.typeChoiceDesc },
    truefalse: { label: t.materialReview.typeTrueFalse, desc: t.materialReview.typeTrueFalseDesc },
    fill: { label: t.materialReview.typeFill, desc: t.materialReview.typeFillDesc },
    short: { label: t.materialReview.typeShort, desc: t.materialReview.typeShortDesc },
  };

  const purposeOptions: Array<{ id: MaterialQuizPurpose; label: string; desc: string }> = [
    { id: "formative", label: t.materialReview.purposeFormative, desc: t.materialReview.purposeFormativeDesc },
    { id: "exam", label: t.materialReview.purposeExam, desc: t.materialReview.purposeExamDesc },
    { id: "review", label: t.materialReview.purposeReview, desc: t.materialReview.purposeReviewDesc },
  ];

  const loadMaterial = (
    name: string,
    content: string,
    source: LoadedMaterial["source"],
    format = "txt",
  ) => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError(t.materialReview.emptyFile);
      return;
    }
    const result = analyzeMaterial(name, trimmed);
    const recommendedSelected: SelectedTypes = {
      choice: result.recommended.choice > 0,
      truefalse: result.recommended.truefalse > 0,
      fill: result.recommended.fill > 0,
      short: result.recommended.short > 0,
    };
    setMaterial({ name, content: trimmed, source });
    setAnalysis(result);
    setCounts({ ...result.recommended });
    setSelectedTypes(recommendedSelected);
    setGeneratedMode(null);
    setQuizQuestions(null);
    setCurrentSessionId(null);
    setQuizOpen(false);
    setQuizStarted(false);
    setPreviewOpen(false);
    setError(null);

    // Uploading material for review also keeps it in the study library.
    if (onSaveToLibrary) {
      Promise.resolve(onSaveToLibrary(name, trimmed, format)).catch((error) => {
        console.error("Failed to save material to library", error);
      });
    }
  };

  const readFile = async (file: File) => {
    if (!isSupportedMaterialFile(file)) {
      setError(t.library.unsupportedFormat);
      return;
    }
    if (file.size > MAX_LIBRARY_FILE_BYTES) {
      setError(t.library.fileTooLarge);
      return;
    }

    try {
      const extracted = await extractMaterialFile(file);
      loadMaterial(extracted.name, extracted.content, "file", extracted.format);
    } catch (e) {
      console.error("Failed to read material file", e);
      setError(t.library.extractFailed);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const toggleType = (type: QuestionType) => {
    const nextEnabled = !selectedTypes[type];
    setSelectedTypes((prev) => ({ ...prev, [type]: nextEnabled }));
    if (nextEnabled) {
      setCounts((prev) => ({
        ...prev,
        [type]: prev[type] > 0 ? prev[type] : Math.max(1, analysis?.recommended[type] || 1),
      }));
    }
  };

  const adjustCount = (type: QuestionType, delta: number) => {
    setCounts((prev) => ({
      ...prev,
      [type]: Math.min(20, Math.max(1, prev[type] + delta)),
    }));
  };

  const restoreRecommended = () => {
    if (!analysis) return;
    setCounts({ ...analysis.recommended });
    setSelectedTypes({
      choice: analysis.recommended.choice > 0,
      truefalse: analysis.recommended.truefalse > 0,
      fill: analysis.recommended.fill > 0,
      short: analysis.recommended.short > 0,
    });
  };

  const resetMaterial = () => {
    setMaterial(null);
    setAnalysis(null);
    setShowPreview(false);
    setError(null);
    setGeneratedMode(null);
    setQuizQuestions(null);
    setCurrentSessionId(null);
    setQuizOpen(false);
    setQuizStarted(false);
    setPreviewOpen(false);
    setPastedText("");
  };

  const handleGenerate = async () => {
    if (!material) return;
    if (totalQuestions === 0) {
      setError(t.materialReview.atLeastOneType);
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const requestedCounts: QuestionTypeCounts = {
        choice: selectedTypes.choice ? counts.choice : 0,
        truefalse: selectedTypes.truefalse ? counts.truefalse : 0,
        fill: selectedTypes.fill ? counts.fill : 0,
        short: selectedTypes.short ? counts.short : 0,
      };

      const response = await fetch("/api/material-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: material.content,
          fileName: material.name,
          counts: requestedCounts,
          purpose: quizPurpose,
          difficulty: analysis?.difficulty,
          modelConfig: {
            provider: modelConfig.provider,
            apiKey: modelConfig.apiKey,
            apiBase: modelConfig.apiBase,
            model: modelConfig.model,
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "generation failed");
      }

      const data = await response.json();
      const questions: MaterialQuestion[] = Array.isArray(data.questions) ? data.questions : [];
      if (questions.length === 0) throw new Error("empty quiz");

      const sessionId = `mqs-${Date.now()}`;
      const now = new Date().toISOString();
      const session: MaterialQuizSession = {
        id: sessionId,
        materialName: material.name,
        questions,
        createdAt: now,
        updatedAt: now,
        ...EMPTY_MATERIAL_PROGRESS,
      };
      setCurrentSessionId(sessionId);
      void onSaveSession?.(session);
      setQuizQuestions(questions);
      setQuizVersion((prev) => prev + 1);
      setQuizOpen(false);
      setQuizStarted(false);
      setGeneratedMode(data.mode === "simulator" ? "simulator" : "ai");
    } catch (e) {
      console.error("Material quiz generation failed", e);
      setError(t.materialReview.generateError);
    } finally {
      setGenerating(false);
    }
  };

  const difficultyLabel = analysis
    ? analysis.difficulty === "easy"
      ? t.materialReview.difficultyEasy
      : analysis.difficulty === "medium"
        ? t.materialReview.difficultyMedium
        : t.materialReview.difficultyHard
    : "";

  return (
    <div className="space-y-6 text-left" id="material-review-content">
        {/* ── Upload step ── */}
        {!material ? (
          <div className="w-full max-w-3xl mx-auto bg-[#222222] border border-white/5 rounded p-6" id="material-upload-card">
            <div className="flex flex-col items-center text-center gap-3 mb-5">
              <div>
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.materialReview.uploadTitle}</h3>
                <p className="text-[11px] text-[#c3caac]/60 mt-1">{t.materialReview.uploadDesc}</p>
              </div>
              <div className="flex bg-[#1a1c19] border border-white/5 rounded p-0.5">
                <button
                  onClick={() => setInputMode("file")}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${
                    inputMode === "file" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
                  }`}
                >
                  {t.materialReview.chooseFile}
                </button>
                <button
                  onClick={() => setInputMode("paste")}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${
                    inputMode === "paste" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
                  }`}
                >
                  {t.materialReview.pasteTab}
                </button>
              </div>
            </div>

            {inputMode === "file" ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-lg py-14 px-6 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#b8f600] bg-[#b8f600]/5"
                    : "border-white/10 bg-[#1a1c19]/60 hover:border-[#b8f600]/40 hover:bg-[#1a1c19]"
                }`}
                id="material-dropzone"
              >
                <div className="w-14 h-14 rounded-full bg-[#b8f600]/10 border border-[#b8f600]/20 flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-6 h-6 text-[#b8f600]" />
                </div>
                <p className="text-xs font-medium text-[#e3e3de]">{t.materialReview.dragHint}</p>
                <p className="text-[10px] text-white/40 mt-1.5 font-mono">PDF · DOCX · TXT · MD · CSV</p>
                <span className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold rounded transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  {t.materialReview.chooseFile}
                </span>
              </div>
            ) : (
              <div>
                <textarea
                  rows={10}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={t.materialReview.pastePlaceholder}
                  className="w-full bg-[#1a1c19] border border-white/10 rounded px-4 py-3 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] transition-colors resize-y"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] font-mono text-white/30">
                    {pastedText.replace(/\s/g, "").length} {t.materialReview.chars}
                  </span>
                  <button
                    onClick={() => {
                      const firstLine = pastedText.split("\n").map(line => line.trim()).find(Boolean) || "";
                      loadMaterial(
                        firstLine.slice(0, 40) || t.materialReview.pasteTab,
                        pastedText,
                        "paste",
                      );
                    }}
                    disabled={!pastedText.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold rounded transition-colors disabled:opacity-30 cursor-pointer"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    {t.materialReview.usePastedText}
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={LIBRARY_FILE_ACCEPT}
              onChange={handleFileChange}
              className="hidden"
            />

            {error && (
              <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-rose-400 text-center">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Material overview ── */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4" id="material-overview-grid">
              <div className="md:col-span-3 bg-[#222222] border border-white/5 rounded p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded bg-[#b8f600]/10 border border-[#b8f600]/20 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-[#b8f600]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] uppercase font-mono text-white/30 tracking-wider block">
                        {t.materialReview.materialInfo}
                      </span>
                      <h3 className="text-sm font-bold text-[#e3e3de] truncate max-w-[320px]" title={material.name}>
                        {material.name}
                      </h3>
                      <button
                        onClick={() => setShowPreview((prev) => !prev)}
                        className="flex items-center gap-1 text-[10px] text-[#c3caac] hover:text-[#b8f600] transition-colors mt-1"
                      >
                        {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showPreview ? t.materialReview.hidePreview : t.materialReview.previewToggle}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={resetMaterial}
                    className="text-[10px] text-[#c3caac] hover:text-white border border-white/10 hover:border-white/20 rounded px-2.5 py-1.5 transition-colors shrink-0"
                  >
                    {t.materialReview.reupload}
                  </button>
                </div>

                {/* Stat tiles */}
                <div className="grid grid-cols-4 gap-2 mt-5">
                  {[
                    { label: t.materialReview.chars, value: analysis?.charCount || 0 },
                    { label: t.materialReview.sentences, value: analysis?.sentenceCount || 0 },
                    { label: t.materialReview.headings, value: analysis?.headingCount || 0 },
                    { label: t.materialReview.difficulty, value: difficultyLabel },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-[#1a1c19] border border-white/5 rounded px-2.5 py-2">
                      <span className="text-[9px] text-white/35 block font-mono truncate">{stat.label}</span>
                      <span className="text-sm font-bold text-[#e3e3de] font-mono block mt-0.5">{stat.value}</span>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="flex items-center gap-2 mt-4 text-[11px] text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* Suggestion tile */}
              <div className="md:col-span-2 bg-[#222222] border border-[#b8f600]/20 rounded p-5 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] uppercase font-mono text-[#b8f600] tracking-wider block font-bold">
                    {t.materialReview.questionEstimate}
                  </span>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="text-4xl font-extrabold text-[#e3e3de] font-mono leading-none">
                      {analysis?.estimatedTotal || 0}
                    </span>
                    <span className="text-xs text-[#c3caac]/60 mb-0.5">{t.materialReview.questionsUnit}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#c3caac]/70 mt-2">
                    <Timer className="w-3 h-3 text-[#b8f600]" />
                    <span>≈ {analysis?.estimatedMinutes || 0} {t.materialReview.minutesUnit}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5">
                  <span className="text-[9px] text-white/30 uppercase font-mono tracking-wider">
                    {t.materialReview.recommendedMix}
                  </span>
                  <div className="flex items-center gap-1.5 mt-2">
                    {analysis && TYPE_ORDER.filter((type) => analysis.recommended[type] > 0).map((type) => (
                      <span key={type} className="text-[9px] font-mono bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/20 px-1.5 py-0.5 rounded">
                        {typeMeta[type].label} {analysis.recommended[type]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Editable material preview ── */}
            {showPreview && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#1a1c19] border border-white/5 rounded p-4 max-h-64 overflow-y-auto"
              >
                <pre className="text-[10px] leading-relaxed text-[#c3caac]/80 whitespace-pre-wrap font-mono">
                  {material.content}
                </pre>
              </motion.div>
            )}

            {/* ── Question mix config ── */}
            <div className="bg-[#222222] border border-white/5 rounded p-6" id="material-config-card">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#b8f600]" />
                  <h3 className="text-sm font-bold text-[#e3e3de]">{t.materialReview.adjustMix}</h3>
                </div>
                <button
                  onClick={restoreRecommended}
                  className="flex items-center gap-1 text-[10px] text-[#c3caac] hover:text-[#b8f600] transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t.materialReview.restoreRecommended}
                </button>
              </div>
              <p className="text-[10px] text-white/35 font-mono mb-4">
                {t.materialReview.recommendedMix}: {analysis ? TYPE_ORDER.filter((type) => analysis.recommended[type] > 0).map((type) => `${typeMeta[type].label} ${analysis.recommended[type]}`).join(" · ") : "—"}
              </p>

              <div className="mb-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                    {t.materialReview.quizPurpose}
                  </label>
                  <span className="text-[9px] text-white/25">{t.materialReview.purposeHint}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {purposeOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setQuizPurpose(option.id)}
                      className={`px-2.5 py-2 rounded border text-left transition-colors ${
                        quizPurpose === option.id
                          ? "bg-[#b8f600]/10 border-[#b8f600]/30"
                          : "bg-[#1a1c19] border-white/5 hover:border-white/15"
                      }`}
                    >
                      <span className={`text-[10px] font-bold block ${quizPurpose === option.id ? "text-[#b8f600]" : "text-[#e3e3de]"}`}>
                        {option.label}
                      </span>
                      <span className="text-[9px] text-white/35 block mt-0.5 leading-snug">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                {TYPE_ORDER.map((type) => {
                  const enabled = selectedTypes[type];
                  return (
                    <div
                      key={type}
                      className={`flex items-center justify-between gap-3 rounded border px-4 py-3 transition-colors ${
                        enabled ? "bg-[#1a1c19] border-[#b8f600]/25" : "bg-[#1a1c19]/40 border-white/5 opacity-60"
                      }`}
                    >
                      <button
                        onClick={() => toggleType(type)}
                        className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          enabled ? "bg-[#b8f600] border-[#b8f600]" : "border-white/20 bg-transparent"
                        }`}>
                          {enabled && <Check className="w-3 h-3 text-[#141f00]" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="text-xs font-bold text-[#e3e3de] block">{typeMeta[type].label}</span>
                          <span className="text-[10px] text-white/35 block truncate">{typeMeta[type].desc}</span>
                        </span>
                      </button>

                      <div className="flex items-center gap-1 bg-[#121411] border border-white/10 rounded px-1 py-0.5 shrink-0">
                        <button
                          onClick={() => adjustCount(type, -1)}
                          disabled={!enabled || counts[type] <= 1}
                          className="w-6 h-6 flex items-center justify-center rounded text-[#c3caac] hover:text-white hover:bg-[#2A2A2A] transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                          aria-label="decrease"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-mono font-bold text-[#e3e3de]">
                          {enabled ? counts[type] : 0}
                        </span>
                        <button
                          onClick={() => adjustCount(type, 1)}
                          disabled={!enabled || counts[type] >= 20}
                          className="w-6 h-6 flex items-center justify-center rounded text-[#c3caac] hover:text-white hover:bg-[#2A2A2A] transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                          aria-label="increase"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#c3caac]">{t.materialReview.totalQuestions}</span>
                  <span className="text-lg font-extrabold font-mono text-[#b8f600]">{totalQuestions}</span>
                  <span className="text-[10px] text-white/30">{t.materialReview.questionsUnit}</span>
                  {material.content.length > MAX_AI_CHARS && (
                    <span className="text-[9px] text-amber-400/80 font-mono ml-2">{t.materialReview.truncatedTip}</span>
                  )}
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={generating || totalQuestions === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors disabled:opacity-30 cursor-pointer"
                >
                  {generating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-[#141f00]/30 border-t-[#141f00] rounded-full animate-spin" />
                      {t.materialReview.generating}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {t.materialReview.generate}
                    </>
                  )}
                </button>
              </div>
            </div>

            {quizQuestions && (
              <div className="bg-[#222222] border border-[#b8f600]/20 rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#e3e3de]">
                    {quizStarted ? t.materialReview.resumeTitle : t.materialReview.generatedTitle}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {t.materialReview.generatedCount.replace("{count}", String(quizQuestions.length))}
                    {" · "}
                    {quizStarted ? t.materialReview.resumeDesc : t.materialReview.generatedReadyDesc}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[9px] font-mono text-[#b8f600]/80 bg-[#b8f600]/10 border border-[#b8f600]/20 px-1.5 py-0.5 rounded">
                      {generatedMode === "simulator" ? t.materialReview.simulatorMode : t.materialReview.aiMode}
                    </span>
                    <span className="text-[9px] text-white/25">{t.materialReview.exportPdfHint}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <label className="flex items-center gap-1.5 text-[10px] text-[#c3caac] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={exportWithAnswers}
                      onChange={(event) => setExportWithAnswers(event.target.checked)}
                      className="accent-[#b8f600]"
                    />
                    {t.materialReview.includeAnswers}
                  </label>
                  <button
                    onClick={() => {
                      if (!quizQuestions) return;
                      setPreviewHtml(buildQuizHtml({
                        materialName: material?.name || t.materialReview.title,
                        questions: quizQuestions,
                        includeAnswers: exportWithAnswers,
                        locale: locale === "en-US" ? "en" : "zh",
                        purpose: quizPurpose,
                      }));
                      setPreviewOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#b8f600]/30 text-[10px] font-bold text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    {t.materialReview.previewPaper}
                  </button>
                  <button
                    onClick={() => {
                      if (!quizQuestions) return;
                      downloadQuizWord({
                        materialName: material?.name || t.materialReview.title,
                        questions: quizQuestions,
                        includeAnswers: exportWithAnswers,
                        locale: locale === "en-US" ? "en" : "zh",
                        purpose: quizPurpose,
                      });
                    }}
                    className="px-2.5 py-1.5 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
                  >
                    {t.materialReview.exportWord}
                  </button>
                  <button
                    onClick={() => {
                      if (!quizQuestions) return;
                      printQuizPdf({
                        materialName: material?.name || t.materialReview.title,
                        questions: quizQuestions,
                        includeAnswers: exportWithAnswers,
                        locale: locale === "en-US" ? "en" : "zh",
                        purpose: quizPurpose,
                      });
                    }}
                    className="px-2.5 py-1.5 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
                  >
                    {t.materialReview.exportPdf}
                  </button>
                  <button
                    onClick={() => {
                      setQuizStarted(true);
                      setQuizOpen(true);
                    }}
                    className="px-3 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold transition-colors"
                  >
                    {quizStarted ? t.materialReview.resumeQuiz : t.materialReview.startQuiz}
                  </button>
                  <button
                    onClick={() => {
                      setQuizQuestions(null);
                      setCurrentSessionId(null);
                      setQuizOpen(false);
                      setQuizStarted(false);
                      setGeneratedMode(null);
                    }}
                    className="px-2 py-1.5 text-[10px] text-white/30 hover:text-rose-400 transition-colors"
                  >
                    {t.materialReview.discardQuiz}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      {/* ── Active material quiz ── */}
      {quizQuestions && (
        <React.Fragment key={`material-quiz-${quizVersion}`}>
          <MaterialQuiz
            open={quizOpen}
            materialName={material?.name || t.materialReview.title}
            purpose={quizPurpose}
            questions={quizQuestions}
            onProgressChange={(progress) => {
              if (currentSessionId) onUpdateSession?.(currentSessionId, progress);
            }}
            onClose={() => setQuizOpen(false)}
            onComplete={(result) => onComplete(result, material?.name || t.materialReview.title)}
          />
        </React.Fragment>
      )}

      <AnimatePresence>
        {previewOpen && quizQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setPreviewOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-5xl h-[90vh] bg-[#222222] border border-white/10 rounded shadow-2xl flex flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-3.5 border-b border-[#434933]/30 flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#e3e3de] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#b8f600]" />
                    {t.materialReview.previewTitle}
                  </h3>
                  <p className="text-[10px] text-white/35 mt-0.5 truncate">
                    {material?.name} · {t.materialReview.previewHint}
                  </p>
                </div>
                <button
                  onClick={() => setPreviewOpen(false)}
                  title={t.materialReview.previewClose}
                  className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0 bg-[#e9e9e9] overflow-hidden">
                <iframe
                  title={t.materialReview.previewTitle}
                  srcDoc={previewHtml}
                  sandbox=""
                  className="w-full h-full border-0"
                />
              </div>

              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2 shrink-0">
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="px-3 py-1.5 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
                >
                  {t.materialReview.previewClose}
                </button>
                <button
                  onClick={() => {
                    setPreviewOpen(false);
                    setQuizStarted(true);
                    setQuizOpen(true);
                  }}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold transition-colors"
                >
                  {quizStarted ? t.materialReview.resumeQuiz : t.materialReview.startQuiz}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
