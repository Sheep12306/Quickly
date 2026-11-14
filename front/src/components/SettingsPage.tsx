import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Target, 
  Bell, 
  Globe, 
  Palette, 
  RefreshCcw,
  ChevronRight,
  Check,
  Moon,
  Sun,
  Bot,
  Key,
  Link,
  Cpu,
  Wifi,
  WifiOff,
  Database,
  ExternalLink
} from "lucide-react";
import { AIModelConfig, AI_MODEL_PRESETS, IMAConfig, IMAKnowledgeBase, DEFAULT_IMA_CONFIG } from "../types";
import { useI18n } from "../i18n";

interface SettingsPageProps {
  modelConfig?: AIModelConfig;
  onModelConfigChange?: (config: AIModelConfig) => void;
  imaConfig?: IMAConfig;
  onImaConfigChange?: (config: IMAConfig) => void;
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
  imaConfig, onImaConfigChange,
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
  const [aiConfig, setAiConfig] = useState<AIModelConfig>(() => modelConfig || AI_MODEL_PRESETS[0]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);

  useEffect(() => {
    if (modelConfig) setAiConfig(modelConfig);
  }, [modelConfig]);

  // IMA configuration state
  const ima = imaConfig || DEFAULT_IMA_CONFIG;
  const [imaTesting, setImaTesting] = useState(false);
  const [imaTestResult, setImaTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [imaKnowledgeBases, setImaKnowledgeBases] = useState<IMAKnowledgeBase[]>([]);

  const updateAiConfig = <K extends keyof AIModelConfig>(key: K, value: AIModelConfig[K]) => {
    setAiConfig(prev => {
      const next = { ...prev, [key]: value, isConnected: false };
      onModelConfigChange?.(next);
      return next;
    });
    setTestResult(null);
  };

  const selectPreset = (preset: AIModelConfig) => {
    const newConfig = { ...preset, apiKey: aiConfig.provider === preset.provider ? aiConfig.apiKey : "", isConnected: false };
    setAiConfig(newConfig);
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

  const updateImaField = <K extends keyof IMAConfig>(key: K, value: IMAConfig[K]) => {
    const next = { ...ima, [key]: value };
    if (key === "clientId" || key === "apiKey" || key === "mcpUrl" || key === "provider") {
      next.isConnected = false;
    }
    onImaConfigChange?.(next);
    if (key === "clientId" || key === "apiKey") {
      setImaTestResult(null);
    }
  };

  const handleImaKbChange = (id: string) => {
    const kb = imaKnowledgeBases.find(item => item.id === id);
    onImaConfigChange?.({
      ...ima,
      knowledgeBaseId: id,
      knowledgeBaseName: kb?.name || "",
    });
  };

  const handleTestIma = async () => {
    if ((ima.provider || "ima") !== "ima") {
      setImaTestResult({ success: false, message: t.settings.kbNotionHint });
      return;
    }
    if (!ima.clientId.trim() || !ima.apiKey.trim()) {
      setImaTestResult({ success: false, message: t.settings.imaNeedCreds });
      return;
    }

    setImaTesting(true);
    setImaTestResult(null);

    try {
      const response = await fetch("/api/ima/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: ima.clientId.trim(), apiKey: ima.apiKey.trim() }),
      });
      const data = await response.json().catch(() => ({}));

      if (data.success) {
        const list: IMAKnowledgeBase[] = Array.isArray(data.knowledgeBases) ? data.knowledgeBases : [];
        setImaKnowledgeBases(list);
        const selected = list.find(kb => kb.id === ima.knowledgeBaseId) || (!ima.knowledgeBaseId ? list[0] : undefined);
        onImaConfigChange?.({
          ...ima,
          enabled: true,
          isConnected: true,
          knowledgeBaseId: selected?.id ?? ima.knowledgeBaseId,
          knowledgeBaseName: selected?.name ?? ima.knowledgeBaseName,
        });
        setImaTestResult({
          success: true,
          message: t.settings.imaTestSuccess.replace("{count}", String(list.length)),
        });
      } else {
        onImaConfigChange?.({ ...ima, isConnected: false });
        setImaTestResult({ success: false, message: data.error || t.settings.imaTestFailed });
      }
    } catch {
      onImaConfigChange?.({ ...ima, isConnected: false });
      setImaTestResult({
        success: false,
        message: locale === "en-US" ? "Network error: cannot reach the local server" : "网络错误，无法连接到本地服务",
      });
    } finally {
      setImaTesting(false);
    }
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
  const currentImaKb: IMAKnowledgeBase | null = ima.knowledgeBaseId
    ? { id: ima.knowledgeBaseId, name: ima.knowledgeBaseName || ima.knowledgeBaseId }
    : null;
  const imaKbOptions: IMAKnowledgeBase[] = imaKnowledgeBases.length > 0
    ? (currentImaKb && !imaKnowledgeBases.some(kb => kb.id === currentImaKb.id)
        ? [...imaKnowledgeBases, currentImaKb]
        : imaKnowledgeBases)
    : currentImaKb
      ? [currentImaKb]
      : [];
  const [showCustomDaily, setShowCustomDaily] = useState(false);
  const [customDailyValue, setCustomDailyValue] = useState("");
  const [showCustomWeekly, setShowCustomWeekly] = useState(false);
  const [customWeeklyValue, setCustomWeeklyValue] = useState("");

  return (
    <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto" id="settings-dashboard-pane">
      <div className="w-full max-w-5xl space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-[#e3e3de]">{t.settings.title}</h2>
          <p className="text-xs text-[#c3caac]/70 mt-1">
            {t.settings.subtitle}
          </p>
        </div>

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
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(e) => updateAiConfig("apiKey", e.target.value)}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={aiConfig.provider === "gemini" ? `Gemini ${t.settings.apiKey}` : t.settings.apiKey}
                  className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600] transition-colors font-mono"
                />
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
              <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
                {t.settings.modelNameHint}
              </p>
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

        {/* Section 6: IMA Knowledge Base */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-[#222222] border border-white/5 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-400/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-[#e3e3de]">{t.settings.imaTitle}</h3>
              <p className="text-[10px] text-white/40">{t.settings.imaDesc}</p>
            </div>
            {(ima.provider || "ima") === "ima" && (
              <a
                href="https://ima.qq.com/agent-interface"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[10px] font-mono text-[#b8f600] hover:text-[#d4ff66] transition-colors"
              >
                {t.settings.imaGetKey}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="space-y-5">
            {/* Provider */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                {t.settings.kbProvider}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "ima" as const, label: t.settings.kbProviderIma },
                  { id: "notion" as const, label: t.settings.kbProviderNotion },
                  { id: "custom" as const, label: t.settings.kbProviderCustom },
                ].map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => updateImaField("provider", provider.id)}
                    className={`px-3 py-2 rounded border text-[10px] font-bold transition-colors ${
                      (ima.provider || "ima") === provider.id
                        ? "bg-[#b8f600]/10 border-[#b8f600]/30 text-[#b8f600]"
                        : "bg-[#1a1c19] border-white/5 text-[#c3caac] hover:border-white/15"
                    }`}
                  >
                    {provider.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
                {ima.provider === "ima" ? t.settings.kbProviderHint : t.settings.kbNotionHint}
              </p>
            </div>

            {/* Enable IMA */}
            <div className="flex items-center justify-between p-3 bg-[#1a1c19] rounded-lg">
              <div>
                <span className="text-xs font-medium text-[#e3e3de]">{t.settings.imaEnabled}</span>
                <p className="text-[10px] text-white/40 mt-0.5">{t.settings.imaEnabledDesc}</p>
              </div>
              <button
                onClick={() => updateImaField("enabled", !ima.enabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  ima.enabled ? "bg-[#b8f600]" : "bg-[#3a3a3a]"
                }`}
              >
                <motion.div
                  animate={{ x: ima.enabled ? 22 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow"
                />
              </button>
            </div>

            {/* MCP service URL */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                <span className="flex items-center gap-1.5"><Link className="w-3 h-3" /> {t.settings.imaMcpUrl}</span>
              </label>
              <input
                type="url"
                value={ima.mcpUrl}
                onChange={(e) => updateImaField("mcpUrl", e.target.value)}
                placeholder="https://your-ima-mcp-server/mcp"
                className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600] transition-colors font-mono"
              />
              <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">{t.settings.imaMcpHint}</p>
            </div>

            {/* Client ID */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                <span className="flex items-center gap-1.5"><Key className="w-3 h-3" /> {t.settings.imaClientId}</span>
              </label>
              <input
                type="text"
                value={ima.clientId}
                onChange={(e) => updateImaField("clientId", e.target.value)}
                placeholder="IMA Client ID"
                autoComplete="off"
                className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600] transition-colors font-mono"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                <span className="flex items-center gap-1.5"><Key className="w-3 h-3" /> {t.settings.imaApiKey}</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={ima.apiKey}
                  onChange={(e) => updateImaField("apiKey", e.target.value)}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                  placeholder="IMA API Key"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600] transition-colors font-mono"
                />
              </div>
            </div>

            {/* Default knowledge base */}
            <div>
              <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                <span className="flex items-center gap-1.5"><Database className="w-3 h-3" /> {t.settings.imaKnowledgeBase}</span>
              </label>
              <select
                value={ima.knowledgeBaseId}
                onChange={(e) => handleImaKbChange(e.target.value)}
                disabled={imaKbOptions.length === 0}
                className="w-full bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600] transition-colors disabled:text-white/30"
              >
                <option value="">{t.settings.imaKbNone}</option>
                {imaKbOptions.map((kb) => (
                  <option key={kb.id} value={kb.id}>
                    {kb.name}{kb.contentCount ? ` (${kb.contentCount})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Connection test */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleTestIma}
                disabled={imaTesting || (ima.provider || "ima") !== "ima" || !ima.clientId.trim() || !ima.apiKey.trim()}
                className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-all ${
                  imaTesting
                    ? "bg-[#1a1c19] text-white/40 cursor-not-allowed"
                    : !ima.clientId.trim() || !ima.apiKey.trim()
                    ? "bg-[#1a1c19] text-white/20 cursor-not-allowed"
                    : ima.isConnected
                    ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                    : "bg-[#1a1c19] border border-white/10 text-[#c3caac] hover:border-[#b8f600]/30 hover:text-[#b8f600]"
                }`}
              >
                {imaTesting ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
                  />
                ) : ima.isConnected ? (
                  <Wifi className="w-3.5 h-3.5" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5" />
                )}
                <span>{imaTesting ? t.settings.imaTesting : ima.isConnected ? t.settings.imaConnected : t.settings.imaTest}</span>
              </button>
              {imaTestResult && (
                <span className={`text-[10px] font-mono ${imaTestResult.success ? "text-[#b8f600]" : "text-rose-400"}`}>
                  {imaTestResult.message}
                </span>
              )}
            </div>

            <p className="text-[10px] text-white/30 leading-relaxed">{t.settings.imaPrivacy}</p>
          </div>
        </motion.section>

        {/* Section 7: Advanced Settings */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
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