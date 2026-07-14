import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Target, 
  Bell, 
  Globe, 
  Palette, 
  Save, 
  RefreshCcw,
  ChevronRight,
  Check,
  Moon,
  Sun,
  Bot,
  Key,
  Link,
  Cpu,
  Eye,
  EyeOff,
  Wifi,
  WifiOff
} from "lucide-react";
import { AIModelConfig, AI_MODEL_PRESETS } from "../types";
import { useI18n } from "../i18n";

interface SettingsPageProps {
  modelConfig?: AIModelConfig;
  onModelConfigChange?: (config: AIModelConfig) => void;
  theme?: string;
  onThemeChange?: (theme: string) => void;
  reminderEnabled?: boolean;
  onReminderEnabledChange?: (enabled: boolean) => void;
  reminderTime?: string;
  onReminderTimeChange?: (time: string) => void;
  soundEnabled?: boolean;
  onSoundEnabledChange?: (enabled: boolean) => void;
  autoSaveNotes?: boolean;
  onAutoSaveNotesChange?: (enabled: boolean) => void;
  dailyGoal?: number;
  onDailyGoalChange?: (goal: number) => void;
  weeklyGoal?: number;
  onWeeklyGoalChange?: (goal: number) => void;
  onClose?: () => void;
}

export default function SettingsPage({ 
  modelConfig, onModelConfigChange,
  theme, onThemeChange,
  reminderEnabled, onReminderEnabledChange,
  reminderTime, onReminderTimeChange,
  soundEnabled, onSoundEnabledChange,
  autoSaveNotes, onAutoSaveNotesChange,
  dailyGoal, onDailyGoalChange,
  weeklyGoal, onWeeklyGoalChange,
  onClose 
}: SettingsPageProps) {
  const { t, setLocale, locale } = useI18n();
  const [settings, setSettings] = useState({
    dailyGoal: dailyGoal || 30,
    weeklyGoal: weeklyGoal || 14,
    reminderTime: reminderTime || "09:00",
    language: locale,
    theme: theme || "dark",
    autoSaveNotes: autoSaveNotes !== undefined ? autoSaveNotes : true,
    soundEnabled: soundEnabled !== undefined ? soundEnabled : true,
    emailNotifications: true,
    weeklyReport: true
  });

  // AI Model configuration state
  const [aiConfig, setAiConfig] = useState<AIModelConfig>(() => {
    const saved = localStorage.getItem("quickly_ai_config");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return modelConfig || AI_MODEL_PRESETS[0];
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateAiConfig = <K extends keyof AIModelConfig>(key: K, value: AIModelConfig[K]) => {
    setAiConfig(prev => {
      const next = { ...prev, [key]: value, isConnected: false };
      localStorage.setItem("quickly_ai_config", JSON.stringify(next));
      onModelConfigChange?.(next);
      return next;
    });
    setTestResult(null);
  };

  const selectPreset = (preset: AIModelConfig) => {
    const newConfig = { ...preset, apiKey: aiConfig.provider === preset.provider ? aiConfig.apiKey : "", isConnected: false };
    setAiConfig(newConfig);
    localStorage.setItem("quickly_ai_config", JSON.stringify(newConfig));
    onModelConfigChange?.(newConfig);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!aiConfig.apiKey) {
      setTestResult({ success: false, message: locale === "en-US" ? "Please enter API Key first" : "请先填写 API Key" });
      return;
    }
    if (aiConfig.provider !== "gemini" && !aiConfig.apiBase) {
      setTestResult({ success: false, message: locale === "en-US" ? "Please enter API URL first" : "请先填写 API 地址" });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiConfig),
      });
      const data = await response.json();
      if (data.success) {
        const updated = { ...aiConfig, isConnected: true };
        setAiConfig(updated);
        localStorage.setItem("quickly_ai_config", JSON.stringify(updated));
        onModelConfigChange?.(updated);
        setTestResult({ success: true, message: `连接成功！模型: ${data.model || aiConfig.model}` });
      } else {
        setTestResult({ success: false, message: data.error || "连接失败，请检查配置" });
      }
    } catch (err) {
      setTestResult({ success: false, message: "网络错误，无法连接到服务器" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    // Sync to parent callbacks
    if (key === "theme") onThemeChange?.(value as string);
    if (key === "reminderTime") onReminderTimeChange?.(value as string);
    if (key === "autoSaveNotes") onAutoSaveNotesChange?.(value as boolean);
    if (key === "soundEnabled") onSoundEnabledChange?.(value as boolean);
    if (key === "dailyGoal") onDailyGoalChange?.(value as number);
    if (key === "weeklyGoal") onWeeklyGoalChange?.(value as number);
    if (key === "language") setLocale(value as "zh-CN" | "en-US");
  };

  const languages = [
    { value: "zh-CN", label: t.settings.zhCN },
    { value: "en-US", label: t.settings.enUS },
  ];

  const dailyGoals = [15, 30, 45, 60, 90, 120];
  const weeklyGoals = [7, 14, 21, 30];
  const [showCustomDaily, setShowCustomDaily] = useState(false);
  const [customDailyValue, setCustomDailyValue] = useState("");
  const [showCustomWeekly, setShowCustomWeekly] = useState(false);
  const [customWeeklyValue, setCustomWeeklyValue] = useState("");

  return (
    <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto" id="settings-dashboard-pane">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#e3e3de]">{t.settings.title}</h2>
            <p className="text-xs text-[#c3caac]/70 mt-1">
              {t.settings.subtitle}
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-all ${
              saved 
                ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                : isSaving
                ? "bg-[#222222] text-white/40 cursor-not-allowed"
                : "bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] active:scale-[0.98]"
            }`}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                <span>{t.settings.saved}</span>
              </>
            ) : isSaving ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                />
                <span>{t.settings.saving}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{t.settings.save}</span>
              </>
            )}
          </button>
        </div>

        {/* Section 1: Learning Goals */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#222222] border border-white/5 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#b8f600]/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-[#b8f600]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.learningGoals}</h3>
              <p className="text-[10px] text-white/40">{t.settings.learningGoalsDesc}</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Daily Goal */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                {t.settings.dailyDuration}
              </label>
              <div className="grid grid-cols-7 gap-2">
                {dailyGoals.map((goal) => (
                  <button
                    key={goal}
                    onClick={() => { updateSetting("dailyGoal", goal); setShowCustomDaily(false); }}
                    className={`py-2 rounded text-xs font-mono font-medium transition-all ${
                      settings.dailyGoal === goal && !showCustomDaily
                        ? "bg-[#b8f600] text-[#141f00]"
                        : "bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A]"
                    }`}
                  >
                    {goal}{t.settings.minutes}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustomDaily(!showCustomDaily)}
                  className={`py-2 rounded text-xs font-mono font-medium transition-all ${
                    showCustomDaily
                      ? "bg-[#b8f600] text-[#141f00]"
                      : "bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A]"
                  }`}
                >
                  {t.settings.customDuration}
                </button>
              </div>
              {showCustomDaily && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={customDailyValue}
                    onChange={(e) => setCustomDailyValue(e.target.value)}
                    placeholder="30"
                    className="w-20 bg-[#1a1c19] border border-white/10 rounded px-3 py-1.5 text-xs text-[#e3e3de] font-mono focus:outline-none focus:border-[#b8f600]"
                  />
                  <span className="text-[10px] text-white/40">{t.settings.minutes}</span>
                  <button
                    onClick={() => {
                      const val = parseInt(customDailyValue);
                      if (val > 0) { updateSetting("dailyGoal", val); setShowCustomDaily(false); }
                    }}
                    className="px-3 py-1.5 bg-[#b8f600] text-[#111111] rounded text-[10px] font-bold hover:bg-[#a6d600] transition-colors"
                  >
                    ✓
                  </button>
                </div>
              )}
            </div>

            {/* Weekly Goal */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                {t.settings.weeklyDuration}
              </label>
              <div className="grid grid-cols-5 gap-2">
                {weeklyGoals.map((goal) => (
                  <button
                    key={goal}
                    onClick={() => { updateSetting("weeklyGoal", goal); setShowCustomWeekly(false); }}
                    className={`py-2 rounded text-xs font-mono font-medium transition-all ${
                      settings.weeklyGoal === goal && !showCustomWeekly
                        ? "bg-[#b8f600] text-[#141f00]"
                        : "bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A]"
                    }`}
                  >
                    {goal}{t.settings.hours}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustomWeekly(!showCustomWeekly)}
                  className={`py-2 rounded text-xs font-mono font-medium transition-all ${
                    showCustomWeekly
                      ? "bg-[#b8f600] text-[#141f00]"
                      : "bg-[#1a1c19] text-[#c3caac] hover:bg-[#2A2A2A]"
                  }`}
                >
                  {t.settings.customDuration}
                </button>
              </div>
              {showCustomWeekly && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={customWeeklyValue}
                    onChange={(e) => setCustomWeeklyValue(e.target.value)}
                    placeholder="20"
                    className="w-20 bg-[#1a1c19] border border-white/10 rounded px-3 py-1.5 text-xs text-[#e3e3de] font-mono focus:outline-none focus:border-[#b8f600]"
                  />
                  <span className="text-[10px] text-white/40">{t.settings.hours}</span>
                  <button
                    onClick={() => {
                      const val = parseInt(customWeeklyValue);
                      if (val > 0) { updateSetting("weeklyGoal", val); setShowCustomWeekly(false); }
                    }}
                    className="px-3 py-1.5 bg-[#b8f600] text-[#111111] rounded text-[10px] font-bold hover:bg-[#a6d600] transition-colors"
                  >
                    ✓
                  </button>
                </div>
              )}
            </div>

            {/* Weekly Progress */}
            <div className="flex items-center justify-between p-3 bg-[#1a1c19] rounded-lg">
              <div>
                <span className="text-xs text-[#c3caac]">{t.settings.weeklyProgress}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl font-bold text-[#e3e3de] font-mono">{Math.round((20 / (settings.weeklyGoal || 14)) * 100)}%</span>
                  <span className="text-[10px] text-white/40">20{t.settings.hours} / {settings.weeklyGoal || 14}{t.settings.hours}</span>
                </div>
              </div>
              <div className="w-32 h-1.5 bg-[#111111] rounded-full overflow-hidden">
                <div className="h-full bg-[#b8f600]" style={{ width: `${Math.min(100, Math.round((20 / (settings.weeklyGoal || 14)) * 100))}%` }} />
              </div>
            </div>
          </div>
        </motion.section>

        {/* Section 2: Reminder Settings */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#222222] border border-white/5 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-amber-400/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.reminders}</h3>
              <p className="text-[10px] text-white/40">{t.settings.remindersDesc}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                {t.settings.reminderTime}
              </label>
              <input
                type="time"
                value={settings.reminderTime}
                onChange={(e) => updateSetting("reminderTime", e.target.value)}
                className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600] transition-colors"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#1a1c19] rounded-lg">
                <div>
                  <span className="text-xs font-medium text-[#e3e3de]">{t.settings.emailNotifications}</span>
                  <p className="text-[10px] text-white/40 mt-0.5">{t.settings.emailNotifDesc}</p>
                </div>
                <button
                  onClick={() => updateSetting("emailNotifications", !settings.emailNotifications)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.emailNotifications ? "bg-[#b8f600]" : "bg-[#3a3a3a]"
                  }`}
                >
                  <motion.div
                    animate={{ x: settings.emailNotifications ? 22 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow"
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#1a1c19] rounded-lg">
                <div>
                  <span className="text-xs font-medium text-[#e3e3de]">{t.settings.weeklyReport}</span>
                  <p className="text-[10px] text-white/40 mt-0.5">{t.settings.weeklyReportDesc}</p>
                </div>
                <button
                  onClick={() => updateSetting("weeklyReport", !settings.weeklyReport)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    settings.weeklyReport ? "bg-[#b8f600]" : "bg-[#3a3a3a]"
                  }`}
                >
                  <motion.div
                    animate={{ x: settings.weeklyReport ? 22 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow"
                  />
                </button>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Section 3: Language & Region */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#222222] border border-white/5 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-blue-400/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.language}</h3>
              <p className="text-[10px] text-white/40">{t.settings.languageDesc}</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
              {t.settings.interfaceLang}
            </label>
            <div className="space-y-2">
              {languages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => updateSetting("language", lang.value)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                    settings.language === lang.value
                      ? "bg-[#b8f600]/10 border border-[#b8f600]/30"
                      : "bg-[#1a1c19] border border-transparent hover:border-white/10"
                  }`}
                >
                  <span className="text-xs text-[#e3e3de]">{lang.label}</span>
                  {settings.language === lang.value && (
                    <Check className="w-4 h-4 text-[#b8f600]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Section 4: Appearance */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#222222] border border-white/5 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-purple-400/10 flex items-center justify-center">
              <Palette className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.appearance}</h3>
              <p className="text-[10px] text-white/40">{t.settings.appearanceDesc}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateSetting("theme", "dark")}
              className={`p-4 rounded-lg border transition-all ${
                settings.theme === "dark"
                  ? "bg-[#b8f600]/10 border-[#b8f600]/30"
                  : "bg-[#1a1c19] border-white/5 hover:border-white/10"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Moon className={`w-5 h-5 ${settings.theme === "dark" ? "text-[#b8f600]" : "text-white/40"}`} />
                <span className="text-xs font-medium text-[#e3e3de]">{t.settings.darkMode}</span>
              </div>
              <div className="w-full h-8 bg-[#1a1c19] rounded border border-white/10" />
            </button>

            <button
              onClick={() => updateSetting("theme", "light")}
              className={`p-4 rounded-lg border transition-all ${
                settings.theme === "light"
                  ? "bg-[#b8f600]/10 border-[#b8f600]/30"
                  : "bg-[#1a1c19] border-white/5 hover:border-white/10"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Sun className={`w-5 h-5 ${settings.theme === "light" ? "text-[#b8f600]" : "text-white/40"}`} />
                <span className="text-xs font-medium text-[#e3e3de]">{t.settings.lightMode}</span>
              </div>
              <div className="w-full h-8 bg-[#f5f5f5] rounded border border-white/10" />
            </button>
          </div>
        </motion.section>

        {/* Section 5: AI Model Configuration */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-[#222222] border border-white/5 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-cyan-400/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.aiModel}</h3>
              <p className="text-[10px] text-white/40">{t.settings.aiModelDesc}</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Preset Model Selection */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                {t.settings.selectModel}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {AI_MODEL_PRESETS.map((preset) => (
                  <button
                    key={preset.provider}
                    onClick={() => selectPreset(preset)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      aiConfig.provider === preset.provider
                        ? "bg-[#b8f600]/10 border-[#b8f600]/30"
                        : "bg-[#1a1c19] border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Cpu className={`w-3.5 h-3.5 ${aiConfig.provider === preset.provider ? "text-[#b8f600]" : "text-white/40"}`} />
                      <span className={`text-xs font-medium ${aiConfig.provider === preset.provider ? "text-[#b8f600]" : "text-[#e3e3de]"}`}>
                        {preset.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/30 font-mono block truncate">
                      {preset.model || t.settings.custom}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key Input */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                <span className="flex items-center gap-1.5"><Key className="w-3 h-3" /> {t.settings.apiKey}</span>
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={aiConfig.apiKey}
                  onChange={(e) => updateAiConfig("apiKey", e.target.value)}
                  placeholder={aiConfig.provider === "gemini" ? `Gemini ${t.settings.apiKey}` : t.settings.apiKey}
                  className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 pr-10 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600] transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* API Base URL (not for Gemini) */}
            {aiConfig.provider !== "gemini" && (
              <div>
                <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                  <span className="flex items-center gap-1.5"><Link className="w-3 h-3" /> {t.settings.apiBase}</span>
                </label>
                <input
                  type="text"
                  value={aiConfig.apiBase}
                  onChange={(e) => updateAiConfig("apiBase", e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600] transition-colors font-mono"
                />
              </div>
            )}

            {/* Model Name */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> {t.settings.modelName}</span>
              </label>
              <input
                type="text"
                value={aiConfig.model}
                onChange={(e) => updateAiConfig("model", e.target.value)}
                placeholder="model-name"
                className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600] transition-colors font-mono"
              />
              {aiConfig.provider !== "custom" && (
                <p className="text-[10px] text-white/30 mt-1.5 font-mono">
                  {t.settings.defaultLabel} {AI_MODEL_PRESETS.find(p => p.provider === aiConfig.provider)?.model || "-"}
                </p>
              )}
            </div>

            {/* Connection Test */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={isTesting || !aiConfig.apiKey}
                className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-all ${
                  isTesting
                    ? "bg-[#1a1c19] text-white/40 cursor-not-allowed"
                    : !aiConfig.apiKey
                    ? "bg-[#1a1c19] text-white/20 cursor-not-allowed"
                    : aiConfig.isConnected
                    ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                    : "bg-[#1a1c19] border border-white/10 text-[#c3caac] hover:border-[#b8f600]/30 hover:text-[#b8f600]"
                }`}
              >
                {isTesting ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                  />
                ) : aiConfig.isConnected ? (
                  <Wifi className="w-3.5 h-3.5" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5" />
                )}
                <span>{isTesting ? t.settings.testing : aiConfig.isConnected ? t.settings.connected : t.settings.testConnection}</span>
              </button>
              {testResult && (
                <span className={`text-[10px] font-mono ${testResult.success ? "text-[#b8f600]" : "text-rose-400"}`}>
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        </motion.section>

        {/* Section 6: Advanced Settings */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-[#222222] border border-white/5 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
              <RefreshCcw className="w-5 h-5 text-white/60" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.advanced}</h3>
              <p className="text-[10px] text-white/40">{t.settings.advancedDesc}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-[#1a1c19] rounded-lg">
              <div>
                <span className="text-xs font-medium text-[#e3e3de]">{t.settings.autoSaveNotes}</span>
                <p className="text-[10px] text-white/40 mt-0.5">{t.settings.autoSaveNotesDesc}</p>
              </div>
              <button
                onClick={() => updateSetting("autoSaveNotes", !settings.autoSaveNotes)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  settings.autoSaveNotes ? "bg-[#b8f600]" : "bg-[#3a3a3a]"
                }`}
              >
                <motion.div
                  animate={{ x: settings.autoSaveNotes ? 22 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow"
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#1a1c19] rounded-lg">
              <div>
                <span className="text-xs font-medium text-[#e3e3de]">{t.settings.soundFeedback}</span>
                <p className="text-[10px] text-white/40 mt-0.5">{t.settings.soundFeedbackDesc}</p>
              </div>
              <button
                onClick={() => updateSetting("soundEnabled", !settings.soundEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  settings.soundEnabled ? "bg-[#b8f600]" : "bg-[#3a3a3a]"
                }`}
              >
                <motion.div
                  animate={{ x: settings.soundEnabled ? 22 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow"
                />
              </button>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}