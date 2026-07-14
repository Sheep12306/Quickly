import React from "react";
import {
  GraduationCap,
  FileText,
  Sparkles,
  Route,
  RotateCcw,
  Settings,
  Play,
  Pause,
} from "lucide-react";
import { useI18n } from "../i18n";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  minutesLearned: number;
  dailyGoal?: number;
  isTimerRunning: boolean;
  onToggleTimer: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  minutesLearned,
  dailyGoal,
  isTimerRunning,
  onToggleTimer,
}: SidebarProps) {
  const { t } = useI18n();

  const tabs = [
    { id: "study", label: t.sidebar.study, icon: GraduationCap },
    { id: "notes", label: t.sidebar.notes, icon: FileText },
    { id: "mastery", label: t.sidebar.mastery, icon: Sparkles },
    { id: "path", label: t.sidebar.path, icon: Route },
    { id: "review", label: t.sidebar.review, icon: RotateCcw },
    { id: "settings", label: t.sidebar.settings, icon: Settings },
  ];

  return (
    <nav className="w-56 bg-[#121411] border-r border-[#434933]/45 flex flex-col justify-between p-5 h-screen sticky top-0 shrink-0 select-none z-50" id="quickly-sidebar">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-2 mb-10 h-10 select-none" id="quickly-brand-sec">
          <svg className="w-6 h-6 text-[#b8f600]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10" />
            <path d="M6 10h10" />
            <path d="M11 14h5" />
            <path d="m15 18 3 3 5-5" />
          </svg>
          <span className="font-bold text-lg tracking-tight text-[#e3e3de] font-mono">
            Quickly
          </span>
        </div>

        {/* Tab Links */}
        <nav className="space-y-2.5" id="quickly-nav-links">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`sidebar-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-4 px-4 py-2.5 rounded text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer active:scale-95 ${
                  isActive
                    ? "text-[#b8f600] border-r-2 border-[#b8f600] bg-[#292a27]"
                    : "text-[#c3caac] hover:text-[#e3e3de] hover:bg-[#1a1c19]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-300 ${
                    isActive ? "text-[#b8f600]" : "text-[#c3caac]"
                  }`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Profiler Bottom Section */}
      <div className="pt-4 border-t border-[#434933]/30 space-y-3" id="quickly-user-profile-sec">
        {/* User row with timer button */}
        <div className="flex items-center gap-2">
          {/* Default avatar — no login, always "momo" */}
          <div className="w-8 h-8 rounded-full border border-[#434933]/40 bg-[#292a27] flex items-center justify-center shrink-0" title="momo">
            <span className="text-xs font-bold text-[#b8f600] font-mono">m</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold text-[#e3e3de] block truncate">momo</span>
            <span className="text-[10px] text-[#c3caac] block truncate mt-0.5">
              {minutesLearned}/{dailyGoal || 60}{t.sidebar.minutes}
            </span>
          </div>

          {/* Timer toggle button */}
          <button
            onClick={onToggleTimer}
            title={isTimerRunning ? "暂停计时" : "开始计时"}
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
              isTimerRunning
                ? "bg-[#b8f600]/15 text-[#b8f600] border border-[#b8f600]/30 animate-pulse"
                : "bg-[#1a1c19] text-[#c3caac] border border-white/10 hover:border-[#b8f600]/30 hover:text-[#b8f600]"
            }`}
          >
            {isTimerRunning ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
