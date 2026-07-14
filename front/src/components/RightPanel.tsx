import React from "react";
import { 
  FileText, 
  ArrowRight, 
  BookMarked
} from "lucide-react";
import { ReviewRecord } from "../types";
import { useI18n } from "../i18n";

interface ReviewedTopic {
  topicId: string;
  topicName: string;
  avgAccuracy: number;
  quizCount: number;
  lastDate: string;
}

interface RightPanelProps {
  reviewHistory: ReviewRecord[];
  reviewedTopics: ReviewedTopic[];
  overallAccuracy: number;
  latestNote: { topic: string; content: string } | null;
  onOpenNotes: () => void;
  nextSuggestion: { concept: string; detail: string };
  onStartQuiz: (topicId: string, topicName: string) => void;
  onSelectTopic: (topicId: string) => void;
}

export default function RightPanel({
  reviewHistory,
  reviewedTopics,
  overallAccuracy,
  latestNote,
  onOpenNotes,
  nextSuggestion,
  onStartQuiz,
  onSelectTopic
}: RightPanelProps) {
  const { t, locale } = useI18n();
  
  // Show top 3 reviewed topics sorted by accuracy
  const topTopics = reviewedTopics
    .sort((a, b) => b.avgAccuracy - a.avgAccuracy)
    .slice(0, 3);

  const getColor = (accuracy: number) => {
    if (accuracy >= 80) return "text-[#b8f600]";
    if (accuracy >= 50) return "text-yellow-400";
    return "text-[#f43f5e]";
  };

  const getBorderColor = (accuracy: number) => {
    if (accuracy >= 80) return "";
    if (accuracy >= 50) return "";
    return "border-l-2 border-l-rose-500";
  };

  return (
    <aside className="w-80 border-l border-[#434933]/30 bg-[#1a1c19] flex flex-col overflow-y-auto scrollbar-none sticky top-0 h-screen select-none shrink-0" id="quickly-right-panel">
      <div className="p-6 space-y-8">
        
        {/* Section 1: Mastery */}
        <section className="space-y-4">
          <div className="flex justify-between items-center text-left">
            <h3 className="text-xs font-bold text-[#e3e3de] tracking-tight">{t.rightPanel.masterySnapshot}</h3>
            <span className="text-[#b8f600] text-sm font-black font-mono">
              {reviewHistory.length > 0 ? `${overallAccuracy}%` : "—"}
            </span>
          </div>
          
          <div className="space-y-2">
            {topTopics.length > 0 ? (
              topTopics.map(topic => (
                <button
                  key={topic.topicId}
                  onClick={() => onSelectTopic(topic.topicId)}
                  className={`w-full bg-[#121411] hover:bg-[#222222] border border-white/5 rounded p-3 flex justify-between items-center transition-all group text-left cursor-pointer ${getBorderColor(topic.avgAccuracy)}`}
                >
                  <span className="text-[#c3caac]/80 font-medium text-xs group-hover:text-[#e3e3de] transition-colors font-mono truncate mr-2">
                    {topic.topicName}
                  </span>
                  <span className={`text-xs font-bold font-mono shrink-0 ${getColor(topic.avgAccuracy)}`}>
                    {topic.avgAccuracy}%
                  </span>
                </button>
              ))
            ) : (
              <div className="bg-[#121411] border border-white/5 rounded p-4 text-center">
                <p className="text-[10px] text-white/40 font-mono">
                  {locale === "en-US" ? "Take a quiz to see mastery data" : "完成复习后即可查看掌握度"}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Auto Notes */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-wider text-left">{t.rightPanel.autoNotes}</h3>
          <div className="bg-[#121411] border border-white/5 rounded p-4 space-y-3.5 text-left">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#b8f600] shrink-0" />
              <span className="text-xs font-bold text-[#e3e3de] truncate">
                {latestNote?.topic || (locale === "en-US" ? "No notes yet" : "暂无笔记")}
              </span>
            </div>
            <p className="text-[11px] text-[#c3caac]/80 leading-relaxed font-mono line-clamp-2 min-h-[2.5rem]">
              {latestNote?.content || (locale === "en-US" ? "Notes will appear after AI conversations" : "AI 对话后将自动生成笔记")}
            </p>
            <button
              onClick={onOpenNotes}
              className="w-full bg-[#222222] hover:bg-[#2A2A2A] border border-white/5 text-[#c3caac] hover:text-white py-1.5 rounded text-[11px] font-bold transition-colors cursor-pointer"
            >
              {t.rightPanel.viewNotes}
            </button>
          </div>
        </section>

        {/* Section 3: Next Best Step */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-wider text-left">{t.rightPanel.nextStep}</h3>
          <div className="border border-white/5 bg-[#121411] rounded p-4 relative overflow-hidden text-left space-y-3">
            <div className="absolute top-0 left-0 w-1 h-full bg-white/20"></div>
            <div>
              <h4 className="text-xs font-bold text-[#e3e3de]">
                {nextSuggestion.concept}
              </h4>
              <p className="text-[11px] text-[#c3caac]/80 leading-relaxed font-mono mt-1">
                {nextSuggestion.detail}
              </p>
            </div>
            <button
              onClick={() => {
                // Find matching note or use the concept name as topicId
                const matchedTopic = reviewedTopics.find(t => t.topicName === nextSuggestion.concept);
                const topicId = matchedTopic?.topicId || "logistic-regression";
                onStartQuiz(topicId, nextSuggestion.concept);
              }}
              className="w-full bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] font-bold py-1.5 rounded transition-all text-[11px] cursor-pointer"
            >
              {t.rightPanel.startPractice}
            </button>
          </div>
        </section>

      </div>
    </aside>
  );
}
