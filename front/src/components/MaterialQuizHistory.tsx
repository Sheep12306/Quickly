import React, { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock,
  FileUp,
  ListChecks,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { MaterialQuizSession } from "../types";
import { useI18n } from "../i18n";

interface MaterialQuizHistoryProps {
  sessions: MaterialQuizSession[];
  materialMode: boolean;
  historyOnly?: boolean;
  onStartMaterial: () => void;
  onOpen: (session: MaterialQuizSession) => void;
  onRedo: (session: MaterialQuizSession) => void;
  onDelete: (session: MaterialQuizSession) => void;
}

export default function MaterialQuizHistory({
  sessions,
  materialMode,
  historyOnly = false,
  onStartMaterial,
  onOpen,
  onRedo,
  onDelete,
}: MaterialQuizHistoryProps) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const formatDate = (value: string) => new Date(value).toLocaleDateString(
    locale === "en-US" ? "en-US" : "zh-CN",
    { month: "short", day: "numeric" },
  );

  const progressLabel = (session: MaterialQuizSession) => {
    if (session.finished) {
      const accuracy = session.completedResult?.accuracy;
      if (typeof accuracy === "number") {
        return `${t.review.completedLabel} · ${accuracy}%`;
      }
      return t.review.completedLabel;
    }
    const current = Math.min(session.currentIndex + 1, session.questions.length);
    return `${t.review.progressLabel} ${current} / ${session.questions.length}`;
  };

  return (
    <section className="mt-2">
      {!historyOnly && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <FileUp className="w-4 h-4 text-[#b8f600]" />
            <h3 className="text-sm font-bold text-[#e3e3de]">{t.review.tabMaterial}</h3>
          </div>
          <p className="text-xs text-[#c3caac]/70 mb-4">{t.review.materialEntryDesc}</p>

          {!materialMode && (
            <button
              onClick={onStartMaterial}
              className="w-full bg-[#222222] border border-white/5 hover:border-[#b8f600]/30 hover:bg-[#2A2A2A] rounded-lg p-4 flex items-center gap-4 text-left transition-colors group mb-4"
            >
              <div className="w-11 h-11 rounded-lg bg-[#b8f600]/10 border border-[#b8f600]/20 flex items-center justify-center shrink-0">
                <FileUp className="w-5 h-5 text-[#b8f600]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-[#e3e3de] block">{t.review.uploadMaterial}</span>
                <span className="text-[10px] text-white/35 block mt-0.5">{t.review.materialEntryDesc}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-[#b8f600] transition-colors shrink-0" />
            </button>
          )}
        </>
      )}

      <div className={`${historyOnly ? "" : "border-t border-white/5"} pt-3`}>
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="flex items-center gap-2 text-[11px] font-medium text-[#c3caac] hover:text-[#e3e3de] transition-colors"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{t.review.materialHistory}</span>
          <span className="text-[9px] text-white/30 font-mono">{sortedSessions.length}</span>
        </button>

        {expanded && (
          sortedSessions.length === 0 ? (
            <div className="mt-3 py-8 text-center border border-dashed border-[#434933]/25 rounded bg-[#1a1c19]/40">
              <ListChecks className="w-7 h-7 text-white/10 mx-auto mb-2" />
              <p className="text-[10px] text-white/35">{t.review.materialEmpty}</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {sortedSessions.map(session => (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(session)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(session);
                    }
                  }}
                  className="bg-[#222222] border border-white/5 hover:border-[#b8f600]/25 rounded-lg p-3.5 flex items-center gap-3 cursor-pointer transition-colors"
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                    session.finished ? "bg-[#b8f600]/10" : "bg-sky-400/10"
                  }`}>
                    <ListChecks className={`w-4 h-4 ${session.finished ? "text-[#b8f600]" : "text-sky-400"}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-medium text-[#e3e3de] truncate block">
                      {session.materialName}
                    </span>
                    <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-white/30">
                      <span>{session.questions.length} {t.review.noteCount}</span>
                      <span>·</span>
                      <span>{progressLabel(session)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(session.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(session);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      {t.review.continueReview}
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onRedo(session);
                      }}
                      title={t.review.redoReview}
                      className="p-1.5 rounded text-white/35 hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (confirm(t.review.confirmDeleteHistory)) onDelete(session);
                      }}
                      title={t.review.deleteHistory}
                      className="p-1.5 rounded text-white/25 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
}
