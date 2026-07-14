import React, { useState, useEffect } from "react";
import { 
  X, 
  CheckCircle, 
  XCircle, 
  Award, 
  HelpCircle,
  Timer,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QuizQuestion, AIModelConfig } from "../types";
import { useI18n } from "../i18n";

interface QuizResult {
  score: number;
  total: number;
  accuracy: number;
}

interface ActiveQuizProps {
  topicId: string;
  topicName: string;
  modelConfig?: AIModelConfig;
  noteContent?: string;
  onClose: () => void;
  onComplete: (result: QuizResult) => void;
}

export default function ActiveQuiz({ topicId, topicName, modelConfig, noteContent, onClose, onComplete }: ActiveQuizProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(0);

  // Sound generator using Web Audio API (highly premium tactile feel!)
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
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === "incorrect") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.08); // lower
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === "victory") {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3); // C6
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) {
      // Ignored if browser policy blocks AudioContext
    }
  };

  // Fetch Questions from API
  useEffect(() => {
    async function fetchQuestions() {
      try {
        const response = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            topic: topicId,
            note_text: noteContent || undefined,
            note_topic: topicName || undefined,
            modelConfig: modelConfig ? {
              provider: modelConfig.provider,
              apiKey: modelConfig.apiKey,
              apiBase: modelConfig.apiBase,
              model: modelConfig.model,
            } : undefined,
          }),
        });
        const data = await response.json();
        setQuestions(data.quiz || []);
      } catch (err) {
        console.error("Quiz fetch failure", err);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, [topicId]);

  // Realtime Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Submit Answer
  const handleSelect = (idx: number) => {
    if (isAnswered) return;
    setSelectedIdx(idx);
    setIsAnswered(true);

    const isCorrect = idx === questions[currentIndex].correctIndex;
    if (isCorrect) {
      setScore(prev => prev + 1);
      playSound("correct");
    } else {
      playSound("incorrect");
    }
  };

  const currentQuestion = questions[currentIndex];
  const isFinished = questions.length > 0 && currentIndex >= questions.length;

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      playSound("victory");
      // Calculate result
      const accuracy = Math.round((score / questions.length) * 100);
      onComplete({ score, total: questions.length, accuracy });
      setCurrentIndex(questions.length); // trigger finished states
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedIdx(null);
      setIsAnswered(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0d0f0c]/90 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto" id="quiz-full-overlay">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl bg-[#222222] border border-white/5 rounded overflow-hidden shadow-2xl relative"
        id="quiz-card-container"
      >
        {/* Header bar */}
        <div className="px-6 py-4 bg-[#1a1c19]/50 border-b border-[#434933]/30 flex items-center justify-between" id="quiz-card-header">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#b8f600] animate-pulse" />
            <h3 className="font-bold text-[#e3e3de] text-sm">
              {t.quiz.testing}{topicName}
            </h3>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#121411] rounded text-xs font-mono text-[#c3caac]/80 border border-white/5">
              <Timer className="w-3.5 h-3.5 text-[#b8f600]" />
              <span>{formatTime(seconds)}</span>
            </div>
            
            <button 
              id="quiz-btn-close"
              onClick={onClose}
              className="text-white/40 hover:text-white/90 p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* content body */}
        <div className="p-6" id="quiz-card-body text-left">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center" id="quiz-loading">
              <div className="w-10 h-1 bg-white/20 relative rounded overflow-hidden mb-4">
                <motion.div 
                  className="absolute top-0 bottom-0 left-0 bg-[#b8f600]"
                  animate={{ left: ["-100%", "100%"] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  style={{ width: "80%" }}
                />
              </div>
              <p className="text-sm font-mono text-[#c3caac]/50 tracking-wider">
                {t.quiz.generating}
              </p>
            </div>
          ) : isFinished ? (
            /* Victory screen */
            <div className="text-center py-10" id="quiz-finished-screen">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#b8f600]/10 border-2 border-[#b8f600] text-[#b8f600] mb-6 shadow-xl shadow-[#b8f600]/5 animate-bounce">
                <Award className="w-10 h-10" />
              </div>
              
              <h2 className="text-xl font-bold text-[#e3e3de] tracking-tight">
                {t.quiz.completed}
              </h2>
              <p className="text-[#c3caac]/75 text-xs mt-2 max-w-sm mx-auto">
                {t.quiz.completedDesc.replace("{topic}", topicName)}
              </p>

              <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto my-8">
                <div className="bg-[#121411] border border-white/5 p-4 rounded text-left">
                  <span className="text-[10px] text-white/40 block font-mono">{t.quiz.accuracy}</span>
                  <span className="text-3xl font-extrabold text-[#b8f600] font-mono block mt-1">
                    {Math.round((score / questions.length) * 100)}%
                  </span>
                </div>
                <div className="bg-[#121411] border border-white/5 p-4 rounded text-left">
                  <span className="text-[10px] text-white/40 block font-mono">{t.quiz.masteryUp}</span>
                  <span className="text-3xl font-extrabold text-[#b8f600] font-mono block mt-1">
                    +{Math.round((score / questions.length) * 10)}%
                  </span>
                </div>
              </div>

              <div className="space-y-2 mt-8">
                <button
                  id="quiz-complete-btn-done"
                  onClick={onClose}
                  className="w-full max-w-xs bg-[#b8f600] hover:bg-[#a1d800] active:scale-[0.98] text-[#141f00] py-3 rounded text-xs font-bold tracking-wide transition-colors cursor-pointer"
                >
                  {t.quiz.backToWork}
                </button>
              </div>
            </div>
          ) : (
            /* Question screen */
            <div className="text-left">
              {/* Question Number Bar */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono text-[#b8f600] uppercase tracking-widest bg-[#b8f600]/10 px-2 py-0.5 rounded font-bold">
                  Q {currentIndex + 1} OF {questions.length}
                </span>
                
                <span className="text-[11px] text-[#c3caac]/50 font-mono">
                  {t.quiz.correctAnswerTip}
                </span>
              </div>

              {/* Question Title */}
              <h3 className="text-base font-bold text-[#e3e3de] leading-snug mb-6" id="quiz-question-heading">
                {currentQuestion.question}
              </h3>

              {/* Options */}
              <div className="space-y-3 mb-6" id="quiz-options-list">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedIdx === idx;
                  const isCorrect = currentQuestion.correctIndex === idx;
                  
                  let optionStyle = "border-white/5 bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A] hover:border-white/10";
                  
                  if (isAnswered) {
                    if (isCorrect) {
                      optionStyle = "border-[#b8f600] bg-[#b8f600]/5 text-[#b8f600]";
                    } else if (isSelected) {
                      optionStyle = "border-rose-500/70 bg-rose-950/10 text-rose-400";
                    } else {
                      optionStyle = "opacity-40 border-white/5 bg-[#1a1c19] text-white/40";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      id={`quiz-option-${idx}`}
                      onClick={() => handleSelect(idx)}
                      disabled={isAnswered}
                      className={`w-full text-left p-4 rounded border text-xs font-medium transition-all flex items-center justify-between group cursor-pointer ${optionStyle}`}
                    >
                      <span>{option}</span>
                      
                      <div className="flex items-center gap-1.5">
                        {isAnswered && isCorrect && <CheckCircle className="w-5 h-5 text-[#b8f600]" />}
                        {isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Corrective Explanation feedback block */}
              <AnimatePresence>
                {isAnswered && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-[#121411] rounded border border-white/5 mb-6 text-left"
                    id="quiz-explanation-box"
                  >
                    <div className="flex items-start gap-3">
                      <HelpCircle className="w-5 h-5 text-[#b8f600] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[11px] font-bold text-[#e3e3de] block">{t.quiz.academicAnalysis}</span>
                        <p className="text-[11px] text-[#c3caac]/80 leading-relaxed mt-1" id="text-quiz-explanation">
                          {currentQuestion.explanation}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Next Button */}
              <div className="flex justify-end pt-4 border-t border-white/5">
                <button
                  id="quiz-next-question-btn"
                  onClick={handleNext}
                  disabled={!isAnswered}
                  className={`flex items-center gap-2 px-5 py-2 rounded text-xs font-bold tracking-wide transition-all cursor-pointer ${
                    isAnswered
                      ? "bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] active:scale-[0.98]"
                      : "bg-[#292a27] text-white/40 cursor-not-allowed"
                  }`}
                >
                  <span>
                    {currentIndex + 1 === questions.length ? t.quiz.completeQuiz : t.quiz.nextQuestion}
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
