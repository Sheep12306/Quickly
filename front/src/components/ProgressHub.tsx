import React, { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Activity,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  CalendarClock,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  X,
} from "lucide-react";
import type { NoteItem, ReviewRecord } from "../types";
import { useI18n } from "../i18n";
import { loadSetting, saveSetting } from "../db";

interface ProgressHubProps {
  notes: NoteItem[];
  reviewHistory: ReviewRecord[];
  onStartQuiz: (topicId: string, topicName: string, noteContent?: string) => void;
  onOpenReview: () => void;
  dailyGoal?: number;
  weeklyGoal?: number;
  onDailyGoalChange?: (value: number) => void;
  onWeeklyGoalChange?: (value: number) => void;
}

interface StudyGoal {
  id: string;
  topicId: string;
  topicName: string;
  targetAccuracy: number;
  targetSessions: number;
  deadline: string; // YYYY-MM-DD
  createdAt: string;
}

interface TopicStat {
  topicId: string;
  topicName: string;
  avgAccuracy: number;
  latestAccuracy: number;
  previousAccuracy: number | null;
  quizCount: number;
  lastDate: string;
  records: ReviewRecord[]; // newest first
}

const DAY_MS = 86400000;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(days: number): string {
  return toDateInputValue(new Date(Date.now() + days * DAY_MS));
}

export default function ProgressHub({
  notes,
  reviewHistory,
  onStartQuiz,
  onOpenReview,
  dailyGoal = 30,
  weeklyGoal = 14,
  onDailyGoalChange,
  onWeeklyGoalChange,
}: ProgressHubProps) {
  const { t, locale } = useI18n();

  // ─── Goals (persisted in IndexedDB appSettings) ───
  const [goals, setGoals] = useState<StudyGoal[]>([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSetting<StudyGoal[]>("studyGoals", [])
      .then((stored) => {
        if (cancelled) return;
        setGoals(Array.isArray(stored) ? stored.filter((goal) => goal && goal.id && goal.topicId) : []);
        setGoalsLoaded(true);
      })
      .catch((error) => {
        console.error("Failed to load study goals", error);
        if (!cancelled) setGoalsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (goalsLoaded) {
      saveSetting("studyGoals", goals).catch((error) => {
        console.error("Failed to save study goals", error);
      });
    }
  }, [goals, goalsLoaded]);

  // ─── Topic mastery from review history ───
  const topicStats: TopicStat[] = useMemo(() => {
    const grouped = new Map<string, ReviewRecord[]>();
    for (const record of reviewHistory) {
      const list = grouped.get(record.topicId) || [];
      list.push(record);
      grouped.set(record.topicId, list);
    }

    return Array.from(grouped.entries())
      .map(([topicId, rawRecords]) => {
        const records = [...rawRecords].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        return {
          topicId,
          topicName: records[0]?.topicName || topicId,
          avgAccuracy: average(records.map((record) => record.accuracy)),
          latestAccuracy: Math.round(records[0]?.accuracy || 0),
          previousAccuracy: records[1] ? Math.round(records[1].accuracy) : null,
          quizCount: records.length,
          lastDate: records[0]?.date || "",
          records,
        };
      })
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [reviewHistory]);

  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  useEffect(() => {
    if (topicStats.length === 0) {
      if (selectedTopicId) setSelectedTopicId("");
      return;
    }
    if (!selectedTopicId || !topicStats.some((topic) => topic.topicId === selectedTopicId)) {
      setSelectedTopicId(topicStats[0].topicId);
    }
  }, [topicStats, selectedTopicId]);

  const selectedTopic = topicStats.find((topic) => topic.topicId === selectedTopicId) || null;
  const selectedNote = selectedTopic ? notes.find((note) => note.id === selectedTopic.topicId) : null;

  // ─── Goal form ───
  const [showForm, setShowForm] = useState(false);
  const [formTopicId, setFormTopicId] = useState("");
  const [formTarget, setFormTarget] = useState(80);
  const [formSessions, setFormSessions] = useState(3);
  const [formDeadline, setFormDeadline] = useState(addDays(14));

  const goalTopicOptions = useMemo(() => {
    const options = new Map<string, { id: string; name: string }>();
    for (const note of notes) options.set(note.id, { id: note.id, name: note.topic });
    for (const topic of topicStats) {
      if (!options.has(topic.topicId)) options.set(topic.topicId, { id: topic.topicId, name: topic.topicName });
    }
    return Array.from(options.values());
  }, [notes, topicStats]);

  const openGoalForm = (topicId?: string, targetAccuracy?: number) => {
    setFormTopicId(topicId || goalTopicOptions[0]?.id || "");
    setFormTarget(targetAccuracy ? Math.min(100, Math.max(60, Math.round(targetAccuracy))) : 80);
    setFormSessions(3);
    setFormDeadline(addDays(14));
    setShowForm(true);
  };

  const createGoal = (topicId = formTopicId, target = formTarget, sessions = formSessions, deadline = formDeadline) => {
    const topic = goalTopicOptions.find((option) => option.id === topicId);
    if (!topic) return;
    const safeDeadline = deadline && deadline >= toDateInputValue(new Date()) ? deadline : toDateInputValue(new Date());
    const goal: StudyGoal = {
      id: `goal-${Date.now()}`,
      topicId: topic.id,
      topicName: topic.name,
      targetAccuracy: Math.min(100, Math.max(50, target)),
      targetSessions: Math.min(20, Math.max(1, sessions)),
      deadline: safeDeadline,
      createdAt: new Date().toISOString(),
    };
    setGoals((prev) => [goal, ...prev]);
    setShowForm(false);
  };

  const deleteGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
  };

  // ─── Suggested plan for the weakest topic ───
  const weakestTopic = useMemo(() => {
    if (topicStats.length > 0) {
      return [...topicStats].sort((a, b) => a.avgAccuracy - b.avgAccuracy)[0];
    }
    if (notes.length > 0) {
      return {
        topicId: notes[0].id,
        topicName: notes[0].topic,
        avgAccuracy: 0,
        latestAccuracy: 0,
        previousAccuracy: null,
        quizCount: 0,
        lastDate: "",
        records: [],
      } as TopicStat;
    }
    return null;
  }, [topicStats, notes]);

  const suggestionTarget = Math.min(90, Math.max(70, Math.round((weakestTopic?.avgAccuracy || 0) + 10)));
  const suggestionDeadline = addDays(14);

  // ─── Goal progress ───
  const goalProgress = (goal: StudyGoal) => {
    const topic = topicStats.find((item) => item.topicId === goal.topicId);
    const records = topic?.records || [];
    const avgAccuracy = topic?.avgAccuracy || 0;
    const sessionsAfter = records.filter(
      (record) => new Date(record.date).getTime() >= new Date(goal.createdAt).getTime(),
    ).length;
    const achieved = avgAccuracy >= goal.targetAccuracy && sessionsAfter >= goal.targetSessions;
    const deadlineStart = new Date(`${goal.deadline}T00:00:00`);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((deadlineStart.getTime() - todayStart.getTime()) / DAY_MS);
    const overdue = !achieved && daysLeft < 0;
    return {
      avgAccuracy,
      sessionsAfter,
      achieved,
      overdue,
      daysLeft,
      masteryPct: Math.min(100, Math.round((avgAccuracy / goal.targetAccuracy) * 100)),
      sessionPct: Math.min(100, Math.round((sessionsAfter / goal.targetSessions) * 100)),
    };
  };

  const formatDate = (value: string) => new Date(value).toLocaleDateString(
    locale === "en-US" ? "en-US" : "zh-CN",
    { month: "short", day: "numeric" },
  );

  const overallAccuracy = average(reviewHistory.map((record) => record.accuracy));
  const activeGoals = goals.filter((goal) => {
    const progress = goalProgress(goal);
    return !progress.achieved && !progress.overdue;
  }).length;

  const trend = selectedTopic && selectedTopic.previousAccuracy !== null
    ? selectedTopic.latestAccuracy - selectedTopic.previousAccuracy
    : null;

  const feedbackText = !selectedTopic
    ? t.progressHub.feedbackNone
    : selectedTopic.avgAccuracy >= 85
      ? t.progressHub.feedbackExcellent
      : selectedTopic.avgAccuracy >= 70
        ? t.progressHub.feedbackGood
        : t.progressHub.feedbackWeak;

  const startReviewFor = (topicId: string, topicName: string) => {
    const note = notes.find((item) => item.id === topicId);
    onStartQuiz(topicId, topicName, note?.content);
  };

  return (
    <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto" id="progress-hub-pane">
      <div className="w-full max-w-6xl space-y-6 text-left" id="progress-hub-scroll">
        {/* Heading */}
        <div>
          <h2 className="text-xl font-bold text-[#e3e3de]">{t.progressHub.title}</h2>
          <p className="text-xs text-[#c3caac]/70 mt-1">{t.progressHub.subtitle}</p>
        </div>

        {/* Learning duration goals (moved from Settings) */}
        <section className="bg-[#222222] border border-white/5 rounded p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-[#b8f600]" />
            <div>
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.learningGoals}</h3>
              <p className="text-[10px] text-white/35 font-mono">{t.settings.learningGoalsDesc}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <span className="text-[10px] text-white/45 font-mono uppercase tracking-wider block mb-2">
                {t.settings.dailyDuration}
              </span>
              <div className="flex flex-wrap gap-2">
                {[15, 30, 45, 60, 90, 120].map(minutes => (
                  <button
                    key={minutes}
                    onClick={() => onDailyGoalChange?.(minutes)}
                    className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-colors ${
                      dailyGoal === minutes
                        ? "bg-[#b8f600] text-[#141f00]"
                        : "bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A]"
                    }`}
                  >
                    {minutes}{t.settings.minutes}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-white/45 font-mono uppercase tracking-wider block mb-2">
                {t.settings.weeklyDuration}
              </span>
              <div className="flex flex-wrap gap-2">
                {[7, 14, 21, 30].map(hours => (
                  <button
                    key={hours}
                    onClick={() => onWeeklyGoalChange?.(hours)}
                    className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-colors ${
                      weeklyGoal === hours
                        ? "bg-[#b8f600] text-[#141f00]"
                        : "bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A]"
                    }`}
                  >
                    {hours}{t.settings.hours}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="progress-summary-grid">
          {[
            { label: t.progressHub.totalReviews, value: reviewHistory.length, accent: "text-[#b8f600]" },
            { label: t.progressHub.overallAccuracy, value: `${overallAccuracy}%`, accent: "text-amber-400" },
            { label: t.progressHub.topicsReviewed, value: topicStats.length, accent: "text-rose-400" },
            { label: t.progressHub.activeGoals, value: activeGoals, accent: "text-sky-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#222222] border border-white/5 rounded p-4">
              <span className={`text-[10px] uppercase font-mono font-bold block mb-1 ${stat.accent}`}>
                {stat.label}
              </span>
              <span className="text-3xl font-extrabold text-[#e3e3de] font-mono">{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ─── Recent mastery feedback ─── */}
          <section className="lg:col-span-3 bg-[#222222] border border-white/5 rounded p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-[#b8f600]" />
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.progressHub.recentFeedback}</h3>
            </div>
            <p className="text-[10px] text-white/35 font-mono mb-4">{t.progressHub.recentFeedbackDesc}</p>

            {topicStats.length === 0 ? (
              <div className="py-12 text-center">
                <Activity className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-xs text-[#c3caac]">{t.progressHub.noReviewData}</p>
                <p className="text-[10px] text-white/35 mt-1 max-w-xs mx-auto">{t.progressHub.noReviewDataDesc}</p>
                <button
                  onClick={onOpenReview}
                  className="mt-4 px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors"
                >
                  {t.progressHub.goReview}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Topic list */}
                <div className="md:col-span-2 space-y-1.5 md:max-h-[420px] overflow-y-auto pr-1">
                  {topicStats.map((topic) => {
                    const isSelected = topic.topicId === selectedTopicId;
                    const note = notes.find((item) => item.id === topic.topicId);
                    const topicTrend = topic.previousAccuracy !== null
                      ? topic.latestAccuracy - topic.previousAccuracy
                      : null;
                    return (
                      <button
                        key={topic.topicId}
                        onClick={() => setSelectedTopicId(topic.topicId)}
                        className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                          isSelected
                            ? "bg-[#b8f600]/5 border-[#b8f600]/30"
                            : "bg-[#1a1c19] border-white/5 hover:border-white/15"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[11px] font-bold truncate ${isSelected ? "text-[#b8f600]" : "text-[#e3e3de]"}`}>
                            {topic.topicName}
                          </span>
                          <span className="text-[10px] font-mono text-[#c3caac] shrink-0">{topic.avgAccuracy}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-[9px] text-white/30 font-mono flex items-center gap-1 truncate">
                            {note ? <BookOpen className="w-2.5 h-2.5 shrink-0" /> : null}
                            {topic.quizCount} {t.progressHub.sessionsUnit} · {formatDate(topic.lastDate)}
                          </span>
                          {topicTrend !== null && (
                            <span className={`text-[9px] font-mono flex items-center gap-0.5 shrink-0 ${
                              topicTrend > 0 ? "text-[#b8f600]" : topicTrend < 0 ? "text-rose-400" : "text-white/30"
                            }`}>
                              {topicTrend > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : topicTrend < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                              {topicTrend > 0 ? "+" : ""}{topicTrend}
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-[#121411] h-1 rounded-full mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              topic.avgAccuracy >= 80 ? "bg-[#b8f600]" : topic.avgAccuracy >= 50 ? "bg-amber-400" : "bg-rose-500"
                            }`}
                            style={{ width: `${topic.avgAccuracy}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected topic detail */}
                {selectedTopic && (
                  <div className="md:col-span-3 bg-[#1a1c19] border border-white/5 rounded p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[9px] uppercase font-mono text-white/30 tracking-wider block">
                          {t.progressHub.latestAccuracy}
                        </span>
                        <h4 className="text-sm font-bold text-[#e3e3de] truncate" title={selectedTopic.topicName}>
                          {selectedTopic.topicName}
                        </h4>
                        <span className={`inline-flex items-center gap-1 text-[9px] font-mono mt-1 ${
                          selectedNote ? "text-[#b8f600]" : "text-white/35"
                        }`}>
                          {selectedNote ? <BookOpen className="w-2.5 h-2.5" /> : <Sparkles className="w-2.5 h-2.5" />}
                          {selectedNote ? t.progressHub.linkedNote : t.progressHub.reviewTopic}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-4xl font-extrabold font-mono text-[#e3e3de] leading-none">
                          {selectedTopic.latestAccuracy}%
                        </span>
                        {trend !== null && (
                          <span className={`flex items-center justify-end gap-1 text-[10px] font-mono mt-1 ${
                            trend > 0 ? "text-[#b8f600]" : trend < 0 ? "text-rose-400" : "text-white/30"
                          }`}>
                            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {trend > 0 ? "+" : ""}{trend}%
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-[#c3caac] leading-relaxed mt-3 p-2.5 bg-[#121411] rounded border border-white/5">
                      {feedbackText}
                    </p>

                    {/* Recent session bars */}
                    <div className="mt-4">
                      <span className="text-[9px] uppercase font-mono text-white/30 tracking-wider block mb-2">
                        {t.progressHub.recentSessions}
                      </span>
                      <div className="flex items-end gap-1.5 h-16">
                        {[...selectedTopic.records.slice(0, 8)].reverse().map((record, index) => (
                          <div key={`${record.date}-${index}`} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${Math.round(record.accuracy)}% · ${formatDate(record.date)}`}>
                            <div
                              className={`w-full rounded-t ${
                                record.accuracy >= 80 ? "bg-[#b8f600]" : record.accuracy >= 50 ? "bg-amber-400" : "bg-rose-500"
                              }`}
                              style={{ height: `${Math.max(8, Math.round(record.accuracy))}%` }}
                            />
                            <span className="text-[8px] text-white/20 font-mono">
                              {new Date(record.date).getDate()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                      {[
                        { label: t.progressHub.avgAccuracy, value: `${selectedTopic.avgAccuracy}%` },
                        { label: t.progressHub.sessions, value: selectedTopic.quizCount },
                        { label: t.progressHub.lastReviewed, value: formatDate(selectedTopic.lastDate) },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-[#121411] border border-white/5 rounded px-2 py-1.5">
                          <span className="text-[8px] text-white/30 block font-mono truncate">{stat.label}</span>
                          <span className="text-[11px] font-bold text-[#e3e3de] font-mono">{stat.value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => startReviewFor(selectedTopic.topicId, selectedTopic.topicName)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold rounded transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                        {t.progressHub.startReview}
                      </button>
                      <button
                        onClick={() => openGoalForm(selectedTopic.topicId, Math.max(70, selectedTopic.avgAccuracy + 10))}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 border border-[#b8f600]/30 text-[#b8f600] hover:bg-[#b8f600]/10 text-[11px] font-bold rounded transition-colors"
                      >
                        <Target className="w-3.5 h-3.5" />
                        {t.progressHub.setGoalFromTopic}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ─── Goals & plan ─── */}
          <section className="lg:col-span-2 bg-[#222222] border border-white/5 rounded p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#b8f600]" />
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.progressHub.goalsTitle}</h3>
              </div>
              {!showForm && (
                <button
                  onClick={() => openGoalForm()}
                  className="flex items-center gap-1 text-[10px] text-[#b8f600] hover:text-white transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {t.progressHub.newGoal}
                </button>
              )}
            </div>
            <p className="text-[10px] text-white/35 font-mono mb-4">{t.progressHub.goalsDesc}</p>

            {/* Create form */}
            {showForm && (
              <div className="bg-[#1a1c19] border border-[#b8f600]/20 rounded p-4 space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#e3e3de]">{t.progressHub.newGoal}</span>
                  <button onClick={() => setShowForm(false)} className="text-white/30 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <label className="block">
                  <span className="text-[10px] text-[#c3caac] block mb-1">{t.progressHub.goalTopic}</span>
                  <select
                    value={formTopicId}
                    onChange={(event) => setFormTopicId(event.target.value)}
                    className="w-full bg-[#121411] border border-white/10 rounded px-3 py-2 text-[11px] text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                  >
                    <option value="">{t.progressHub.selectTopic}</option>
                    {goalTopicOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="flex items-center justify-between text-[10px] text-[#c3caac] mb-1">
                    <span>{t.progressHub.goalTarget}</span>
                    <span className="font-mono font-bold text-[#b8f600]">{formTarget}%</span>
                  </span>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    step={5}
                    value={formTarget}
                    onChange={(event) => setFormTarget(Number(event.target.value))}
                    className="w-full accent-[#b8f600]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] text-[#c3caac] block mb-1">{t.progressHub.goalSessions}</span>
                    <div className="flex items-center justify-between bg-[#121411] border border-white/10 rounded px-2 py-1">
                      <button
                        onClick={() => setFormSessions((value) => Math.max(1, value - 1))}
                        className="w-6 h-6 flex items-center justify-center text-[#c3caac] hover:text-white"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold text-[#e3e3de]">{formSessions}</span>
                      <button
                        onClick={() => setFormSessions((value) => Math.min(20, value + 1))}
                        className="w-6 h-6 flex items-center justify-center text-[#c3caac] hover:text-white"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-[10px] text-[#c3caac] block mb-1">{t.progressHub.goalDeadline}</span>
                    <input
                      type="date"
                      value={formDeadline}
                      min={toDateInputValue(new Date())}
                      onChange={(event) => setFormDeadline(event.target.value)}
                      className="w-full bg-[#121411] border border-white/10 rounded px-2 py-1.5 text-[11px] text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    />
                  </label>
                </div>

                <button
                  onClick={() => createGoal()}
                  disabled={!formTopicId}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold rounded transition-colors disabled:opacity-30"
                >
                  <Target className="w-3.5 h-3.5" />
                  {t.progressHub.createGoal}
                </button>
              </div>
            )}

            {/* Goals list */}
            {goals.length === 0 ? (
              <div className="py-6 text-center">
                <CalendarClock className="w-8 h-8 text-white/10 mx-auto mb-2" />
                <p className="text-[11px] text-[#c3caac]">{t.progressHub.noGoals}</p>
                {weakestTopic ? (
                  <div className="mt-3 p-3 bg-[#1a1c19] border border-white/5 rounded text-left">
                    <p className="text-[10px] text-white/40 leading-relaxed">
                      {t.progressHub.suggestGoalDesc
                        .replace("{topic}", weakestTopic.topicName)
                        .replace("{target}", String(suggestionTarget))
                        .replace("{sessions}", "3")
                        .replace("{date}", formatDate(suggestionDeadline))}
                    </p>
                    <button
                      onClick={() => createGoal(weakestTopic.topicId, suggestionTarget, 3, suggestionDeadline)}
                      className="mt-2 w-full px-3 py-1.5 border border-[#b8f600]/30 text-[#b8f600] hover:bg-[#b8f600]/10 text-[10px] font-bold rounded transition-colors"
                    >
                      {t.progressHub.suggestGoal}
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-white/25 mt-1">{t.progressHub.noGoalsDesc}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {goals.map((goal) => {
                  const progress = goalProgress(goal);
                  const statusLabel = progress.achieved
                    ? t.progressHub.goalAchieved
                    : progress.overdue
                      ? t.progressHub.goalOverdue
                      : t.progressHub.goalActive;
                  const statusClass = progress.achieved
                    ? "text-[#b8f600] bg-[#b8f600]/10 border-[#b8f600]/20"
                    : progress.overdue
                      ? "text-rose-400 bg-rose-400/10 border-rose-400/20"
                      : "text-sky-400 bg-sky-400/10 border-sky-400/20";
                  const deadlineText = progress.daysLeft < 0
                    ? t.progressHub.deadlinePassed.replace("{days}", String(Math.abs(progress.daysLeft)))
                    : progress.daysLeft === 0
                      ? t.progressHub.deadlineToday
                      : t.progressHub.daysLeft.replace("{days}", String(progress.daysLeft));

                  return (
                    <div key={goal.id} className="bg-[#1a1c19] border border-white/5 rounded p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h5 className="text-[11px] font-bold text-[#e3e3de] truncate">{goal.topicName}</h5>
                          <span className="text-[9px] text-white/35 font-mono">
                            {t.progressHub.goalTargetLine
                              .replace("{target}", String(goal.targetAccuracy))
                              .replace("{sessions}", String(goal.targetSessions))}
                          </span>
                        </div>
                        <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="space-y-1.5 mt-2.5">
                        <div className="flex items-center justify-between text-[9px]">
                          <span className="text-white/40">{t.progressHub.masteryProgress}</span>
                          <span className="font-mono text-[#c3caac]">{progress.avgAccuracy}% / {goal.targetAccuracy}%</span>
                        </div>
                        <div className="w-full bg-[#121411] h-1 rounded-full overflow-hidden">
                          <div className="h-full bg-[#b8f600] rounded-full" style={{ width: `${progress.masteryPct}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[9px]">
                          <span className="text-white/40">{t.progressHub.sessionProgress}</span>
                          <span className="font-mono text-[#c3caac]">{progress.sessionsAfter} / {goal.targetSessions}</span>
                        </div>
                        <div className="w-full bg-[#121411] h-1 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-400 rounded-full" style={{ width: `${progress.sessionPct}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 gap-2">
                        <span className={`text-[9px] font-mono flex items-center gap-1 ${
                          progress.overdue ? "text-rose-400" : "text-white/30"
                        }`}>
                          <CalendarClock className="w-2.5 h-2.5" />
                          {deadlineText}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startReviewFor(goal.topicId, goal.topicName)}
                            className="px-2 py-1 bg-[#b8f600]/80 hover:bg-[#a1d800] text-[#141f00] text-[9px] font-bold rounded transition-colors"
                          >
                            {t.progressHub.goReview}
                          </button>
                          <button
                            onClick={() => deleteGoal(goal.id)}
                            className="p-1 text-white/25 hover:text-rose-400 transition-colors"
                            title={t.progressHub.deleteGoal}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Recent review history */}
        {reviewHistory.length > 0 && (
          <section className="bg-[#222222] border border-white/5 rounded p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#e3e3de]">{t.progressHub.recentHistory}</span>
              <span className="text-[10px] font-mono text-white/30">
                {reviewHistory.length} {t.progressHub.totalUnit}
              </span>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {[...reviewHistory]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 10)
                .map((record, index) => (
                  <div
                    key={`${record.topicId}-${record.date}-${index}`}
                    className="flex items-center justify-between px-3 py-2 bg-[#1a1c19] rounded border border-white/5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`text-[10px] font-mono font-bold shrink-0 ${
                        record.accuracy >= 80 ? "text-[#b8f600]" : record.accuracy >= 50 ? "text-amber-400" : "text-rose-400"
                      }`}>
                        {Math.round(record.accuracy)}%
                      </span>
                      <span className="text-[11px] text-[#e3e3de] truncate">{record.topicName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[9px] text-white/30 font-mono">{record.score}/{record.total}</span>
                      <span className="text-[9px] text-white/30 font-mono">
                        {new Date(record.date).toLocaleDateString(
                          locale === "en-US" ? "en-US" : "zh-CN",
                          { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Small footer hint */}
        <div className="flex items-center gap-2 text-[10px] text-white/25 font-mono">
          <CheckCircle2 className="w-3 h-3" />
          <span>{t.progressHub.goalHint}</span>
        </div>
      </div>
    </div>
  );
}
