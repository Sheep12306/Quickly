import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  CheckCircle,
  XCircle,
  Award,
  Timer,
  ChevronRight,
  Sparkles,
  PenLine,
  ListChecks,
  ToggleLeft,
  AlignLeft,
  Download,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type {
  BloomLevel,
  MaterialQuestion,
  MaterialQuizProgress,
  MaterialQuizPurpose,
  MaterialQuizResult,
  QuestionType,
} from "../types";
import { useI18n } from "../i18n";
import { downloadQuizWord, printQuizPdf } from "../utils/exportQuiz";

interface MaterialQuizProps {
  materialName: string;
  questions: MaterialQuestion[];
  purpose?: MaterialQuizPurpose;
  open?: boolean;
  initialProgress?: MaterialQuizProgress | null;
  onProgressChange?: (progress: MaterialQuizProgress) => void;
  onClose: () => void;
  onComplete: (result: MaterialQuizResult) => void;
}

type SelfGrade = 0 | 0.5 | 1;

const EMPTY_BREAKDOWN: Record<QuestionType, number> = {
  choice: 0,
  truefalse: 0,
  fill: 0,
  short: 0,
};

const BLOOM_ORDER: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、；：""''（）()\[\]【】,.;:!?"'\-_/\\]/g, "");
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function MaterialQuiz({
  materialName,
  questions,
  purpose,
  open = true,
  initialProgress,
  onProgressChange,
  onClose,
  onComplete,
}: MaterialQuizProps) {
  const { t, locale } = useI18n();
  const initialIndex = Math.min(
    Math.max(initialProgress?.currentIndex ?? 0, 0),
    Math.max(0, questions.length - 1),
  );

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [graded, setGraded] = useState(Boolean(initialProgress?.graded));
  const [finished, setFinished] = useState(Boolean(initialProgress?.finished));
  const [choiceSelected, setChoiceSelected] = useState<number | null>(initialProgress?.choiceSelected ?? null);
  const [boolSelected, setBoolSelected] = useState<boolean | null>(initialProgress?.boolSelected ?? null);
  const [fillInput, setFillInput] = useState(initialProgress?.fillInput ?? "");
  const [shortInput, setShortInput] = useState(initialProgress?.shortInput ?? "");
  const [selfGrade, setSelfGrade] = useState<SelfGrade | null>((initialProgress?.selfGrade as SelfGrade | null) ?? null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [score, setScore] = useState(initialProgress?.score ?? 0);
  const [correctByType, setCorrectByType] = useState<Record<QuestionType, number>>(
    initialProgress?.correctByType ?? EMPTY_BREAKDOWN,
  );
  const [seconds, setSeconds] = useState(initialProgress?.seconds ?? 0);
  const [result, setResult] = useState<MaterialQuizResult | null>(initialProgress?.completedResult ?? null);
  const [exportWithAnswers, setExportWithAnswers] = useState(true);
  const completedRef = useRef(Boolean(initialProgress?.finished));

  // Real-time timer, paused while minimized or after finishing.
  React.useEffect(() => {
    if (!open || finished) return;
    const interval = setInterval(() => setSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [open, finished]);

  const totalByType = useMemo(() => {
    const totals: Record<QuestionType, number> = { ...EMPTY_BREAKDOWN };
    for (const question of questions) totals[question.type] += 1;
    return totals;
  }, [questions]);

  const levelCounts = useMemo(() => {
    const counts: Record<BloomLevel, number> = {
      remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0,
    };
    for (const question of questions) {
      counts[question.cognitiveLevel || "understand"] += 1;
    }
    return counts;
  }, [questions]);

  useEffect(() => {
    onProgressChange?.({
      currentIndex,
      graded,
      finished,
      choiceSelected,
      boolSelected,
      fillInput,
      shortInput,
      selfGrade,
      score,
      correctByType,
      seconds,
      completedResult: result,
    });
  }, [currentIndex, graded, finished, choiceSelected, boolSelected, fillInput, shortInput, selfGrade, score, correctByType, seconds, result]);

  const currentQuestion = questions[currentIndex];
  const total = questions.length;

  if (total === 0) return null;
  if (!open) return null;

  const typeLabel = (type: QuestionType): string => {
    switch (type) {
      case "choice":
        return t.materialReview.typeChoice;
      case "truefalse":
        return t.materialReview.typeTrueFalse;
      case "fill":
        return t.materialReview.typeFill;
      default:
        return t.materialReview.typeShort;
    }
  };

  const typeIcon = (type: QuestionType) => {
    switch (type) {
      case "choice":
        return <ListChecks className="w-3.5 h-3.5" />;
      case "truefalse":
        return <ToggleLeft className="w-3.5 h-3.5" />;
      case "fill":
        return <PenLine className="w-3.5 h-3.5" />;
      default:
        return <AlignLeft className="w-3.5 h-3.5" />;
    }
  };

  const typeBadgeClass = (type: QuestionType): string => {
    switch (type) {
      case "choice":
        return "bg-[#b8f600]/10 text-[#b8f600] border-[#b8f600]/20";
      case "truefalse":
        return "bg-amber-400/10 text-amber-400 border-amber-400/20";
      case "fill":
        return "bg-sky-400/10 text-sky-400 border-sky-400/20";
      default:
        return "bg-violet-400/10 text-violet-400 border-violet-400/20";
    }
  };

  const levelLabel = (level?: BloomLevel): string => {
    switch (level) {
      case "remember":
        return t.materialQuiz.levelRemember;
      case "apply":
        return t.materialQuiz.levelApply;
      case "analyze":
        return t.materialQuiz.levelAnalyze;
      case "evaluate":
        return t.materialQuiz.levelEvaluate;
      case "create":
        return t.materialQuiz.levelCreate;
      default:
        return t.materialQuiz.levelUnderstand;
    }
  };

  const levelBadgeClass = (level?: BloomLevel): string => {
    switch (level) {
      case "remember":
        return "bg-slate-400/10 text-slate-300 border-slate-400/20";
      case "apply":
        return "bg-sky-400/10 text-sky-400 border-sky-400/20";
      case "analyze":
        return "bg-violet-400/10 text-violet-400 border-violet-400/20";
      case "evaluate":
        return "bg-rose-400/10 text-rose-400 border-rose-400/20";
      case "create":
        return "bg-amber-400/10 text-amber-300 border-amber-400/20";
      default:
        return "bg-emerald-400/10 text-emerald-400 border-emerald-400/20";
    }
  };

  const playSound = (type: "correct" | "incorrect" | "victory") => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "correct") {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === "incorrect") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch {
      // Audio is optional; ignore blocked AudioContext.
    }
  };

  const awardCredit = (type: QuestionType, credit: number) => {
    setScore((prev) => prev + credit);
    setCorrectByType((prev) => ({ ...prev, [type]: prev[type] + credit }));
  };

  const handleChoiceSelect = (index: number) => {
    if (graded || !currentQuestion) return;
    const isCorrect = index === currentQuestion.correctIndex;
    setChoiceSelected(index);
    setGraded(true);
    awardCredit("choice", isCorrect ? 1 : 0);
    playSound(isCorrect ? "correct" : "incorrect");
  };

  const handleBoolSelect = (value: boolean) => {
    if (graded || !currentQuestion) return;
    const isCorrect = value === currentQuestion.correctBool;
    setBoolSelected(value);
    setGraded(true);
    awardCredit("truefalse", isCorrect ? 1 : 0);
    playSound(isCorrect ? "correct" : "incorrect");
  };

  const handleFillSubmit = () => {
    if (graded || !currentQuestion) return;
    if (!fillInput.trim()) {
      setInputError(t.materialQuiz.emptyAnswer);
      return;
    }
    setInputError(null);
    const normalized = normalizeAnswer(fillInput);
    const answers = (currentQuestion.acceptableAnswers || []).map(normalizeAnswer).filter(Boolean);
    const isCorrect = answers.some((answer) => normalized === answer);
    setGraded(true);
    awardCredit("fill", isCorrect ? 1 : 0);
    playSound(isCorrect ? "correct" : "incorrect");
  };

  const handleShortSubmit = () => {
    if (graded || !currentQuestion) return;
    if (!shortInput.trim()) {
      setInputError(t.materialQuiz.emptyAnswer);
      return;
    }
    setInputError(null);
    setGraded(true);
  };

  const handleSelfGrade = (grade: SelfGrade) => {
    if (selfGrade !== null) return;
    setSelfGrade(grade);
    awardCredit("short", grade);
    playSound(grade === 1 ? "correct" : grade === 0 ? "incorrect" : "correct");
  };

  const finishQuiz = () => {
    const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
    const breakdown = (Object.keys(totalByType) as QuestionType[]).reduce((acc, type) => {
      acc[type] = { correct: correctByType[type], total: totalByType[type] };
      return acc;
    }, {} as MaterialQuizResult["breakdown"]);

    const completed: MaterialQuizResult = { score, total, accuracy, breakdown };
    setFinished(true);
    setResult(completed);
    playSound("victory");
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete(completed);
    }
  };

  const handleNext = () => {
    if (!graded) return;
    if (currentQuestion.type === "short" && selfGrade === null) return;
    if (currentIndex + 1 >= total) {
      finishQuiz();
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    setGraded(false);
    setChoiceSelected(null);
    setBoolSelected(null);
    setFillInput("");
    setShortInput("");
    setSelfGrade(null);
    setInputError(null);
  };

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
  const canProceed =
    graded && (currentQuestion?.type !== "short" || selfGrade !== null);

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center p-4 z-50 overflow-y-auto" id="material-quiz-overlay">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl bg-[#222222] border border-white/5 rounded overflow-hidden shadow-2xl relative"
        id="material-quiz-card"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#1a1c19]/50 border-b border-[#434933]/30 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-[#b8f600] animate-pulse shrink-0" />
            <h3 className="font-bold text-[#e3e3de] text-sm truncate" title={materialName}>
              {materialName}
            </h3>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#121411] rounded text-xs font-mono text-[#c3caac]/80 border border-white/5">
              <Timer className="w-3.5 h-3.5 text-[#b8f600]" />
              <span>{formatTime(seconds)}</span>
            </div>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/90 p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {finished ? (
            /* ── Results ── */
            <div className="text-center py-4" id="material-quiz-results">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#b8f600]/10 border-2 border-[#b8f600] text-[#b8f600] mb-6 shadow-xl shadow-[#b8f600]/5">
                <Award className="w-10 h-10" />
              </div>

              <h2 className="text-xl font-bold text-[#e3e3de] tracking-tight">
                {t.materialQuiz.resultsTitle}
              </h2>
              <p className="text-[#c3caac]/75 text-xs mt-2 max-w-sm mx-auto">
                {t.materialQuiz.resultsDesc.replace("{name}", materialName)}
              </p>

              <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto my-6">
                <div className="bg-[#121411] border border-white/5 p-4 rounded text-left">
                  <span className="text-[10px] text-white/40 block font-mono">{t.materialQuiz.overall}</span>
                  <span className="text-3xl font-extrabold text-[#b8f600] font-mono block mt-1">{accuracy}%</span>
                </div>
                <div className="bg-[#121411] border border-white/5 p-4 rounded text-left">
                  <span className="text-[10px] text-white/40 block font-mono">{t.materialQuiz.scoreLabel}</span>
                  <span className="text-3xl font-extrabold text-[#b8f600] font-mono block mt-1">
                    {formatScore(score)}<span className="text-lg text-white/30">/{total}</span>
                  </span>
                </div>
              </div>

              {/* Per-type breakdown */}
              <div className="max-w-sm mx-auto text-left space-y-3 mb-8">
                <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider block">
                  {t.materialQuiz.breakdown}
                </span>
                {(Object.keys(totalByType) as QuestionType[])
                  .filter((type) => totalByType[type] > 0)
                  .map((type) => {
                    const correct = correctByType[type];
                    const typeTotal = totalByType[type];
                    const pct = typeTotal > 0 ? Math.round((correct / typeTotal) * 100) : 0;
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-[#c3caac] flex items-center gap-1.5">
                            {typeIcon(type)}
                            {typeLabel(type)}
                          </span>
                          <span className="font-mono text-[#e3e3de]">
                            {formatScore(correct)}/{typeTotal} · {pct}%
                          </span>
                        </div>
                        <div className="w-full bg-[#121411] h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-[#b8f600] rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Bloom distribution */}
              <div className="max-w-sm mx-auto text-left mb-6">
                <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider block mb-2">
                  {t.materialQuiz.cognitiveDistribution}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {BLOOM_ORDER
                    .filter((level) => levelCounts[level] > 0)
                    .map((level) => (
                      <span
                        key={level}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded border ${levelBadgeClass(level)}`}
                      >
                        {levelLabel(level)} {levelCounts[level]}
                      </span>
                    ))}
                </div>
              </div>

              {/* Question summary table */}
              <details className="max-w-sm mx-auto text-left mb-6">
                <summary className="cursor-pointer text-[10px] uppercase font-mono text-white/40 tracking-wider">
                  {t.materialQuiz.questionSummary}
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto scrollbar-modern rounded border border-white/5">
                  <table className="w-full text-[10px]">
                    <thead className="bg-[#121411] text-white/35 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-mono">{t.materialQuiz.questionNumber}</th>
                        <th className="text-left px-2 py-1.5 font-mono">{t.materialQuiz.type}</th>
                        <th className="text-left px-2 py-1.5 font-mono">{t.materialQuiz.level}</th>
                        <th className="text-right px-2 py-1.5 font-mono">{t.materialQuiz.points}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((question, index) => (
                        <tr key={question.id} className="border-t border-white/5 text-[#c3caac]">
                          <td className="px-2 py-1.5 font-mono">{index + 1}</td>
                          <td className="px-2 py-1.5">{typeLabel(question.type)}</td>
                          <td className="px-2 py-1.5">{levelLabel(question.cognitiveLevel)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">1</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              {/* Export */}
              <div className="flex items-center justify-center gap-2 max-w-xs mx-auto mb-3">
                <button
                  onClick={() => downloadQuizWord({
                    materialName,
                    questions,
                    includeAnswers: exportWithAnswers,
                    locale: locale === "en-US" ? "en" : "zh",
                    purpose,
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.materialQuiz.exportWord}
                </button>
                <button
                  onClick={() => printQuizPdf({
                    materialName,
                    questions,
                    includeAnswers: exportWithAnswers,
                    locale: locale === "en-US" ? "en" : "zh",
                    purpose,
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.materialQuiz.exportPdf}
                </button>
                <label className="flex items-center gap-1.5 text-[9px] text-white/30 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exportWithAnswers}
                    onChange={(event) => setExportWithAnswers(event.target.checked)}
                    className="accent-[#b8f600]"
                  />
                  {t.materialQuiz.exportWithAnswers}
                </label>
              </div>

              <button
                onClick={onClose}
                className="w-full max-w-xs bg-[#b8f600] hover:bg-[#a1d800] active:scale-[0.98] text-[#141f00] py-3 rounded text-xs font-bold tracking-wide transition-colors cursor-pointer"
              >
                {t.materialQuiz.done}
              </button>
            </div>
          ) : (
            /* ── Question ── */
            <div className="text-left">
              {/* Progress */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono text-[#b8f600] uppercase tracking-widest bg-[#b8f600]/10 px-2 py-0.5 rounded font-bold">
                  {t.materialQuiz.questionOf.replace("{current}", String(currentIndex + 1)).replace("{total}", String(total))}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${typeBadgeClass(currentQuestion.type)}`}>
                    {typeIcon(currentQuestion.type)}
                    {typeLabel(currentQuestion.type)}
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${levelBadgeClass(currentQuestion.cognitiveLevel)}`}>
                    {levelLabel(currentQuestion.cognitiveLevel)}
                  </span>
                </div>
              </div>
              <div className="w-full bg-[#121411] h-1 rounded-full mb-6 overflow-hidden">
                <div
                  className="h-full bg-[#b8f600] rounded-full transition-all"
                  style={{ width: `${((currentIndex + (graded ? 1 : 0)) / total) * 100}%` }}
                />
              </div>

              {/* Question text */}
              <h3 className="text-base font-bold text-[#e3e3de] leading-snug mb-6 whitespace-pre-line">
                {currentQuestion.question}
              </h3>

              {/* ── Choice ── */}
              {currentQuestion.type === "choice" && (
                <div className="space-y-3 mb-6">
                  {(currentQuestion.options || []).map((option, idx) => {
                    const isSelected = choiceSelected === idx;
                    const isCorrect = currentQuestion.correctIndex === idx;
                    let optionStyle = "border-white/5 bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A] hover:border-white/10";
                    if (graded) {
                      if (isCorrect) optionStyle = "border-[#b8f600] bg-[#b8f600]/5 text-[#b8f600]";
                      else if (isSelected) optionStyle = "border-rose-500/70 bg-rose-950/10 text-rose-400";
                      else optionStyle = "opacity-40 border-white/5 bg-[#1a1c19] text-white/40";
                    }
                    return (
                      <button
                        key={idx}
                        onClick={() => handleChoiceSelect(idx)}
                        disabled={graded}
                        className={`w-full text-left p-4 rounded border text-xs font-medium transition-all flex items-center justify-between gap-3 cursor-pointer ${optionStyle}`}
                      >
                        <span>{option}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {graded && isCorrect && <CheckCircle className="w-5 h-5 text-[#b8f600]" />}
                          {graded && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── True / False ── */}
              {currentQuestion.type === "truefalse" && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[true, false].map((value) => {
                    const label = value ? t.materialQuiz.trueLabel : t.materialQuiz.falseLabel;
                    const isSelected = boolSelected === value;
                    const isCorrect = currentQuestion.correctBool === value;
                    let optionStyle = "border-white/5 bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A] hover:border-white/10";
                    if (graded) {
                      if (isCorrect) optionStyle = "border-[#b8f600] bg-[#b8f600]/5 text-[#b8f600]";
                      else if (isSelected) optionStyle = "border-rose-500/70 bg-rose-950/10 text-rose-400";
                      else optionStyle = "opacity-40 border-white/5 bg-[#1a1c19] text-white/40";
                    }
                    return (
                      <button
                        key={label}
                        onClick={() => handleBoolSelect(value)}
                        disabled={graded}
                        className={`p-5 rounded border text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${optionStyle}`}
                      >
                        {label}
                        {graded && isCorrect && <CheckCircle className="w-4 h-4" />}
                        {graded && isSelected && !isCorrect && <XCircle className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Fill in the blank ── */}
              {currentQuestion.type === "fill" && (
                <div className="mb-6">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={fillInput}
                      onChange={(e) => setFillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !graded) {
                          e.preventDefault();
                          handleFillSubmit();
                        }
                      }}
                      disabled={graded}
                      placeholder={t.materialQuiz.fillPlaceholder}
                      className={`flex-1 bg-[#1a1c19] border rounded px-4 py-3 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none transition-colors ${
                        graded
                          ? isFillCorrect(currentQuestion, fillInput)
                            ? "border-[#b8f600]"
                            : "border-rose-500/60"
                          : "border-white/10 focus:border-[#b8f600]"
                      }`}
                    />
                    {!graded && (
                      <button
                        onClick={handleFillSubmit}
                        disabled={!fillInput.trim()}
                        className="px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors disabled:opacity-30 cursor-pointer shrink-0"
                      >
                        {t.materialQuiz.submitAnswer}
                      </button>
                    )}
                  </div>
                  {inputError && <p className="text-[10px] text-rose-400 mt-1.5">{inputError}</p>}
                  {graded && (
                    <div className="mt-3 flex items-start gap-2 text-[11px]">
                      {isFillCorrect(currentQuestion, fillInput) ? (
                        <CheckCircle className="w-4 h-4 text-[#b8f600] shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span className="text-[#c3caac]">
                        <span className="text-white/40">{t.materialQuiz.correctAnswerIs}: </span>
                        <span className="text-[#e3e3de] font-mono">
                          {(currentQuestion.acceptableAnswers || []).join(" / ")}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Short answer ── */}
              {currentQuestion.type === "short" && (
                <div className="mb-6">
                  <textarea
                    rows={3}
                    value={shortInput}
                    onChange={(e) => setShortInput(e.target.value)}
                    disabled={graded}
                    placeholder={t.materialQuiz.shortPlaceholder}
                    className="w-full bg-[#1a1c19] border border-white/10 rounded px-4 py-3 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] transition-colors resize-none disabled:opacity-70"
                  />
                  {!graded && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleShortSubmit}
                        disabled={!shortInput.trim()}
                        className="px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        {t.materialQuiz.submitAnswer}
                      </button>
                    </div>
                  )}
                  {inputError && <p className="text-[10px] text-rose-400 mt-1.5">{inputError}</p>}

                  {graded && (
                    <div className="mt-3 space-y-3">
                      <div className="p-3 bg-[#121411] border border-white/5 rounded">
                        <span className="text-[10px] font-bold text-[#b8f600] block mb-1">
                          {t.materialQuiz.referenceAnswer}
                        </span>
                        <p className="text-[11px] text-[#c3caac] leading-relaxed whitespace-pre-line">
                          {currentQuestion.referenceAnswer || "—"}
                        </p>
                        {currentQuestion.keywords && currentQuestion.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="text-[9px] text-white/30">{t.materialQuiz.keywords}:</span>
                            {currentQuestion.keywords.map((keyword, idx) => (
                              <span key={idx} className="text-[9px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-1.5 py-0.5 rounded">
                                {keyword}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] text-[#c3caac] block mb-2">{t.materialQuiz.selfCheck}</span>
                        <div className="flex gap-2">
                          {([
                            { grade: 1 as SelfGrade, label: t.materialQuiz.correct, active: "bg-[#b8f600] text-[#141f00] border-[#b8f600]" },
                            { grade: 0.5 as SelfGrade, label: t.materialQuiz.partial, active: "bg-amber-400 text-black border-amber-400" },
                            { grade: 0 as SelfGrade, label: t.materialQuiz.wrong, active: "bg-rose-500 text-white border-rose-500" },
                          ]).map((option) => (
                            <button
                              key={option.grade}
                              onClick={() => handleSelfGrade(option.grade)}
                              disabled={selfGrade !== null}
                              className={`flex-1 px-2 py-2 rounded border text-[11px] font-bold transition-colors ${
                                selfGrade === option.grade
                                  ? option.active
                                  : selfGrade === null
                                    ? "border-white/10 text-[#c3caac] hover:bg-[#2A2A2A] cursor-pointer"
                                    : "border-white/5 text-white/25"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Distractor analysis (answer explanations are disabled to save generation tokens) */}
              <AnimatePresence>
                {graded && currentQuestion.type === "choice" && (currentQuestion.distractorNotes || []).some((note, index) => (
                  note && index !== currentQuestion.correctIndex
                )) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-[#121411] rounded border border-white/5 mb-6 text-left"
                  >
                    <span className="text-[10px] font-bold text-[#b8f600] block mb-1">
                      {t.materialQuiz.distractorAnalysis}
                    </span>
                    <div className="space-y-1">
                      {(currentQuestion.options || []).map((option, index) => {
                        const note = currentQuestion.distractorNotes?.[index];
                        if (index === currentQuestion.correctIndex || !note) return null;
                        return (
                          <div key={index} className="text-[10px] text-[#c3caac]/75 leading-relaxed">
                            <span className="font-mono text-white/40">{String.fromCharCode(65 + index)}.</span>{" "}
                            {option} — {note}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Next */}
              <div className="flex justify-end pt-4 border-t border-white/5">
                <button
                  onClick={handleNext}
                  disabled={!canProceed}
                  className={`flex items-center gap-2 px-5 py-2 rounded text-xs font-bold tracking-wide transition-all ${
                    canProceed
                      ? "bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] active:scale-[0.98] cursor-pointer"
                      : "bg-[#292a27] text-white/40 cursor-not-allowed"
                  }`}
                >
                  <span>
                    {currentIndex + 1 === total ? t.materialQuiz.finish : t.materialQuiz.next}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function answersMatch(input: string, answer: string): boolean {
  if (input === answer) return true;
  const inputNumber = Number(input);
  const answerNumber = Number(answer);
  return (
    input !== "" &&
    answer !== "" &&
    Number.isFinite(inputNumber) &&
    Number.isFinite(answerNumber) &&
    inputNumber === answerNumber
  );
}

function isFillCorrect(question: MaterialQuestion, input: string): boolean {
  const normalized = normalizeAnswer(input);
  return (question.acceptableAnswers || [])
    .map(normalizeAnswer)
    .some((answer) => answersMatch(normalized, answer));
}
