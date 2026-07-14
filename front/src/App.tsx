import React, { useState, useEffect, useRef } from "react";
import { 
  GraduationCap, 
  FileText, 
  Sparkles, 
  Route, 
  RotateCcw, 
  Send, 
  Paperclip,
  Search,
  Bell,
  HelpCircle,
  Activity,
  ArrowRight,
  BookOpen,
  Milestone,
  CheckCircle2,
  Lock,
  Compass,
  FileDown,
  RefreshCw,
  Plus,
  HelpCircle as HelpIcon,
  Flame,
  Award,
  Brain,
  Folder,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Sidebar from "./components/Sidebar";
import RightPanel from "./components/RightPanel";
import NotesChest from "./components/NotesChest";
import ActiveQuiz from "./components/ActiveQuiz";
import SettingsPage from "./components/SettingsPage";
import ToastContainer, { Notification } from "./components/ToastContainer";
import { Message, MasteryScores, NoteItem, NoteFolder, AIModelConfig, AI_MODEL_PRESETS, ReviewRecord } from "./types";
import { useI18n } from "./i18n";
import { useReminder } from "./hooks/useReminder";
import { useStudyTimer } from "./hooks/useStudyTimer";
import { db, loadSetting, saveSetting } from "./db";

export default function App() {
  const { t, locale } = useI18n();

  const PRESET_QUESTIONS = [
    t.presets.q1,
    t.presets.q2,
    t.presets.q3,
  ];

  const [isDbReady, setIsDbReady] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("study");
  const { minutesLearned, isRunning: isTimerRunning, startTimer, pauseTimer } = useStudyTimer();
  const [statusMode, setStatusMode] = useState<"simulator" | "gemini">("simulator");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

  // Theme & Reminder settings (persisted in localStorage)
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("quickly_theme") || "dark");
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(() => localStorage.getItem("quickly_reminder_enabled") !== "false");
  const [reminderTime, setReminderTime] = useState<string>(() => localStorage.getItem("quickly_reminder_time") || "09:00");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => localStorage.getItem("quickly_sound_enabled") !== "false");
  const [autoSaveNotes, setAutoSaveNotes] = useState<boolean>(() => localStorage.getItem("quickly_auto_save") !== "false");
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("quickly_daily_goal");
    return saved ? parseInt(saved) : 60;
  });
  const [weeklyGoal, setWeeklyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("quickly_weekly_goal");
    return saved ? parseInt(saved) : 14;
  });

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("quickly_theme", theme);
  }, [theme]);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "notif-welcome",
      type: "info",
      title: locale === "en-US" ? "Welcome to Quickly" : "欢迎使用 Quickly",
      message: locale === "en-US" ? "Start your learning journey today!" : "开始今天的学习之旅吧！",
      timestamp: new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }
  ]);
  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const addNotification = (title: string, message: string, type: Notification["type"] = "reminder") => {
    const newNotif: Notification = {
      id: `notif-${Date.now()}`,
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
    setNotifications(prev => [newNotif, ...prev]);
    setActiveToasts(prev => [...prev, newNotif]);
  };

  const dismissToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
    setShowNotifDropdown(false);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Reminder hook
  useReminder({
    enabled: reminderEnabled,
    time: reminderTime,
    soundEnabled,
    onFire: ({ title, message }) => addNotification(title, message, "reminder"),
  });

  // Core interactive states
  const [scores, setScores] = useState<MasteryScores>({
    logisticRegression: 82,
    gradientDescent: 61,
    regularization: 44,
  });

  // Review history tracking
  const [reviewHistory, setReviewHistory] = useState<ReviewRecord[]>([]);

  // Compute mastery stats from review history
  const getTopicMastery = (topicId: string) => {
    const records = reviewHistory.filter(r => r.topicId === topicId);
    if (records.length === 0) return null;
    const avgAccuracy = Math.round(records.reduce((sum, r) => sum + r.accuracy, 0) / records.length);
    return { avgAccuracy, quizCount: records.length, lastDate: records[0].date };
  };

  const reviewedTopics = reviewHistory.reduce((acc, r) => {
    if (!acc.find(t => t.topicId === r.topicId)) {
      const records = reviewHistory.filter(x => x.topicId === r.topicId);
      const avgAccuracy = Math.round(records.reduce((sum, x) => sum + x.accuracy, 0) / records.length);
      acc.push({ topicId: r.topicId, topicName: r.topicName, avgAccuracy, quizCount: records.length, lastDate: records[0].date });
    }
    return acc;
  }, [] as { topicId: string; topicName: string; avgAccuracy: number; quizCount: number; lastDate: string }[]);

  const overallAccuracy = reviewHistory.length > 0
    ? Math.round(reviewHistory.reduce((sum, r) => sum + r.accuracy, 0) / reviewHistory.length)
    : 0;

  const [notes, setNotes] = useState<NoteItem[]>([
    {
      id: "note-lr",
      topic: "逻辑回归",
      content: "使用 sigmoid 曲线将预测值映射到 0-1 范围的概率分类，配合决策边界达成类别预测判定。",
      timestamp: "14:03",
      folderId: "folder-ml"
    }
  ]);

  // Folders state for organizing notes
  const [folders, setFolders] = useState<NoteFolder[]>([
    { id: "folder-ml", name: "机器学习", createdAt: "2025-01-01" },
    { id: "folder-math", name: "数学基础", createdAt: "2025-01-01" },
  ]);

  // Folder CRUD operations
  const createFolder = async (name: string) => {
    const newFolder: NoteFolder = {
      id: `folder-${Date.now()}`,
      name,
      createdAt: new Date().toISOString().slice(0, 10)
    };
    setFolders(prev => [...prev, newFolder]);
    await db.folders.add(newFolder);
  };

  const renameFolder = async (folderId: string, newName: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
    await db.folders.where("id").equals(folderId).modify({ name: newName });
  };

  const deleteFolder = async (folderId: string) => {
    setFolders(prev => prev.filter(f => f.id !== folderId));
    // Move notes in this folder to unassigned
    setNotes(prev => prev.map(n => n.folderId === folderId ? { ...n, folderId: undefined } : n));
    await db.folders.where("id").equals(folderId).delete();
    await db.notes.where("folderId").equals(folderId).modify({ folderId: undefined });
  };

  const moveNoteToFolder = async (noteId: string, folderId: string | undefined) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folderId } : n));
    await db.notes.where("id").equals(noteId).modify({ folderId });
  };

  const createNote = async (topic: string, content: string, folderId?: string) => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      topic,
      content,
      timestamp: new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }),
      folderId,
    };
    setNotes(prev => [newNote, ...prev]);
    await db.notes.add(newNote);
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg-init-user",
      sender: "user",
      text: "为什么逻辑回归适合用于二分类问题？",
      timestamp: "14:01"
    },
    {
      id: "msg-init-sys",
      sender: "system",
      text: `逻辑回归非常适合**二分类问题**，因为它输出的概率值在 **0 到 1** 之间，直接对应两类结果（例如：是/否，垃圾邮件/非垃圾邮件）。

它使用 **Sigmoid 函数** 将原始的线性预测压缩到这个概率范围内：
$$S(z) = \\frac{1}{1 + e^{-z}}$$

然后我们应用一个 **决策边界**（通常是 0.5）来对输出进行分类：
* 如果概率大于 0.5，则属于类别 1（正类）；
* 否则属于类别 0（负类）。

#### 与线性回归的区别
1. **有界输出**：线性回归预测值在 $[-\\infty, +\\infty]$，而逻辑回归输出 $[0, 1]$。
2. **鲁棒性（对异常值不敏感）**：线性回归容易被极值拉偏决策边界，而 Sigmoid 函数具有饱和性，对两端的异常样本非常稳定。`,
      timestamp: "14:02",
      chips: ["逻辑回归", "Sigmoid 函数", "决策边界"]
    }
  ]);

  const [inputText, setInputText] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [uploadAttached, setUploadAttached] = useState<string | null>(null);
  const [savingNoteMsgId, setSavingNoteMsgId] = useState<string | null>(null);
  const [savedNoteMsgIds, setSavedNoteMsgIds] = useState<Set<string>>(new Set());

  // AI Model Config state
  const [modelConfig, setModelConfig] = useState<AIModelConfig>(() => {
    const saved = localStorage.getItem("quickly_ai_config");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return AI_MODEL_PRESETS[0];
  });

  // Active Quiz Modal state
  const [activeQuiz, setActiveQuiz] = useState<{ topicId: string; topicName: string; noteContent?: string } | null>(null);

  // Header search state
  const [showHeaderSearch, setShowHeaderSearch] = useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [jumpToNoteId, setJumpToNoteId] = useState<string | null>(null);
  const [selectedNoteContext, setSelectedNoteContext] = useState<NoteItem | null>(null);
  const [showNoteSelector, setShowNoteSelector] = useState(false);
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const prevContextIdRef = useRef<string | null>(null);

  // Search results (filter notes by query)
  const headerSearchResults = headerSearchQuery.trim()
    ? notes.filter(n =>
        n.topic.toLowerCase().includes(headerSearchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(headerSearchQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const handleJumpToNote = (noteId: string) => {
    // Set the note as context for AI conversation
    const note = notes.find(n => n.id === noteId) || null;
    setSelectedNoteContext(note);
    setActiveTab("study");
    setShowHeaderSearch(false);
    setHeaderSearchQuery("");
  };

  // Dynamically populated next action steps based on the lower score
  const [nextSuggestion, setNextSuggestion] = useState<{ concept: string; detail: string }>({
    concept: "复习梯度下降",
    detail: "您的梯度优化掌握度较低（61%），建议立即通过10分钟自测题来快速冲刺加分。"
  });

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Context switching: save/restore messages per note
  useEffect(() => {
    const newContextKey = selectedNoteContext?.id || null;
    const oldContextKey = prevContextIdRef.current;

    // Only switch when context actually changed
    if (newContextKey === oldContextKey) return;

    // Save old context's messages (messages still holds old context data at this render)
    const saveKey = oldContextKey ?? "no-context";
    setMessagesMap(prev => ({ ...prev, [saveKey]: messages }));

    // Load new context's messages
    const loadKey = newContextKey ?? "no-context";
    setMessages(messagesMap[loadKey] || []);

    prevContextIdRef.current = newContextKey;
  }, [selectedNoteContext]);

  // Load persisted data from IndexedDB on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const [dbFolders, dbNotes, dbReviews, dbSettings] = await Promise.all([
          db.folders.toArray(),
          db.notes.toArray(),
          db.reviewHistory.toArray(),
          db.appSettings.toArray(),
        ]);
        if (dbFolders.length > 0) {
          setFolders(dbFolders.map(f => ({ id: f.id, name: f.name, createdAt: f.createdAt })));
        }
        if (dbNotes.length > 0) {
          setNotes(dbNotes.map(n => ({ id: n.id, topic: n.topic, content: n.content, timestamp: n.timestamp, folderId: n.folderId })));
        }
        if (dbReviews.length > 0) {
          setReviewHistory(dbReviews as unknown as ReviewRecord[]);
        }
        // Restore settings from IndexedDB
        for (const s of dbSettings) {
          try {
            const val = JSON.parse(s.value);
            if (s.key === "dailyGoal") setDailyGoal(val);
            else if (s.key === "weeklyGoal") setWeeklyGoal(val);
            else if (s.key === "reminderTime") setReminderTime(val);
            else if (s.key === "scores") setScores(val);
            else if (s.key === "soundEnabled") setSoundEnabled(val);
            else if (s.key === "autoSaveNotes") setAutoSaveNotes(val);
          } catch { /* ignore corrupt entries */ }
        }
      } catch (e) {
        console.error("IndexedDB hydration failed", e);
      } finally {
        setIsDbReady(true);
      }
    }
    hydrate();
  }, []);

  // Persist scores and minutesLearned to IndexedDB when they change
  useEffect(() => {
    if (!isDbReady) return;
    saveSetting("scores", scores);
  }, [scores, isDbReady]);

  // Check API mode on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch("/api/status");
        const data = await response.json();
        setStatusMode(data.mode);
        setHasApiKey(data.hasApiKey);
      } catch (e) {
        console.error("Status check failed, running simulator", e);
      }
    }
    checkStatus();
  }, []);

  // Set up next step suggestions dynamically based on review history
  useEffect(() => {
    if (reviewedTopics.length > 0) {
      // Find weakest topic from review history
      const weakest = reviewedTopics.reduce((min, t) => t.avgAccuracy < min.avgAccuracy ? t : min, reviewedTopics[0]);
      setNextSuggestion({
        concept: weakest.topicName,
        detail: `${weakest.topicName} 的平均正确率为 ${weakest.avgAccuracy}%（${weakest.quizCount} 次复习）。建议再复习一次以巩固掌握度。`
      });
    } else {
      setNextSuggestion({
        concept: locale === "en-US" ? "Start Review" : "开始复习",
        detail: locale === "en-US" ? "Go to the Review tab and take your first quiz to track your mastery!" : "前往复习板块完成第一次自测，开始追踪您的掌握度！"
      });
    }
  }, [reviewedTopics, locale]);

  // Scroll chat bottom helper
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // Handle send message
  const handleSendMessage = async (textToSend: string) => {
    const textClean = textToSend.trim();
    if (!textClean) return;

    const userMsgId = "msg-u-" + Date.now();
    const nowStr = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    
    const userMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: textClean,
      timestamp: nowStr
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setUploadAttached(null);
    setIsSending(true);

    // AI placeholder
    const thinkingMsgId = "msg-thinking-" + Date.now();
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      sender: "system",
      text: "",
      timestamp: nowStr,
      isThinking: true
    };
    setMessages(prev => [...prev, thinkingMsg]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          question: textClean,
          modelConfig: {
            provider: modelConfig.provider,
            apiKey: modelConfig.apiKey,
            apiBase: modelConfig.apiBase,
            model: modelConfig.model,
          },
          noteContext: selectedNoteContext ? {
            topic: selectedNoteContext.topic,
            content: selectedNoteContext.content,
          } : undefined,
        }),
      });
      const data = await response.json();

      // Remove thinking line and replace with authentic payload
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== thinkingMsgId);
        return [
          ...filtered,
          {
            id: "msg-sys-" + Date.now(),
            sender: "system",
            text: data.text,
            timestamp: nowStr,
            chips: data.chips
          }
        ];
      });

      // Update Mastery Scores dynamically
      if (data.topicMasteryImpact) {
        setScores(prev => ({
          logisticRegression: Math.min(100, Math.max(0, prev.logisticRegression + (data.topicMasteryImpact.logisticRegression || 0))),
          gradientDescent: Math.min(100, Math.max(0, prev.gradientDescent + (data.topicMasteryImpact.gradientDescent || 0))),
          regularization: Math.min(100, Math.max(0, prev.regularization + (data.topicMasteryImpact.regularization || 0))),
        }));
      }

      // Prepend automatic notes distillation
      if (data.autoNote) {
        const matchingTopic = data.chips?.[0] || "智能答疑";
        const newNote: NoteItem = {
          id: "note-" + Date.now(),
          topic: matchingTopic,
          content: data.autoNote,
          timestamp: nowStr,
        };
        setNotes(prev => [newNote, ...prev]);
        db.notes.add(newNote);
      }

      // Auto-save Q&A pair to note when a note context is selected
      if (selectedNoteContext) {
        const autoContent = `Q: ${textClean}\n\nA: ${data.text}`;
        const autoTopic = data.chips?.[0] || selectedNoteContext.topic;
        const autoNote: NoteItem = {
          id: "note-" + Date.now() + 1,
          topic: autoTopic,
          content: autoContent,
          timestamp: nowStr,
          folderId: selectedNoteContext.folderId,
        };
        setNotes(prev => [autoNote, ...prev]);
        db.notes.add(autoNote);
      }

      // Adjust next prompt suggest in data
      if (data.nextSuggestion) {
        setNextSuggestion(data.nextSuggestion);
      }

    } catch (e) {
      console.error("Failed to post chat API", e);
      // Clean thinking indicator
      setMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
    } finally {
      setIsSending(false);
    }
  };

  // Set file upload context
  const simulateFileUpload = () => {
    setUploadAttached("context_raw_data.csv");
  };

  // Support sidebar fast interaction selectors
  const handleSelectRightTopic = (topicId: string) => {
    const textMap: Record<string, string> = {
      "logistic-regression": "了解逻辑回归分类器及其 Sigmoid 推导过程",
      "gradient-descent": "介绍梯度下降学习率及优化权重收敛的速度参数",
      "regularization": "解答 L1/L2 正则化惩罚项以及对抗多维过拟合的机制"
    };
    handleSendMessage(textMap[topicId] || "了解关于逻辑回归的内容");
  };

  // Start Quiz Callback
  const handleStartQuiz = (topicId: string, topicName: string, noteContent?: string) => {
    setActiveQuiz({ topicId, topicName, noteContent });
  };

  // Complete Quiz score bump - records review history
  const handleQuizComplete = async (result: { score: number; total: number; accuracy: number }) => {
    if (activeQuiz) {
      // Record review history
      const record: ReviewRecord = {
        topicId: activeQuiz.topicId,
        topicName: activeQuiz.topicName,
        score: result.score,
        total: result.total,
        accuracy: result.accuracy,
        date: new Date().toISOString(),
      };
      setReviewHistory(prev => [record, ...prev]);
      await db.reviewHistory.add(record);

      // Update legacy scores for known topics
      const bonusPct = Math.round((result.score / result.total) * 10);
      const tid = activeQuiz.topicId;
      setScores(prev => {
        const next = { ...prev };
        if (tid === "logistic-regression") {
          next.logisticRegression = Math.min(100, next.logisticRegression + bonusPct);
        } else if (tid === "gradient-descent") {
          next.gradientDescent = Math.min(100, next.gradientDescent + bonusPct);
        } else if (tid === "regularization") {
          next.regularization = Math.min(100, next.regularization + bonusPct);
        }
        return next;
      });
    }
  };

  // Handle saving a note from chat message (AI organized + review questions)
  const handleSaveNote = async (msgId: string, msgText: string, msgChips: string[]) => {
    setSavingNoteMsgId(msgId);
    try {
      // Send recent conversation messages to server.ts for AI organization
      const recentMsgs = messages.slice(-6); // last 6 messages for context
      const response = await fetch("/api/save-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recentMsgs,
          modelConfig: {
            provider: modelConfig.provider,
            apiKey: modelConfig.apiKey,
            apiBase: modelConfig.apiBase,
            model: modelConfig.model,
          },
        }),
      });
      if (!response.ok) throw new Error("Save note failed");
      const data = await response.json();

      // Add the organized note to local state
      const nowStr = new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" });
      const newNote: NoteItem = {
        id: "note-" + Date.now(),
        topic: data.note.topic,
        content: data.note.content || data.note.topic,
        timestamp: nowStr,
      };
      setNotes(prev => [newNote, ...prev]);
      db.notes.add(newNote);

      // Mark as saved
      setSavedNoteMsgIds(prev => new Set(prev).add(msgId));

      // Show success notification
      addNotification(
        t.header.noteSavedTitle,
        `${t.study.savedNoteSuccess}: ${data.note.topic}`,
        "success"
      );
    } catch (e) {
      console.error("Failed to save note", e);
    } finally {
      setSavingNoteMsgId(null);
    }
  };

  const deleteNote = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    await db.notes.where("id").equals(id).delete();
  };

  const updateNote = async (id: string, updatedContent: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, content: updatedContent } : n));
    await db.notes.where("id").equals(id).modify({ content: updatedContent });
  };

  const latestNote = notes.length > 0 ? notes[0] : null;

  const handleToggleTimer = () => {
    if (isTimerRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  };

  // Show loading screen while IndexedDB is hydrating
  if (!isDbReady) {
    return (
      <div className="flex bg-[#181818] text-[#e3e3de] min-h-screen items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <svg className="w-10 h-10 text-[#b8f600] mx-auto animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10" />
            <path d="M6 10h10" />
            <path d="M11 14h5" />
            <path d="m15 18 3 3 5-5" />
          </svg>
          <p className="text-sm text-[#c3caac]/60">Quickly 正在启动...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-[#181818] text-[#e3e3de] min-h-screen font-mono selection:bg-[#b8f600] selection:text-black" id="applet-viewport">
      
      {/* 1. LEFT SIDEBAR */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        minutesLearned={minutesLearned}
        dailyGoal={dailyGoal}
        isTimerRunning={isTimerRunning}
        onToggleTimer={handleToggleTimer}
      />

      {/* 2. DYNAMIC WORKSPACE BODY */}
      <div className="flex-1 flex flex-col min-h-screen relative bg-[#121411]" id="quickly-dynamic-workspace">
        
        {/* Top universal Header */}
        <header className="h-16 px-6 border-b border-[#434933]/30 flex items-center justify-between sticky top-0 bg-[#121411]/90 backdrop-blur-md z-40" id="study-global-header">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs text-[#c3caac]" id="header-breadcrumbs">
            {activeTab === "notes" ? (
              <>
                <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("notes")}>
                  {t.notes.allNotes}
                </span>
                <span className="text-[#434933] font-bold">/</span>
                <span className="text-[#b8f600] font-bold text-xs">
                  {jumpToNoteId 
                    ? notes.find(n => n.id === jumpToNoteId)?.topic || t.notes.allNotes
                    : folders.find(f => f.id === notes.find(n => n.id === jumpToNoteId)?.folderId)?.name || t.notes.allNotes
                  }
                </span>
              </>
            ) : (
              <>
                <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("study")}>
                  {selectedNoteContext
                    ? (folders.find(f => f.id === selectedNoteContext.folderId)?.name || (locale === "en-US" ? "All Notes" : "所有笔记"))
                    : (locale === "en-US" ? "All Notes" : "所有笔记")
                  }
                </span>
                <span className="text-[#434933] font-bold">/</span>
                <div className="relative flex items-center">
                  {selectedNoteContext ? (
                    <>
                      <button
                        onClick={() => setShowNoteSelector(!showNoteSelector)}
                        className="text-[#b8f600] font-bold text-xs max-w-[200px] truncate hover:text-white transition-colors cursor-pointer"
                        title={selectedNoteContext.topic}
                      >
                        {selectedNoteContext.topic}
                      </button>
                      <button
                        onClick={() => setSelectedNoteContext(null)}
                        className="ml-1 p-0.5 rounded text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        title={locale === "en-US" ? "Clear context" : "清除上下文"}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShowNoteSelector(!showNoteSelector)}
                      className="text-[#b8f600] font-bold text-xs hover:text-white transition-colors cursor-pointer"
                    >
                      {locale === "en-US" ? "Logistic Regression" : "逻辑回归"}
                    </button>
                  )}

                  {/* Note Selector Dropdown */}
                  <AnimatePresence>
                    {showNoteSelector && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowNoteSelector(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="absolute left-0 top-full mt-2 w-72 bg-[#222222] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden"
                        >
                          {/* New Conversation */}
                          <button
                            onClick={() => {
                              const ctxKey = selectedNoteContext?.id || "no-context";
                              setMessagesMap(prev => ({ ...prev, [ctxKey]: [], "no-context": [] }));
                              setSelectedNoteContext(null);
                              setMessages([]);
                              setShowNoteSelector(false);
                            }}
                            className="w-full text-left px-4 py-2.5 border-b border-white/5 hover:bg-[#1a1c19] transition-colors flex items-center gap-2 text-[#c3caac]"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#b8f600]" />
                            <span className="text-[11px]">{locale === "en-US" ? "New Conversation" : "新对话"}</span>
                          </button>

                          <div className="max-h-64 overflow-y-auto">
                            {folders.map(folder => {
                              const folderNotes = notes.filter(n => n.folderId === folder.id);
                              if (folderNotes.length === 0) return null;
                              return (
                                <div key={folder.id}>
                                  <div className="px-4 py-1.5 text-[9px] font-mono text-white/30 uppercase tracking-wider flex items-center gap-1">
                                    <Folder className="w-3 h-3" />
                                    {folder.name}
                                  </div>
                                  {folderNotes.map(note => (
                                    <button
                                      key={note.id}
                                      onClick={() => { setSelectedNoteContext(note); setShowNoteSelector(false); }}
                                      className={`w-full text-left px-6 py-2 text-[11px] hover:bg-[#1a1c19] transition-colors truncate ${
                                        selectedNoteContext?.id === note.id ? "text-[#b8f600] bg-[#b8f600]/5" : "text-[#e3e3de]"
                                      }`}
                                    >
                                      {note.topic}
                                    </button>
                                  ))}
                                </div>
                              );
                            })}

                            {/* Unassigned notes */}
                            {(() => {
                              const unassigned = notes.filter(n => !n.folderId);
                              if (unassigned.length === 0) return null;
                              return (
                                <div>
                                  <div className="px-4 py-1.5 text-[9px] font-mono text-white/30 uppercase tracking-wider flex items-center gap-1">
                                    <Folder className="w-3 h-3" />
                                    {locale === "en-US" ? "Unassigned" : "未分类"}
                                  </div>
                                  {unassigned.map(note => (
                                    <button
                                      key={note.id}
                                      onClick={() => { setSelectedNoteContext(note); setShowNoteSelector(false); }}
                                      className={`w-full text-left px-6 py-2 text-[11px] hover:bg-[#1a1c19] transition-colors truncate ${
                                        selectedNoteContext?.id === note.id ? "text-[#b8f600] bg-[#b8f600]/5" : "text-[#e3e3de]"
                                      }`}
                                    >
                                      {note.topic}
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}

                            {notes.length === 0 && (
                              <div className="py-6 text-center">
                                <BookOpen className="w-6 h-6 text-white/10 mx-auto mb-2" />
                                <p className="text-[10px] text-white/40">{locale === "en-US" ? "No notes yet" : "暂无笔记"}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>

          {/* Progress / Task Status */}
          <div className="flex items-center gap-4" id="header-progress-items">
            <div className="flex items-center gap-2.5 text-xs">
              <span className="text-xs text-[#c3caac] font-medium">
                {t.header.progress}
              </span>
              <div className="w-32 bg-[#2A2A2A] h-1 rounded-full overflow-hidden">
                <div className="h-full bg-[#b8f600] opacity-80" style={{ width: "60%" }} />
              </div>
              <span className="text-xs text-[#e3e3de] font-mono font-medium">
                3/5 {t.header.tasks}
              </span>
            </div>

            <div className="h-4 w-px bg-[#434933]/30" />

            {/* Actions */}
            <div className="flex items-center gap-3 text-[#c3caac]" id="header-bell-actions">
              {/* Bell with dropdown */}
              <div className="relative">
                <button 
                  id="header-btn-news"
                  onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                  className="hover:text-[#b8f600] transition-colors relative p-1.5 rounded hover:bg-[#1a1c19]"
                  title={t.header.systemMsg}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#f43f5e] text-white text-[9px] font-bold">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                <AnimatePresence>
                  {showNotifDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowNotifDropdown(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute right-0 top-full mt-2 w-80 bg-[#222222] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                          <span className="text-xs font-bold text-[#e3e3de]">{t.header.systemMsg}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                              }}
                              className="text-[10px] text-[#c3caac] hover:text-[#b8f600] transition-colors"
                            >
                              {t.header.markAllRead}
                            </button>
                            <button
                              onClick={clearNotifications}
                              className="text-[10px] text-[#c3caac] hover:text-rose-400 transition-colors"
                            >
                              {t.header.clearAll}
                            </button>
                          </div>
                        </div>

                        {/* Notification List */}
                        <div className="max-h-72 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <div className="py-8 text-center">
                              <Bell className="w-8 h-8 text-white/10 mx-auto mb-2" />
                              <p className="text-[11px] text-white/40">{t.header.noNotifications}</p>
                            </div>
                          ) : (
                            notifications.map(notif => (
                              <div
                                key={notif.id}
                                className={`px-4 py-3 border-b border-white/5 hover:bg-[#1a1c19] transition-colors cursor-pointer ${!notif.read ? "bg-[#b8f600]/5" : ""}`}
                                onClick={() => {
                                  setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                                }}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                    notif.type === "reminder" ? "bg-[#b8f600]/10 text-[#b8f600]" :
                                    notif.type === "success" ? "bg-[#b8f600]/10 text-[#b8f600]" :
                                    notif.type === "warning" ? "bg-amber-400/10 text-amber-400" :
                                    "bg-blue-400/10 text-blue-400"
                                  }`}>
                                    {notif.type === "reminder" ? <Bell className="w-3 h-3" /> :
                                     notif.type === "success" ? <CheckCircle2 className="w-3 h-3" /> :
                                     <Bell className="w-3 h-3" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`text-[11px] font-medium truncate ${!notif.read ? "text-[#e3e3de]" : "text-[#c3caac]"}`}>
                                        {notif.title}
                                      </span>
                                      <span className="text-[9px] text-white/30 font-mono shrink-0">{notif.timestamp}</span>
                                    </div>
                                    <p className="text-[10px] text-white/40 mt-0.5 line-clamp-2">{notif.message}</p>
                                  </div>
                                  {!notif.read && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#b8f600] shrink-0 mt-1.5" />
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              
              {/* Search with dropdown */}
              <div className="relative">
                <button
                  id="header-btn-global-lookup"
                  onClick={() => { setShowHeaderSearch(!showHeaderSearch); setHeaderSearchQuery(""); }}
                  className={`transition-colors p-1.5 rounded hover:bg-[#1a1c19] ${showHeaderSearch ? "text-[#b8f600] bg-[#1a1c19]" : "hover:text-[#b8f600]"}`}
                  title={t.header.searchCourse}
                >
                  <Search className="w-4 h-4" />
                </button>

                <AnimatePresence>
                  {showHeaderSearch && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowHeaderSearch(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute right-0 top-full mt-2 w-80 bg-[#222222] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden"
                      >
                        {/* Search Input */}
                        <div className="p-3 border-b border-white/5">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                            <input
                              type="text"
                              value={headerSearchQuery}
                              onChange={(e) => setHeaderSearchQuery(e.target.value)}
                              placeholder={t.header.searchCourse}
                              className="w-full bg-[#1a1c19] border border-white/5 rounded pl-9 pr-3 py-2 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600]"
                              autoFocus
                            />
                          </div>
                        </div>

                        {/* Search Results */}
                        <div className="max-h-64 overflow-y-auto">
                          {headerSearchQuery.trim() === "" ? (
                            <div className="py-6 text-center">
                              <Search className="w-6 h-6 text-white/10 mx-auto mb-2" />
                              <p className="text-[10px] text-white/40">{t.header.searchCourse}</p>
                            </div>
                          ) : headerSearchResults.length === 0 ? (
                            <div className="py-6 text-center">
                              <p className="text-[10px] text-white/40">{t.header.noNotifications}</p>
                            </div>
                          ) : (
                            headerSearchResults.map(note => {
                              const folder = folders.find(f => f.id === note.folderId);
                              return (
                                <button
                                  key={note.id}
                                  onClick={() => handleJumpToNote(note.id)}
                                  className="w-full text-left px-4 py-2.5 border-b border-white/5 hover:bg-[#1a1c19] transition-colors"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-medium text-[#e3e3de] truncate">{note.topic}</span>
                                    <span className="text-[9px] text-white/30 font-mono shrink-0">{note.timestamp}</span>
                                  </div>
                                  {folder && (
                                    <span className="inline-flex items-center gap-1 text-[9px] text-[#c3caac] mt-0.5">
                                      <Folder className="w-2.5 h-2.5" />
                                      {folder.name}
                                    </span>
                                  )}
                                  <p className="text-[10px] text-white/40 mt-0.5 line-clamp-1">{note.content}</p>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="mr-2" />
            </div>
          </div>
        </header>

        {/* Tab Interface Router */}
        <main className="flex-1 flex flex-col min-h-0" id="workspace-routing-layer">
          
          {/* TAB 1: STUDY AREA */}
          {activeTab === "study" && (
            <div className="flex-1 flex flex-col h-full bg-[#121411] overflow-hidden" id="tab-study-pane">
              <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col h-full overflow-hidden justify-between p-6">
                
                {/* Intro Title */}
                <div className="mb-4 text-left select-none" id="chat-tab-heading">
                  <h1 className="text-xl font-bold tracking-tight text-[#e3e3de]">
                    {t.study.title}
                  </h1>
                  <p className="text-[11px] text-[#c3caac]/70 mt-1">
                    {t.study.subtitle}
                  </p>
                  {/* Note Context Indicator */}
                  {selectedNoteContext && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-[#b8f600]/5 border border-[#b8f600]/20 rounded w-fit">
                      <BookOpen className="w-3.5 h-3.5 text-[#b8f600]" />
                      <span className="text-[10px] text-[#b8f600] font-medium">
                        {locale === "en-US" ? "Context:" : "基于笔记:"}
                      </span>
                      <span className="text-[10px] text-[#e3e3de] font-mono truncate max-w-[200px]">
                        {selectedNoteContext.topic}
                      </span>
                      <button
                        onClick={() => setSelectedNoteContext(null)}
                        className="p-0.5 rounded text-white/30 hover:text-rose-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Messages Viewport scrollable */}
                <div 
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto space-y-6 scrollbar-none pb-4"
                  id="chat-messages-viewport"
                >
                  {messages.length === 0 ? (
                    <div className="text-center py-16" id="welcome-chat-center">
                      <GraduationCap className="w-12 h-12 text-[#b8f600] opacity-30 mx-auto mb-4 animate-pulse" />
                      <p className="text-sm font-semibold text-[#e3e3de]">{t.study.welcomeTitle}</p>
                      <p className="text-xs text-[#c3caac]/60 mt-1 max-w-sm mx-auto">
                        {t.study.welcomeDesc}
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isSystem = m.sender === "system";
                      return (
                        <div 
                          key={m.id}
                          id={`chat-bubble-${m.id}`}
                          className={`flex gap-4 ${isSystem ? "justify-start items-start" : "justify-end"}`}
                        >
                          {/* AI Avatar Side Icon */}
                          {isSystem && (
                            <div className="w-8 h-8 rounded-full border border-[#434933]/45 flex items-center justify-center bg-[#1a1c19] shrink-0 mt-0.5 shadow-sm select-none">
                              <Brain className="w-4.5 h-4.5 text-[#b8f600]" />
                            </div>
                          )}

                          <div className={`flex flex-col ${isSystem ? "flex-1" : "max-w-[80%]"}`}>
                            <div className={`rounded-lg p-4 border border-white/5 text-xs text-[#e3e3de] leading-relaxed shadow-sm ${
                              isSystem 
                                ? "bg-[#222222] rounded-tl-sm space-y-3" 
                                : "bg-[#222222] rounded-tr-sm"
                            }`}>
                              
                              {/* Sender Name & Time */}
                              <div className="flex items-center gap-2 text-[9px] font-mono text-white/30 tracking-wider pb-1.5 border-b border-outline-variant/20 select-none">
                                <span className="font-bold">{isSystem ? t.study.aiAssistant : t.study.student}</span>
                                <span>•</span>
                                <span>{m.timestamp}</span>
                              </div>

                              {m.isThinking ? (
                                <div className="flex items-center gap-2 py-1 select-none" id="ai-thinking-spark">
                                  <span className="w-1.5 h-1.5 bg-[#b8f600] rounded-full animate-ping" />
                                  <span className="text-[10px] font-mono text-[#b8f600] animate-pulse">
                                    {t.study.aiThinking}
                                  </span>
                                </div>
                              ) : (
                                /* Message text contents */
                                <div className="space-y-3">
                                  {isSystem && m.text.includes("逻辑回归非常适合") ? (
                                    <div className="space-y-3.5 leading-relaxed font-sans text-xs text-[#e3e3de]">
                                      <p className="text-left">
                                        逻辑回归非常适合二分类问题，因为它输出的概率值在0到1之间，直接对应两类结果（例如：是/否，垃圾邮件/非垃圾邮件）。
                                      </p>
                                      <p className="text-left">
                                        它使用 <span className="border-b border-[#b8f600] pb-0.5 font-bold hover:text-[#b8f600] transition-colors">Sigmoid 函数</span> 将原始的线性预测压缩到这个概率范围内。然后我们应用一个 <span className="border-b border-[#b8f600] pb-0.5 font-bold hover:text-[#b8f600] transition-colors">决策边界（通常是0.5）</span> 来对输出进行分类：如果概率大于0.5，则属于类别1；否则属于类别0。
                                      </p>
                                      <p className="text-left">
                                        与线性回归（可能预测出[0,1]范围之外的值且对异常值敏感）不同，<span className="border-b border-[#b8f600] pb-0.5 font-bold hover:text-[#b8f600] transition-colors">逻辑回归</span> 保持了有界的输出，专为类别决策量身定制。
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="whitespace-pre-line leading-relaxed text-[#e3e3de] text-left">
                                      {m.text}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Sub-chips & Status Bar for AI bubble */}
                            {isSystem && !m.isThinking && m.chips && m.chips.length > 0 && (
                              <div className="flex items-center justify-between mt-2 select-none w-full" id={`chips-row-${m.id}`}>
                                <div className="flex gap-1.5">
                                  {m.chips.map((chip, idx) => (
                                    <span 
                                      key={idx}
                                      className="bg-[#2A2A2A] border border-white/5 rounded px-2 py-0.5 text-[10px] text-white/60 font-mono"
                                    >
                                      {chip}
                                    </span>
                                  ))}
                                </div>
                                {/* Save to Notes button */}
                                {savedNoteMsgIds.has(m.id) ? (
                                  <span className="text-[10px] text-[#b8f600]/80 italic flex items-center gap-1 font-medium select-none">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{t.study.noteSaved}</span>
                                  </span>
                                ) : savingNoteMsgId === m.id ? (
                                  <span className="text-[10px] text-amber-400/80 italic flex items-center gap-1 font-medium animate-pulse select-none">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>{t.study.savingNote}</span>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleSaveNote(m.id, m.text, m.chips || [])}
                                    className="text-[10px] text-[#b8f600] hover:text-[#a6d600] hover:bg-[#b8f600]/10 border border-[#b8f600]/20 hover:border-[#b8f600]/40 rounded px-2.5 py-1 flex items-center gap-1 font-medium transition-all cursor-pointer select-none"
                                    title={t.study.saveToNote}
                                  >
                                    <BookOpen className="w-3 h-3" />
                                    <span>{t.study.saveToNote}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Suggestions shortcuts */}
                <div className="py-2.5 border-t border-white/5 bg-[#121411]/25 select-none text-left shrink-0" id="preset-suggestions-bar">
                  <span className="text-[10px] uppercase font-mono text-white/30 tracking-wider block mb-2 font-semibold">
                    {t.study.youMayAsk}
                  </span>
                  <div className="flex flex-wrap gap-2 pb-1" id="presets-container-row">
                    {PRESET_QUESTIONS.map((pq, idx) => (
                      <button
                        key={idx}
                        id={`preset-question-btn-${idx}`}
                        onClick={() => handleSendMessage(pq)}
                        className="text-[11px] text-[#c3caac] hover:text-[#b8f600] bg-[#1a1c19] border border-white/5 hover:border-[#b8f600]/30 px-3 py-1.5 rounded transition-all cursor-pointer font-medium"
                      >
                        {pq}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input Dock */}
                <div className="pt-4 border-t border-[#434933]/30 bg-[#121411]/25 shrink-0" id="study-input-dock">
                  <div className="bg-[#222222] border border-white/5 rounded-lg p-3 flex flex-col focus-within:border-[#b8f600] transition-colors group" id="chat-input-wrapper">
                    
                    {uploadAttached && (
                      <div className="flex items-center gap-1.5 bg-[#b8f600]/10 border border-[#b8f600]/20 px-2 py-1 rounded text-[11px] text-[#b8f600] font-mono mb-2 w-max" id="file-upload-chip">
                        <Paperclip className="w-3 h-3" />
                        <span>{uploadAttached}</span>
                        <button 
                          onClick={() => setUploadAttached(null)} 
                          className="hover:text-white ml-1 font-bold text-xs"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    <textarea
                      id="chat-textarea-box"
                      rows={2}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(inputText);
                        }
                      }}
                      placeholder={t.study.inputPlaceholder}
                      className="w-full bg-transparent resize-none text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:ring-0"
                    />

                    <div className="flex items-center justify-between pt-2.5 border-t border-white/5 mt-2" id="chat-input-toolbar">
                      <button
                        id="btn-upload-file-trigger"
                        onClick={simulateFileUpload}
                        className="flex items-center gap-1 text-[#c3caac] hover:text-white transition-colors py-1 px-3 rounded bg-[#2A2A2A] border border-white/5 text-[10px]"
                        title={t.study.uploadContext}
                      >
                        <Paperclip className="w-3 h-3" />
                        <span>{t.study.uploadContext}</span>
                      </button>

                      <button
                        id="btn-send-message-action"
                        onClick={() => handleSendMessage(inputText)}
                        disabled={isSending || !inputText.trim()}
                        className="bg-[#b8f600] text-[#141f00] font-bold text-xs px-4 py-1.5 rounded flex items-center gap-1 hover:bg-[#a1d800] transition-colors opacity-90 hover:opacity-100 disabled:opacity-30 disabled:hover:bg-[#b8f600]"
                      >
                        <span>{t.study.send}</span>
                        <span className="font-bold">&gt;</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NOTES CHEST */}
          {activeTab === "notes" && (
            <NotesChest
              notes={notes} 
              onDelete={deleteNote} 
              onUpdate={updateNote}
              folders={folders}
              onCreateFolder={createFolder}
              onRenameFolder={renameFolder}
              onDeleteFolder={deleteFolder}
              onMoveNoteToFolder={moveNoteToFolder}
              onCreateNote={createNote}
              jumpToNoteId={jumpToNoteId}
            />
          )}

          {/* TAB 3: MASTERY STAT DETAILS */}
          {activeTab === "mastery" && (
            <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto" id="mastery-dashboard-pane">
              <div className="max-w-5xl mx-auto space-y-8 text-left" id="mastery-scroll-context">
                <div>
                  <h2 className="text-xl font-bold text-[#e3e3de]">{t.mastery.title}</h2>
                  <p className="text-xs text-[#c3caac]/70 mt-1">
                    {t.mastery.subtitle}
                  </p>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="mastery-boxes-grid">
                  <div className="bg-[#222222] border border-white/5 p-5 rounded flex flex-col justify-between">
                    <div>
                      <span className="text-xs uppercase font-mono text-[#b8f600] block mb-2 font-bold">
                        {locale === "en-US" ? "Total Quizzes" : "总复习次数"}
                      </span>
                      <h4 className="text-4xl font-extrabold text-[#e3e3de] font-mono">
                        {reviewHistory.length}
                      </h4>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] text-white/40 block mt-1">
                        {locale === "en-US" ? "Completed review sessions" : "已完成的复习场次"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#222222] border border-white/5 p-5 rounded flex flex-col justify-between">
                    <div>
                      <span className="text-xs uppercase font-mono text-amber-400 block mb-2 font-bold">
                        {locale === "en-US" ? "Overall Accuracy" : "整体正确率"}
                      </span>
                      <h4 className="text-4xl font-extrabold text-[#e3e3de] font-mono">
                        {overallAccuracy}%
                      </h4>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] text-white/40 block mt-1">
                        {locale === "en-US" ? "Average across all quizzes" : "所有复习的平均正确率"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#222222] border border-white/5 p-5 rounded flex flex-col justify-between">
                    <div>
                      <span className="text-xs uppercase font-mono text-rose-400 block mb-2 font-bold">
                        {locale === "en-US" ? "Topics Reviewed" : "已复习主题"}
                      </span>
                      <h4 className="text-4xl font-extrabold text-[#e3e3de] font-mono">
                        {reviewedTopics.length}
                      </h4>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] text-white/40 block mt-1">
                        {locale === "en-US" ? "Unique topics with quiz data" : "有复习数据的独立主题"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Per-Topic Mastery */}
                {reviewedTopics.length > 0 ? (
                  <div className="bg-[#222222] border border-white/5 rounded p-6">
                    <div className="flex items-center justify-between mb-6">
                      <span className="text-xs font-bold text-[#e3e3de] block">
                        {locale === "en-US" ? "Topic Mastery" : "各主题掌握度"}
                      </span>
                      <span className="text-[10px] font-mono text-white/40 uppercase">
                        {locale === "en-US" ? "Based on review data" : "基于复习数据"}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {reviewedTopics
                        .sort((a, b) => b.avgAccuracy - a.avgAccuracy)
                        .map(topic => {
                          const colorClass = topic.avgAccuracy >= 80
                            ? "bg-[#b8f600]"
                            : topic.avgAccuracy >= 50
                              ? "bg-amber-400"
                              : "bg-rose-500";
                          const textColor = topic.avgAccuracy >= 80
                            ? "text-[#b8f600]"
                            : topic.avgAccuracy >= 50
                              ? "text-amber-400"
                              : "text-rose-400";
                          return (
                            <div key={topic.topicId}>
                              <div className="flex justify-between text-xs text-[#c3caac] mb-1">
                                <span className="font-medium">{topic.topicName}</span>
                                <span className={`font-mono font-bold ${textColor}`}>
                                  {topic.avgAccuracy}%
                                </span>
                              </div>
                              <div className="w-full bg-[#111111] h-1.5 rounded-full">
                                <div
                                  className={`h-full ${colorClass} rounded-full transition-all`}
                                  style={{ width: `${topic.avgAccuracy}%` }}
                                />
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[9px] text-white/30 font-mono">
                                  {topic.quizCount} {locale === "en-US" ? "quizzes" : "次复习"}
                                </span>
                                <span className="text-[9px] text-white/30 font-mono">
                                  {new Date(topic.lastDate).toLocaleDateString(locale === "en-US" ? "en-US" : "zh-CN", { month: "short", day: "numeric" })}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#222222] border border-white/5 rounded p-8 text-center">
                    <Activity className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-xs text-white/40 font-mono">
                      {locale === "en-US" ? "No review data yet. Take a quiz to start tracking your mastery!" : "暂无复习数据。完成一次复习自测即可开始追踪掌握度。"}
                    </p>
                    <button
                      onClick={() => setActiveTab("review")}
                      className="mt-4 px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors"
                    >
                      {locale === "en-US" ? "Go to Review" : "前往复习"}
                    </button>
                  </div>
                )}

                {/* Recent Review History */}
                {reviewHistory.length > 0 && (
                  <div className="bg-[#222222] border border-white/5 rounded p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-[#e3e3de] block">
                        {locale === "en-US" ? "Recent Reviews" : "最近复习记录"}
                      </span>
                      <span className="text-[10px] font-mono text-white/40">
                        {reviewHistory.length} {locale === "en-US" ? "total" : "总计"}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {reviewHistory.slice(0, 10).map((record, idx) => (
                        <div
                          key={`${record.topicId}-${record.date}-${idx}`}
                          className="flex items-center justify-between px-4 py-2.5 bg-[#1a1c19] rounded border border-white/5"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`text-[10px] font-mono font-bold shrink-0 ${
                              record.accuracy >= 80 ? "text-[#b8f600]" :
                              record.accuracy >= 50 ? "text-amber-400" : "text-rose-400"
                            }`}>
                              {record.accuracy}%
                            </span>
                            <span className="text-[11px] text-[#e3e3de] truncate">{record.topicName}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[9px] text-white/30 font-mono">
                              {record.score}/{record.total}
                            </span>
                            <span className="text-[9px] text-white/30 font-mono">
                              {new Date(record.date).toLocaleDateString(locale === "en-US" ? "en-US" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PATH */}
          {activeTab === "path" && (
            <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto" id="path-dashboard-pane">
              <div className="max-w-2xl mx-auto space-y-8 text-left" id="path-scroll-context">
                <div>
                  <h2 className="text-xl font-bold text-[#e3e3de]">{t.path.title}</h2>
                  <p className="text-xs text-[#c3caac]/70 mt-1">
                    {t.path.subtitle}
                  </p>
                </div>

                <div className="space-y-4" id="path-milestones-list">
                  
                  {/* Milestone 1 */}
                  <div className="flex gap-4 border-l-2 border-[#b8f600]/30 pl-6 pb-6 relative" id="milestone-1">
                    <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-[#b8f600] flex items-center justify-center text-[10px] text-[#141f00] font-extrabold shadow shadow-[#b8f600]/35">
                      ✓
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-[#b8f600] font-bold">1 ({t.path.unlocked})</span>
                      <h4 className="text-sm font-bold text-[#e3e3de]">{t.path.milestone1Title}</h4>
                      <p className="text-xs text-[#c3caac]/75 leading-relaxed font-mono">
                        {t.path.milestone1Desc}
                      </p>
                    </div>
                  </div>

                  {/* Milestone 2 */}
                  <div className="flex gap-4 border-l-2 border-[#b8f600]/30 pl-6 pb-6 relative" id="milestone-2">
                    <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-[#b8f600] flex items-center justify-center text-[10px] text-[#141f00] font-extrabold animate-pulse">
                      •
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-[#b8f600] font-bold">2 ({t.path.learning})</span>
                      <h4 className="text-sm font-bold text-[#e3e3de]">{t.path.milestone2Title}</h4>
                      <p className="text-xs text-[#c3caac]/75 leading-relaxed font-mono">
                        {t.path.milestone2Desc}
                      </p>
                    </div>
                  </div>

                  {/* Milestone 3 */}
                  <div className="flex gap-4 border-l-2 border-white/5 pl-6 pb-6 relative" id="milestone-3">
                    <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-[#2A2A2A] border border-white/10 flex items-center justify-center text-[10px] text-white/40 font-mono">
                      🔒
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-white/40">3 ({t.path.locked})</span>
                      <h4 className="text-sm font-bold text-[#e3e3de] opacity-60">{t.path.milestone3Title}</h4>
                      <p className="text-xs text-[#c3caac]/60 leading-relaxed font-mono opacity-60">
                        {t.path.milestone3Desc}
                      </p>
                    </div>
                  </div>

                  {/* Milestone 4 */}
                  <div className="flex gap-4 pl-6 relative" id="milestone-4">
                    <div className="absolute -left-1 top-0.5 w-4 h-4 rounded-full bg-[#2A2A2A] border border-white/10 flex items-center justify-center text-[10px] text-white/40 font-mono">
                      🔒
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono text-white/40">4 ({t.path.locked})</span>
                      <h4 className="text-sm font-bold text-[#e3e3de] opacity-60">{t.path.milestone4Title}</h4>
                      <p className="text-xs text-[#c3caac]/60 leading-relaxed font-mono opacity-60">
                        {t.path.milestone4Desc}
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* TAB 5: REVIEW / QUIZ CENTER */}
          {activeTab === "review" && (
            <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto" id="review-dashboard-pane">
              <div className="max-w-2xl mx-auto space-y-8 text-left" id="review-scroll-context">
                <div>
                  <h2 className="text-xl font-bold text-[#e3e3de]">{t.review.title}</h2>
                  <p className="text-xs text-[#c3caac]/70 mt-1">
                    {t.review.subtitle}
                  </p>
                </div>

                {/* Review by Notes - Dynamic */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="w-4 h-4 text-[#b8f600]" />
                    <h3 className="text-sm font-bold text-[#e3e3de]">{t.review.reviewByNote}</h3>
                  </div>
                  <p className="text-xs text-[#c3caac]/70 mb-4">{t.review.reviewByNoteDesc}</p>

                  {notes.length === 0 ? (
                    <div className="bg-[#222222] border border-white/5 rounded p-6 text-center">
                      <BookOpen className="w-8 h-8 text-white/10 mx-auto mb-3" />
                      <p className="text-xs text-white/40">{t.review.noNotesForReview}</p>
                    </div>
                  ) : (
                    <>
                      {/* Group notes by folder */}
                      {folders.map(folder => {
                        const folderNotes = notes.filter(n => n.folderId === folder.id);
                        if (folderNotes.length === 0) return null;
                        return (
                          <div key={folder.id} className="mb-4">
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <Folder className="w-3.5 h-3.5 text-[#c3caac]" />
                              <span className="text-[11px] font-medium text-[#c3caac]">{folder.name}</span>
                              <span className="text-[9px] text-white/30 font-mono">({folderNotes.length} {t.review.noteCount})</span>
                            </div>
                            <div className="space-y-2">
                              {folderNotes.map(note => (
                                <div
                                  key={note.id}
                                  className="bg-[#222222] border border-white/5 rounded p-4 flex items-center justify-between group hover:border-[#b8f600]/25 transition-colors"
                                >
                                  <div className="min-w-0 flex-1 mr-4">
                                    <span className="text-[10px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2 py-0.5 rounded font-bold">
                                      {note.topic}
                                    </span>
                                    <p className="text-xs text-[#c3caac] mt-1.5 line-clamp-2">{note.content}</p>
                                    <span className="text-[9px] text-white/30 font-mono mt-1 block">{t.review.generatedFromNote}</span>
                                  </div>
                                  <button
                                    onClick={() => handleStartQuiz(note.id, note.topic, note.content)}
                                    className="px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors cursor-pointer shrink-0"
                                  >
                                    {t.review.startReview}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* Unassigned notes */}
                      {(() => {
                        const unassignedNotes = notes.filter(n => !n.folderId);
                        if (unassignedNotes.length === 0) return null;
                        return (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <Folder className="w-3.5 h-3.5 text-[#c3caac]" />
                              <span className="text-[11px] font-medium text-[#c3caac]">{t.notes.unassignedNotes}</span>
                              <span className="text-[9px] text-white/30 font-mono">({unassignedNotes.length} {t.review.noteCount})</span>
                            </div>
                            <div className="space-y-2">
                              {unassignedNotes.map(note => (
                                <div
                                  key={note.id}
                                  className="bg-[#222222] border border-white/5 rounded p-4 flex items-center justify-between group hover:border-[#b8f600]/25 transition-colors"
                                >
                                  <div className="min-w-0 flex-1 mr-4">
                                    <span className="text-[10px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2 py-0.5 rounded font-bold">
                                      {note.topic}
                                    </span>
                                    <p className="text-xs text-[#c3caac] mt-1.5 line-clamp-2">{note.content}</p>
                                    <span className="text-[9px] text-white/30 font-mono mt-1 block">{t.review.generatedFromNote}</span>
                                  </div>
                                  <button
                                    onClick={() => handleStartQuiz(note.id, note.topic, note.content)}
                                    className="px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors cursor-pointer shrink-0"
                                  >
                                    {t.review.startReview}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>

                {/* Original topic-based quizzes (keep as fallback) */}
                <div>
                  <div className="flex items-center gap-2 mb-4 mt-6">
                    <Brain className="w-4 h-4 text-[#b8f600]" />
                    <h3 className="text-sm font-bold text-[#e3e3de]">{t.mastery.title}</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-[#222222] border border-white/5 rounded p-4 flex items-center justify-between group hover:border-[#b8f600]/25 transition-colors">
                      <div>
                        <span className="text-[10px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2.5 py-0.5 rounded font-bold">{t.mastery.logisticRegression}</span>
                        <h4 className="text-xs font-semibold text-[#e3e3de] mt-1.5">{t.review.lrQuiz}</h4>
                      </div>
                      <button
                        onClick={() => handleStartQuiz("logistic-regression", "逻辑回归与 Sigmoid")}
                        className="px-3 py-1.5 bg-[#b8f600]/80 hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors cursor-pointer shrink-0"
                      >
                        {t.review.startQuiz}
                      </button>
                    </div>
                    <div className="bg-[#222222] border border-white/5 rounded p-4 flex items-center justify-between group hover:border-[#b8f600]/25 transition-colors">
                      <div>
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded font-bold">{t.mastery.gradientDescent}</span>
                        <h4 className="text-xs font-semibold text-[#e3e3de] mt-1.5">{t.review.gdQuiz}</h4>
                      </div>
                      <button
                        onClick={() => handleStartQuiz("gradient-descent", "梯度下降优化器")}
                        className="px-3 py-1.5 bg-[#b8f600]/80 hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors cursor-pointer shrink-0"
                      >
                        {t.review.startQuiz}
                      </button>
                    </div>
                    <div className="bg-[#222222] border border-white/5 rounded p-4 flex items-center justify-between group hover:border-[#b8f600]/25 transition-colors">
                      <div>
                        <span className="text-[10px] font-mono text-rose-400 bg-rose-400/10 px-2.5 py-0.5 rounded font-bold">{t.mastery.regularization}</span>
                        <h4 className="text-xs font-semibold text-[#e3e3de] mt-1.5">{t.review.regQuiz}</h4>
                      </div>
                      <button
                        onClick={() => handleStartQuiz("regularization", "正则化防过拟合")}
                        className="px-3 py-1.5 bg-[#b8f600]/80 hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors cursor-pointer shrink-0"
                      >
                        {t.review.startQuiz}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SETTINGS */}
          {activeTab === "settings" && (
            <SettingsPage 
              modelConfig={modelConfig}
              onModelConfigChange={setModelConfig}
              theme={theme}
              onThemeChange={setTheme}
              reminderEnabled={reminderEnabled}
              onReminderEnabledChange={(v) => { setReminderEnabled(v); localStorage.setItem("quickly_reminder_enabled", String(v)); }}
              reminderTime={reminderTime}
              onReminderTimeChange={(v) => { setReminderTime(v); localStorage.setItem("quickly_reminder_time", v); saveSetting("reminderTime", v); }}
              soundEnabled={soundEnabled}
              onSoundEnabledChange={(v) => { setSoundEnabled(v); localStorage.setItem("quickly_sound_enabled", String(v)); saveSetting("soundEnabled", v); }}
              autoSaveNotes={autoSaveNotes}
              onAutoSaveNotesChange={(v) => { setAutoSaveNotes(v); localStorage.setItem("quickly_auto_save", String(v)); saveSetting("autoSaveNotes", v); }}
              dailyGoal={dailyGoal}
              onDailyGoalChange={(v) => { setDailyGoal(v); localStorage.setItem("quickly_daily_goal", String(v)); saveSetting("dailyGoal", v); }}
              weeklyGoal={weeklyGoal}
              onWeeklyGoalChange={(v) => { setWeeklyGoal(v); localStorage.setItem("quickly_weekly_goal", String(v)); saveSetting("weeklyGoal", v); }}
            />
          )}

        </main>
      </div>

      {/* 3. RIGHT UTILITIES PANEL */}
      <RightPanel 
        reviewHistory={reviewHistory}
        reviewedTopics={reviewedTopics}
        overallAccuracy={overallAccuracy}
        latestNote={latestNote}
        onOpenNotes={() => setActiveTab("notes")}
        nextSuggestion={nextSuggestion}
        onStartQuiz={handleStartQuiz}
        onSelectTopic={handleSelectRightTopic}
      />

      {/* 4. ACTIVE QUIZ MODAL PORTAL */}
      <AnimatePresence>
        {activeQuiz && (
          <ActiveQuiz
            topicId={activeQuiz.topicId}
            topicName={activeQuiz.topicName}
            modelConfig={modelConfig}
            noteContent={activeQuiz.noteContent}
            onClose={() => setActiveQuiz(null)}
            onComplete={handleQuizComplete}
          />
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <ToastContainer toasts={activeToasts} onDismiss={dismissToast} />

    </div>
  );
}
