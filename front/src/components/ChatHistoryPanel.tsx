import React, { useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  MessageSquare,
} from "lucide-react";
import type { ConversationSummary } from "../types";
import { useI18n } from "../i18n";

interface ChatHistoryPanelProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
}

export default function ChatHistoryPanel({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: ChatHistoryPanelProps) {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter((conversation) => (
        conversation.title.toLowerCase().includes(normalizedQuery) ||
        conversation.topicTags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      ))
    : conversations;

  return (
    <aside
      className="w-72 border-l border-[#434933]/30 bg-[#1a1c19] flex flex-col sticky top-0 h-screen shrink-0 select-none z-40"
      id="chat-history-panel"
    >
      <div className="p-4 border-b border-[#434933]/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xs font-bold text-[#e3e3de] truncate">{t.history.title}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                if (searchOpen) setSearchQuery("");
                setSearchOpen(prev => !prev);
              }}
              title={t.history.search}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
                searchOpen
                  ? "text-[#b8f600] bg-[#2A2A2A]"
                  : "text-[#c3caac] hover:text-[#b8f600] hover:bg-[#2A2A2A]"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onNewConversation}
              title={t.history.newChat}
              className="w-7 h-7 flex items-center justify-center rounded text-[#c3caac] hover:text-[#b8f600] hover:bg-[#2A2A2A] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t.history.searchPlaceholder}
              className="w-full bg-[#121411] border border-white/10 rounded pl-8 pr-2 py-1.5 text-[10px] text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] transition-colors"
              autoFocus
            />
          </div>
        )}

        <span className="text-[9px] text-white/30 font-mono block mt-1">
          {normalizedQuery
            ? `${filteredConversations.length}/${conversations.length}`
            : conversations.length} {t.history.conversationsUnit}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-modern">
        {conversations.length === 0 ? (
          <div className="py-14 text-center">
            <MessageSquare className="w-8 h-8 text-white/10 mx-auto mb-2" />
            <p className="text-[11px] text-white/40">{t.history.empty}</p>
            <p className="text-[9px] text-white/20 mt-1 px-4 leading-relaxed">{t.history.emptyDesc}</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="py-14 text-center">
            <Search className="w-8 h-8 text-white/10 mx-auto mb-2" />
            <p className="text-[11px] text-white/40">{t.history.noResults}</p>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <div
                key={conversation.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectConversation(conversation.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectConversation(conversation.id);
                  }
                }}
                className={`group relative border-l-2 px-3 py-2.5 cursor-pointer transition-colors ${
                  isActive
                    ? "bg-[#b8f600]/5 border-l-[var(--accent)]"
                    : "border-l-transparent hover:bg-[#222222]"
                }`}
              >
                <p className={`text-[11px] font-bold truncate pr-4 ${
                  isActive ? "text-[#b8f600]" : "text-[#e3e3de]"
                }`}>
                  {conversation.title || t.history.untitled}
                </p>
                <div className="flex items-center justify-end mt-1">
                  <span className="text-[9px] font-mono text-white/25">
                    {t.history.messagesCount.replace("{count}", String(conversation.messageCount))}
                  </span>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteConversation(conversation.id);
                  }}
                  title={t.history.delete}
                  className="absolute right-2 bottom-2 p-1 rounded text-white/20 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-400/10 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                {isActive && (
                  <span className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-[#b8f600]" />
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-[#434933]/30">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          {t.history.newChat}
        </button>
      </div>
    </aside>
  );
}
