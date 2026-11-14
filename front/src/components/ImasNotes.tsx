import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Database,
  Search,
  RefreshCw,
  Plus,
  X,
  ChevronRight,
  FileText,
  Clock,
  Pencil,
  PlusCircle,
  AlertCircle,
  Upload,
  ExternalLink,
  Check,
  Settings,
  BookMarked,
  Bold,
  Italic,
  Underline,
  Highlighter,
  Scissors,
  Copy,
  ClipboardPaste,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { IMAConfig, IMAKnowledgeBase, NoteItem } from "../types";
import { useI18n } from "../i18n";
import MarkdownView from "./MarkdownView";

interface ImasNotesProps {
  imaConfig: IMAConfig;
  localNotes: NoteItem[];
  openNoteId?: string | null;
  onOpenNoteHandled?: () => void;
  onOpenSettings: () => void;
  onOpenLocal: () => void;
}

interface ImaNotebook {
  id: string;
  name: string;
  noteCount: number;
  folderType: number;
}

interface ImaNote {
  id: string;
  title: string;
  summary: string;
  folderId: string;
  folderName: string;
  createdAt: number;
  updatedAt: number;
  highlight: string;
}

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

export default function ImasNotes({
  imaConfig,
  localNotes,
  openNoteId,
  onOpenNoteHandled,
  onOpenSettings,
  onOpenLocal,
}: ImasNotesProps) {
  const { t, locale } = useI18n();
  const clientId = imaConfig.clientId.trim();
  const apiKey = imaConfig.apiKey.trim();
  const hasCredentials = Boolean(clientId && apiKey);
  const isEnabled = hasCredentials && imaConfig.enabled && (imaConfig.provider || "ima") === "ima";

  const [notebooks, setNotebooks] = useState<ImaNotebook[]>([]);
  const [notes, setNotes] = useState<ImaNote[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState("");
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<ImaNote[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedNote, setSelectedNote] = useState<ImaNote | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [appendOpen, setAppendOpen] = useState(false);
  const [appendContent, setAppendContent] = useState("");
  const [appending, setAppending] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [kbPickerOpen, setKbPickerOpen] = useState(false);
  const [kbOptions, setKbOptions] = useState<IMAKnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [addingToKb, setAddingToKb] = useState(false);
  const [kbResult, setKbResult] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createNotebookId, setCreateNotebookId] = useState("");
  const [creating, setCreating] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [selectedLocalIds, setSelectedLocalIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const createContentRef = useRef<HTMLTextAreaElement>(null);
  const appendContentRef = useRef<HTMLTextAreaElement>(null);
  const createPreviewRef = useRef<HTMLDivElement>(null);
  const appendPreviewRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: "create" | "append" } | null>(null);
  const [editPreviewOpen, setEditPreviewOpen] = useState(true);
  const [createPreviewOpen, setCreatePreviewOpen] = useState(true);
  const [readerFullscreen, setReaderFullscreen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const syncEditorScroll = (
    source: HTMLTextAreaElement | HTMLDivElement | null,
    target: HTMLTextAreaElement | HTMLDivElement | null,
  ) => {
    if (!source || !target || syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (sourceMax > 0 && targetMax > 0) {
      target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
    }
    window.requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  };

  const requestCloseReader = () => {
    if (appendOpen && appendContent.trim()) {
      setCloseConfirmOpen(true);
      return;
    }
    setSelectedNote(null);
    setAppendOpen(false);
    setAppendContent("");
    setReaderFullscreen(false);
    setCloseConfirmOpen(false);
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const applyMarkdownFormat = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    setter: (next: string) => void,
    before: string,
    after: string,
  ) => {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || (locale === "en-US" ? "text" : "文本");
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    setter(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const applyLinePrefix = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    setter: (next: string) => void,
    prefix: string,
    ordered = false,
  ) => {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextLineBreak = value.indexOf("\n", end);
    const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const block = value.slice(lineStart, blockEnd);
    const lines = block.split("\n");
    const isHeading = /^#{1,6} $/.test(prefix);

    const nextLines = lines.map((line, index) => {
      if (isHeading) {
        const stripped = line.replace(/^#{1,6}\s+/, "");
        return line.startsWith(prefix) ? stripped : prefix + stripped;
      }
      if (ordered) {
        const stripped = line.replace(/^\d+\.\s+/, "");
        return /^\d+\.\s+/.test(line) ? stripped : `${index + 1}. ${line}`;
      }
      return line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line;
    });

    const nextBlock = nextLines.join("\n");
    const next = value.slice(0, lineStart) + nextBlock + value.slice(blockEnd);
    setter(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
    });
  };

  const renderFormatToolbar = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    setter: (next: string) => void,
  ) => {
    const toolButton = (title: string, icon: React.ReactNode, onClick: () => void) => (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className="p-1.5 rounded text-white/45 hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
      >
        {icon}
      </button>
    );
    return (
      <div className="flex items-center gap-0.5 mb-1.5 flex-wrap">
        {toolButton(t.imaNotes.formatH1, <Heading1 className="w-3.5 h-3.5" />, () => applyLinePrefix(ref, value, setter, "# "))}
        {toolButton(t.imaNotes.formatH2, <Heading2 className="w-3.5 h-3.5" />, () => applyLinePrefix(ref, value, setter, "## "))}
        {toolButton(t.imaNotes.formatH3, <Heading3 className="w-3.5 h-3.5" />, () => applyLinePrefix(ref, value, setter, "### "))}
        <span className="w-px h-4 bg-white/10 mx-0.5" />
        {toolButton(t.imaNotes.formatBold, <Bold className="w-3.5 h-3.5" />, () => applyMarkdownFormat(ref, value, setter, "**", "**"))}
        {toolButton(t.imaNotes.formatItalic, <Italic className="w-3.5 h-3.5" />, () => applyMarkdownFormat(ref, value, setter, "*", "*"))}
        {toolButton(t.imaNotes.formatUnderline, <Underline className="w-3.5 h-3.5" />, () => applyMarkdownFormat(ref, value, setter, "~", "~"))}
        {toolButton(t.imaNotes.formatHighlight, <Highlighter className="w-3.5 h-3.5" />, () => applyMarkdownFormat(ref, value, setter, "==", "=="))}
        <span className="w-px h-4 bg-white/10 mx-0.5" />
        {toolButton(t.imaNotes.formatList, <List className="w-3.5 h-3.5" />, () => applyLinePrefix(ref, value, setter, "- "))}
        {toolButton(t.imaNotes.formatOrderedList, <ListOrdered className="w-3.5 h-3.5" />, () => applyLinePrefix(ref, value, setter, "1. ", true))}
        {toolButton(t.imaNotes.formatQuote, <Quote className="w-3.5 h-3.5" />, () => applyLinePrefix(ref, value, setter, "> "))}
        <span className="w-px h-4 bg-white/10 mx-0.5" />
        {toolButton(t.imaNotes.formatCode, <Code2 className="w-3.5 h-3.5" />, () => applyMarkdownFormat(ref, value, setter, "`", "`"))}
        {toolButton(t.imaNotes.formatCodeBlock, <Code2 className="w-3.5 h-3.5" />, () => applyMarkdownFormat(ref, value, setter, "\n```\n", "\n```\n"))}
        {toolButton(t.imaNotes.formatLink, <Link2 className="w-3.5 h-3.5" />, () => applyMarkdownFormat(ref, value, setter, "[", "](https://)"))}
        <span className="text-[9px] text-white/20 ml-auto hidden xl:inline">{t.imaNotes.formatHint}</span>
      </div>
    );
  };

  const applyContextFormat = (before: string, after: string) => {
    if (!contextMenu) return;
    if (contextMenu.target === "create") {
      applyMarkdownFormat(createContentRef, createContent, setCreateContent, before, after);
    } else {
      applyMarkdownFormat(appendContentRef, appendContent, setAppendContent, before, after);
    }
    setContextMenu(null);
  };

  const openEditorContextMenu = (event: React.MouseEvent<HTMLTextAreaElement>, target: "create" | "append") => {
    event.preventDefault();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 270),
      target,
    });
  };

  const runEditorCommand = (command: "cut" | "copy") => {
    if (!contextMenu) return;
    const ref = contextMenu.target === "create" ? createContentRef : appendContentRef;
    ref.current?.focus();
    document.execCommand(command);
    setContextMenu(null);
  };

  const pasteIntoEditor = async () => {
    if (!contextMenu) return;
    const ref = contextMenu.target === "create" ? createContentRef : appendContentRef;
    const textarea = ref.current;
    if (!textarea) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const value = contextMenu.target === "create" ? createContent : appendContent;
        const setter = contextMenu.target === "create" ? setCreateContent : setAppendContent;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        setter(value.slice(0, start) + text + value.slice(end));
        window.requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(start + text.length, start + text.length);
        });
      }
    } catch {
      // Clipboard permission is optional.
    }
    setContextMenu(null);
  };

  const imaPost = useCallback(async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, apiKey, ...body }),
    });
    const data = await response.json().catch(() => ({}));
    if (!data.success) throw new Error(data.error || "IMA request failed");
    return data;
  }, [clientId, apiKey]);

  const loadNotebooks = useCallback(async () => {
    if (!isEnabled) return;
    setLoadingNotebooks(true);
    try {
      const data = await imaPost("/api/ima/notebooks", { cursor: "0", limit: 20 });
      setNotebooks(Array.isArray(data.notebooks) ? data.notebooks : []);
    } catch (loadError: any) {
      setError(loadError?.message || t.imaNotes.loadFailed);
    } finally {
      setLoadingNotebooks(false);
    }
  }, [isEnabled, imaPost, t.imaNotes.loadFailed]);

  const loadNotes = useCallback(async (folderId: string) => {
    if (!isEnabled) return;
    setLoadingNotes(true);
    setError(null);
    try {
      const data = await imaPost("/api/ima/notes", {
        folderId: folderId || undefined,
        cursor: "",
        limit: 20,
      });
      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch (loadError: any) {
      setError(loadError?.message || t.imaNotes.loadFailed);
    } finally {
      setLoadingNotes(false);
    }
  }, [isEnabled, imaPost, t.imaNotes.loadFailed]);

  useEffect(() => {
    if (!isEnabled) {
      setNotebooks([]);
      setNotes([]);
      return;
    }
    void loadNotebooks();
    void loadNotes("");
  }, [isEnabled, loadNotebooks, loadNotes]);

  const clearSearch = () => {
    setQuery("");
    setSearchActive(false);
    setSearchResults([]);
  };

  const selectNotebook = (id: string) => {
    setSelectedNotebookId(id);
    clearSearch();
    void loadNotes(id);
  };

  const runSearch = async () => {
    const term = query.trim();
    if (!term || !isEnabled) return;
    setSearching(true);
    setError(null);
    try {
      const data = await imaPost("/api/ima/search-notes", { query: term });
      setSearchResults(Array.isArray(data.notes) ? data.notes : []);
      setSearchActive(true);
    } catch (searchError: any) {
      setError(searchError?.message || t.imaNotes.loadFailed);
    } finally {
      setSearching(false);
    }
  };

  const openNote = async (note: ImaNote) => {
    setSelectedNote(note);
    setNoteContent("");
    setContentError(null);
    setContentLoading(true);
    setAppendOpen(false);
    setAppendContent("");
    setRenameOpen(false);
    setRenameTitle(note.title);
    setKbPickerOpen(false);
    setKbResult(null);
    setReaderFullscreen(false);
    setCloseConfirmOpen(false);
    try {
      const data = await imaPost("/api/ima/note-content", { noteId: note.id });
      setNoteContent(String(data.content || ""));
    } catch (openError: any) {
      setContentError(openError?.message || t.imaNotes.loadFailed);
    } finally {
      setContentLoading(false);
    }
  };

  useEffect(() => {
    if (!openNoteId) return;
    const note = notes.find(item => item.id === openNoteId) ||
      searchResults.find(item => item.id === openNoteId);
    if (note) {
      void openNote(note);
      onOpenNoteHandled?.();
    } else if (!loadingNotes) {
      onOpenNoteHandled?.();
    }
  }, [openNoteId, notes, searchResults, loadingNotes]);

  const refreshAfterWrite = async () => {
    await loadNotes(selectedNotebookId);
    if (searchActive) await runSearch();
  };

  const submitAppend = async () => {
    if (!selectedNote || !appendContent.trim()) return;

    setAppending(true);
    setEditError(null);
    try {
      await imaPost("/api/ima/append-note", {
        noteId: selectedNote.id,
        content: appendContent.trim(),
      });
      const data = await imaPost("/api/ima/note-content", { noteId: selectedNote.id });
      setNoteContent(String(data.content || ""));
      setAppendContent("");
      setAppendOpen(false);
      await refreshAfterWrite();
    } catch (appendError: any) {
      setEditError(appendError?.message || t.imaNotes.loadFailed);
    } finally {
      setAppending(false);
    }
  };

  const submitRename = async () => {
    if (!selectedNote || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      await imaPost("/api/ima/rename-note", {
        noteId: selectedNote.id,
        title: renameTitle.trim(),
      });
      setSelectedNote({ ...selectedNote, title: renameTitle.trim() });
      setRenameOpen(false);
      await refreshAfterWrite();
    } catch (renameError: any) {
      setContentError(renameError?.message || t.imaNotes.loadFailed);
    } finally {
      setRenaming(false);
    }
  };

  const openKbPicker = async () => {
    setKbPickerOpen(true);
    setKbResult(null);
    try {
      const data = await imaPost("/api/ima/knowledge-bases", {});
      const list: IMAKnowledgeBase[] = Array.isArray(data.knowledgeBases) ? data.knowledgeBases : [];
      setKbOptions(list);
      setSelectedKbId(list[0]?.id || "");
    } catch (kbError: any) {
      setContentError(kbError?.message || t.imaNotes.loadFailed);
    }
  };

  const addToKnowledgeBase = async () => {
    if (!selectedNote || !selectedKbId) return;
    setAddingToKb(true);
    setKbResult(null);
    try {
      await imaPost("/api/ima/add-note-to-kb", {
        knowledgeBaseId: selectedKbId,
        noteId: selectedNote.id,
        title: selectedNote.title,
      });
      const kbName = kbOptions.find(kb => kb.id === selectedKbId)?.name || selectedKbId;
      setKbResult(t.imaNotes.addToKbDone.replace("{name}", kbName));
    } catch (kbError: any) {
      setContentError(kbError?.message || t.imaNotes.loadFailed);
    } finally {
      setAddingToKb(false);
    }
  };

  const submitCreate = async () => {
    if (!createTitle.trim() && !createContent.trim()) return;
    setCreating(true);
    try {
      await imaPost("/api/ima/create-note", {
        title: createTitle.trim(),
        content: createContent.trim() || createTitle.trim(),
        folderId: createNotebookId || undefined,
      });
      setCreateOpen(false);
      setCreateTitle("");
      setCreateContent("");
      setCreateNotebookId("");
      await loadNotes(selectedNotebookId);
    } catch (createError: any) {
      setError(createError?.message || t.imaNotes.loadFailed);
    } finally {
      setCreating(false);
    }
  };

  const toggleLocalNote = (id: string) => {
    setSelectedLocalIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importLocalNotes = async () => {
    if (!isEnabled || selectedLocalIds.size === 0) return;
    setImporting(true);
    setImportResult(null);
    const existingTitles = new Set(notes.map(note => note.title));
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const note of localNotes) {
      if (!selectedLocalIds.has(note.id)) continue;
      if (existingTitles.has(note.topic)) {
        skipped += 1;
        continue;
      }
      try {
        await imaPost("/api/ima/create-note", {
          title: note.topic,
          content: note.content,
          folderId: createNotebookId || undefined,
        });
        imported += 1;
      } catch {
        failed += 1;
      }
    }

    setImportResult(t.imaNotes.importDone
      .replace("{count}", String(imported))
      .replace("{skipped}", String(skipped))
      .replace("{failed}", String(failed)));
    setSelectedLocalIds(new Set());
    setImporting(false);
    await loadNotes(selectedNotebookId);
  };

  const visibleNotes = searchActive ? searchResults : notes;
  const formatDate = (value: number) => {
    if (!value) return "";
    return new Date(value).toLocaleDateString(locale === "en-US" ? "en-US" : "zh-CN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const notebookOptions = useMemo(
    () => notebooks.filter(notebook => notebook.folderType === 0),
    [notebooks],
  );

  const renderNoteCard = (note: ImaNote) => (
    <button
      key={note.id}
      onClick={() => void openNote(note)}
      className="w-full text-left bg-[#222222] border border-white/5 hover:border-[#b8f600]/30 hover:bg-[#2A2A2A] rounded-lg p-4 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-3.5 h-3.5 text-[#b8f600] shrink-0" />
            <span className="text-[11px] font-bold text-[#e3e3de] truncate">{note.title || t.notes.emptyContent}</span>
          </div>
          {(note.highlight || note.summary) && (
            <p className="text-[10px] text-[#c3caac]/60 mt-1.5 line-clamp-2 leading-relaxed">
              {stripHtml(note.highlight || note.summary)}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-[9px] font-mono text-white/25">
            {note.folderName && <span>{note.folderName}</span>}
            {note.folderName && note.updatedAt > 0 && <span>·</span>}
            {note.updatedAt > 0 && (
              <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{formatDate(note.updatedAt)}</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />
      </div>
    </button>
  );

  if (!hasCredentials) {
    return (
      <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto scrollbar-modern">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-32 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
          <Database className="w-12 h-12 text-white/10 mb-4" />
          <p className="text-sm text-white/50 font-mono">{t.imaNotes.notConfigured}</p>
          <p className="text-xs text-[#c3caac]/65 mt-1 max-w-md leading-relaxed">{t.imaNotes.notConfiguredDesc}</p>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 mt-5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            {t.imaNotes.configure}
          </button>
        </div>
      </div>
    );
  }

  if (!imaConfig.enabled) {
    return (
      <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto scrollbar-modern">
        <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-32 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
          <Database className="w-12 h-12 text-white/10 mb-4" />
          <p className="text-sm text-white/50 font-mono">{t.imaNotes.disabled}</p>
          <p className="text-xs text-[#c3caac]/65 mt-1 max-w-md leading-relaxed">{t.imaNotes.disabledDesc}</p>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 mt-5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            {t.imaNotes.enable}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#121411] h-screen overflow-hidden flex flex-col" id="ima-notes-container">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 shrink-0 flex items-start justify-between gap-4 flex-wrap border-b border-[#434933]/30">
        <div>
          <h2 className="text-xl font-bold text-[#e3e3de] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#b8f600]" />
            {t.imaNotes.title}
          </h2>
          <p className="text-xs text-[#c3caac]/70 mt-1">{t.imaNotes.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenLocal}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-[#e3e3de] hover:border-white/20 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {t.imaNotes.localTab}
          </button>
          <button
            onClick={() => {
              void loadNotebooks();
              void loadNotes(selectedNotebookId);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-[#e3e3de] hover:border-white/20 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t.imaNotes.refresh}
          </button>
          <button
            onClick={() => {
              setCreateOpen(true);
              setCreateTitle("");
              setCreateContent("");
              setCreateNotebookId(selectedNotebookId || "");
              setCreatePreviewOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.imaNotes.create}
          </button>
          <button
            onClick={() => {
              setImportOpen(true);
              setSelectedLocalIds(new Set());
              setImportResult(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {t.imaNotes.importLocal}
          </button>
        </div>
      </div>

      {/* Notebook tabs + search */}
      <div className="px-8 py-3 shrink-0 space-y-3 border-b border-[#434933]/30 bg-[#1a1c19]/40">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => selectNotebook("")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              selectedNotebookId === ""
                ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t.imaNotes.allNotebooks}</span>
            <span className="text-[9px] text-white/40 font-mono ml-1">{notes.length}</span>
          </button>
          {notebooks.map(notebook => (
            <button
              key={notebook.id}
              onClick={() => selectNotebook(notebook.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                selectedNotebookId === notebook.id
                  ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                  : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
              }`}
            >
              <span className="truncate max-w-[10rem]">{notebook.name}</span>
              <span className="text-[9px] text-white/40 font-mono ml-1">{notebook.noteCount}</span>
            </button>
          ))}
          {loadingNotebooks && (
            <span className="w-3.5 h-3.5 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.imaNotes.searchPlaceholder}
              className="w-full bg-[#121411] border border-white/5 rounded pl-10 pr-9 py-2.5 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                title={t.imaNotes.clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!query.trim() || searching}
            className="px-4 py-2.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            {searching ? (
              <span className="w-3.5 h-3.5 border-2 border-[#141f00]/30 border-t-[#141f00] rounded-full animate-spin block" />
            ) : (
              t.imaNotes.search
            )}
          </button>
        </form>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto scrollbar-modern px-8 py-5">
        <div className="w-full max-w-6xl space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-rose-500/20 bg-rose-500/5 text-[10px] text-rose-300">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] font-mono text-white/30">
            <span>
              {searchActive
                ? `${t.imaNotes.searchResults} · ${searchResults.length}`
                : t.imaNotes.notesCount.replace("{count}", String(notes.length))}
            </span>
            {searchActive && <button onClick={clearSearch} className="hover:text-white transition-colors">{t.imaNotes.clearSearch}</button>}
          </div>

          {loadingNotes ? (
            <div className="flex items-center justify-center gap-2 py-24 text-xs text-[#c3caac]/70 font-mono">
              <span className="w-4 h-4 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
              {t.imaNotes.loading}
            </div>
          ) : visibleNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
              <BookOpen className="w-10 h-10 text-white/10 mb-3" />
              <p className="text-xs text-white/40">{searchActive ? t.imaNotes.noResults : t.imaNotes.noNotes}</p>
              {!searchActive && (
                <p className="text-[10px] text-[#c3caac]/60 mt-1 max-w-sm leading-relaxed">{t.imaNotes.noNotesDesc}</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleNotes.map(renderNoteCard)}
            </div>
          )}
        </div>
      </div>

      {/* Reader */}
      <AnimatePresence>
        {selectedNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[70] modal-backdrop flex items-center justify-center ${readerFullscreen ? "p-0" : "p-4"}`}
            onClick={requestCloseReader}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className={`${readerFullscreen ? "w-full h-full max-w-none max-h-none rounded-none" : `w-full ${appendOpen ? "max-w-5xl" : "max-w-3xl"} max-h-[88vh] rounded`} bg-[#222222] border border-white/10 shadow-2xl flex flex-col overflow-hidden`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-[#434933]/30 flex items-start justify-between gap-4 shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-[#b8f600] shrink-0" />
                    <h3 className="text-sm font-bold text-[#e3e3de] truncate">{selectedNote.title || t.notes.emptyContent}</h3>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-white/30 font-mono">
                    {selectedNote.folderName && <span>{selectedNote.folderName}</span>}
                    {selectedNote.updatedAt > 0 && <span>· {formatDate(selectedNote.updatedAt)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!appendOpen && (
                    <button
                      onClick={() => {
                        setAppendOpen(true);
                        setRenameTitle(selectedNote.title);
                        setAppendContent("");
                        setContentError(null);
                        setEditError(null);
                        setEditPreviewOpen(true);
                      }}
                      title={t.imaNotes.editNote}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#b8f600]/25 text-[#b8f600] hover:bg-[#b8f600]/10 text-[10px] font-bold transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {t.imaNotes.editNote}
                    </button>
                  )}
                  <a
                    href="https://ima.qq.com"
                    target="_blank"
                    rel="noreferrer"
                    title={t.imaNotes.openInIma}
                    className="p-1.5 rounded text-white/40 hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => setReaderFullscreen(prev => !prev)}
                    title={readerFullscreen ? t.imaNotes.exitFullscreen : t.imaNotes.fullscreen}
                    className="p-1.5 rounded text-white/40 hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
                  >
                    {readerFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={requestCloseReader}
                    className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-modern">
                {contentLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-xs text-[#c3caac]/70 font-mono">
                    <span className="w-4 h-4 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                    {t.imaNotes.loading}
                  </div>
                ) : contentError ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-8 h-8 text-rose-400/70 mb-3" />
                    <p className="text-xs text-rose-300">{contentError}</p>
                    <button
                      onClick={() => void openNote(selectedNote)}
                      className="mt-4 px-3 py-1.5 rounded border border-white/10 text-[10px] text-[#c3caac] hover:text-white transition-colors"
                    >
                      {t.imaNotes.retry}
                    </button>
                  </div>
                ) : appendOpen ? (
                  <div className="space-y-4">
                    <details className="bg-[#1a1c19] border border-white/5 rounded overflow-hidden" open>
                      <summary className="px-3 py-2 text-[10px] font-mono text-[#c3caac] cursor-pointer select-none">
                        {t.imaNotes.currentContent}
                      </summary>
                      <div className="px-3 pb-3 max-h-44 overflow-y-auto scrollbar-modern">
                        {noteContent.trim() ? (
                          <MarkdownView content={noteContent} />
                        ) : (
                          <p className="text-[10px] text-white/30">{t.notes.emptyContent}</p>
                        )}
                      </div>
                    </details>

                    <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
                      <span className="text-[10px] uppercase tracking-wider text-white/40">
                        {t.imaNotes.contentLabel}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-white/40">
                        {t.imaNotes.preview}
                      </span>
                    </div>
                    <p className="text-[9px] text-amber-300/55 leading-relaxed">
                      {t.imaNotes.editAppendHint}
                    </p>
                    {renderFormatToolbar(appendContentRef, appendContent, setAppendContent)}
                    <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
                      <textarea
                        ref={appendContentRef}
                        onContextMenu={(event) => openEditorContextMenu(event, "append")}
                        onScroll={(event) => syncEditorScroll(event.currentTarget, appendPreviewRef.current)}
                        value={appendContent}
                        onChange={(event) => setAppendContent(event.target.value)}
                        placeholder={t.imaNotes.appendPlaceholder}
                        className="w-full h-[44vh] bg-[#1a1c19] border border-white/10 rounded px-4 py-3 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] transition-colors resize-none"
                      />
                      <div
                        ref={appendPreviewRef}
                        onScroll={(event) => syncEditorScroll(event.currentTarget, appendContentRef.current)}
                        className="h-[44vh] overflow-y-auto scrollbar-modern bg-[#1a1c19] border border-white/5 rounded p-3"
                      >
                        {appendContent.trim() ? (
                          <MarkdownView content={appendContent} />
                        ) : (
                          <p className="text-[10px] text-white/25">{t.imaNotes.previewEmpty}</p>
                        )}
                      </div>
                    </div>

                    {editError && (
                      <p className="text-[10px] text-rose-400 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {editError}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {noteContent.trim() ? (
                      <MarkdownView content={noteContent} />
                    ) : (
                      <p className="text-xs text-white/30 font-mono">{t.notes.emptyContent}</p>
                    )}
                  </>
                )}
              </div>

              <div className="px-6 py-3 border-t border-[#434933]/30 flex items-center justify-between gap-3 shrink-0">
                <span className="text-[9px] text-white/25 leading-relaxed">{t.imaNotes.deleteHint}</span>
                {appendOpen ? (
                  <button
                    onClick={() => void submitAppend()}
                    disabled={appending || !appendContent.trim()}
                    className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold transition-colors disabled:opacity-30"
                  >
                    {appending ? t.imaNotes.appending : t.imaNotes.appendSubmit}
                  </button>
                ) : (
                  <button
                    onClick={() => void openKbPicker()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#b8f600]/25 text-[#b8f600] hover:bg-[#b8f600]/10 text-[10px] font-bold transition-colors"
                  >
                    <BookMarked className="w-3.5 h-3.5" />
                    {t.imaNotes.addToKb}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discard unsaved edits confirmation */}
      <AnimatePresence>
        {closeConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setCloseConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-sm bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30">
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.imaNotes.discardEditTitle}</h3>
              </div>
              <div className="p-5">
                <p className="text-[11px] text-[#c3caac] leading-relaxed">{t.imaNotes.discardEditDesc}</p>
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2">
                <button
                  onClick={() => setCloseConfirmOpen(false)}
                  className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white transition-colors"
                >
                  {t.imaNotes.keepEditing}
                </button>
                <button
                  onClick={() => {
                    setCloseConfirmOpen(false);
                    setAppendOpen(false);
                    setAppendContent("");
                    setReaderFullscreen(false);
                    setSelectedNote(null);
                  }}
                  className="px-4 py-1.5 rounded bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold transition-colors"
                >
                  {t.imaNotes.discardAndClose}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add note to knowledge base */}
      <AnimatePresence>
        {kbPickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[88] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setKbPickerOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-md bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[#e3e3de] flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-[#b8f600]" />
                  {t.imaNotes.addToKb}
                </h3>
                <button onClick={() => setKbPickerOpen(false)} className="text-white/40 hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                {kbOptions.length === 0 ? (
                  <p className="text-[11px] text-white/40">{t.library.imaNoKnowledgeBases}</p>
                ) : (
                  <label className="block">
                    <span className="text-[10px] text-[#c3caac] block mb-1">{t.imaNotes.selectKb}</span>
                    <select
                      value={selectedKbId}
                      onChange={(event) => setSelectedKbId(event.target.value)}
                      className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    >
                      {kbOptions.map(kb => (
                        <option key={kb.id} value={kb.id}>{kb.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {kbResult && (
                  <p className="text-[10px] text-[#b8f600] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    {kbResult}
                  </p>
                )}
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2">
                <button
                  onClick={() => setKbPickerOpen(false)}
                  className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white transition-colors"
                >
                  {t.imaNotes.cancel}
                </button>
                <button
                  onClick={() => void addToKnowledgeBase()}
                  disabled={addingToKb || !selectedKbId}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold disabled:opacity-30"
                >
                  {addingToKb ? t.imaNotes.addingToKb : t.imaNotes.addToKb}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {createOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setCreateOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-5xl max-h-[88vh] bg-[#222222] border border-white/10 rounded shadow-2xl flex flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.imaNotes.createTitle}</h3>
                <button onClick={() => setCreateOpen(false)} className="text-white/40 hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3 overflow-y-auto scrollbar-modern">
                <label className="block">
                  <span className="text-[10px] text-[#c3caac] block mb-1">{t.imaNotes.titleLabel}</span>
                  <input
                    type="text"
                    value={createTitle}
                    onChange={(event) => setCreateTitle(event.target.value)}
                    placeholder={t.imaNotes.titlePlaceholder}
                    className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-[#c3caac] block mb-1">{t.imaNotes.notebookLabel}</span>
                  <select
                    value={createNotebookId}
                    onChange={(event) => setCreateNotebookId(event.target.value)}
                    className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                  >
                    <option value="">{t.imaNotes.noNotebook}</option>
                    {notebookOptions.map(notebook => (
                      <option key={notebook.id} value={notebook.id}>{notebook.name}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
                  <span className="text-[10px] text-[#c3caac] block">{t.imaNotes.contentLabel}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/40 block">
                    {t.imaNotes.preview}
                  </span>
                </div>
                {renderFormatToolbar(createContentRef, createContent, setCreateContent)}
                <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3">
                  <textarea
                    ref={createContentRef}
                    onContextMenu={(event) => openEditorContextMenu(event, "create")}
                    onScroll={(event) => syncEditorScroll(event.currentTarget, createPreviewRef.current)}
                    value={createContent}
                    onChange={(event) => setCreateContent(event.target.value)}
                    placeholder={t.imaNotes.contentPlaceholder}
                    className="w-full h-[44vh] bg-[#1a1c19] border border-white/10 rounded px-3 py-2.5 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] resize-none"
                  />
                  <div
                    ref={createPreviewRef}
                    onScroll={(event) => syncEditorScroll(event.currentTarget, createContentRef.current)}
                    className="h-[44vh] overflow-y-auto scrollbar-modern bg-[#1a1c19] border border-white/5 rounded p-3"
                  >
                    {createContent.trim() ? (
                      <MarkdownView content={createContent} />
                    ) : (
                      <p className="text-[10px] text-white/25">{t.imaNotes.previewEmpty}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2">
                <button onClick={() => setCreateOpen(false)} className="px-3 py-1.5 text-[11px] text-[#c3caac] hover:text-white">
                  {t.imaNotes.cancel}
                </button>
                <button
                  onClick={() => void submitCreate()}
                  disabled={creating || (!createTitle.trim() && !createContent.trim())}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold disabled:opacity-30"
                >
                  {creating ? t.imaNotes.saving : t.imaNotes.save}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import local notes modal */}
      <AnimatePresence>
        {importOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setImportOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-lg max-h-[85vh] bg-[#222222] border border-white/10 rounded shadow-2xl flex flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#e3e3de]">{t.imaNotes.importTitle}</h3>
                  <p className="text-[10px] text-white/35 mt-0.5">{t.imaNotes.importDesc}</p>
                </div>
                <button onClick={() => setImportOpen(false)} className="text-white/40 hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 scrollbar-modern space-y-2">
                {localNotes.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-10">{t.imaNotes.noLocalNotes}</p>
                ) : (
                  localNotes.map(note => (
                    <label key={note.id} className="flex items-start gap-2.5 p-2.5 rounded border border-white/5 bg-[#1a1c19] cursor-pointer hover:border-white/15">
                      <input
                        type="checkbox"
                        checked={selectedLocalIds.has(note.id)}
                        onChange={() => toggleLocalNote(note.id)}
                        className="accent-[#b8f600] mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="text-[11px] text-[#e3e3de] block truncate">{note.topic || t.notes.emptyContent}</span>
                        <span className="text-[9px] text-white/30 block truncate mt-0.5">{note.content.slice(0, 80)}</span>
                      </span>
                    </label>
                  ))
                )}
                {importResult && (
                  <p className="text-[10px] text-[#b8f600] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    {importResult}
                  </p>
                )}
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[10px] text-[#c3caac]">
                  <span>{t.imaNotes.notebookLabel}</span>
                  <select
                    value={createNotebookId}
                    onChange={(event) => setCreateNotebookId(event.target.value)}
                    className="bg-[#1a1c19] border border-white/10 rounded px-2 py-1 text-[10px] text-[#e3e3de] focus:outline-none"
                  >
                    <option value="">{t.imaNotes.noNotebook}</option>
                    {notebookOptions.map(notebook => (
                      <option key={notebook.id} value={notebook.id}>{notebook.name}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setImportOpen(false)} className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white">
                    {t.imaNotes.cancel}
                  </button>
                  <button
                    onClick={() => void importLocalNotes()}
                    disabled={importing || selectedLocalIds.size === 0}
                    className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold disabled:opacity-30"
                  >
                    {importing ? t.imaNotes.importing : t.imaNotes.importSelected}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word-like right-click menu for IMA note editors */}
      {contextMenu && (
        <div
          className="fixed z-[95] w-48 bg-[#222222] border border-white/10 rounded-lg shadow-2xl p-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {[
            { label: t.imaNotes.formatBold, icon: Bold, before: "**", after: "**" },
            { label: t.imaNotes.formatItalic, icon: Italic, before: "*", after: "*" },
            { label: t.imaNotes.formatUnderline, icon: Underline, before: "~", after: "~" },
            { label: t.imaNotes.formatHighlight, icon: Highlighter, before: "==", after: "==" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyContextFormat(item.before, item.after)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-[#c3caac] hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
          <div className="h-px bg-white/5 my-1" />
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runEditorCommand("cut")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-[#c3caac] hover:text-white hover:bg-white/5 transition-colors"
          >
            <Scissors className="w-3.5 h-3.5" />
            {t.imaNotes.cut}
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runEditorCommand("copy")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-[#c3caac] hover:text-white hover:bg-white/5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {t.imaNotes.copy}
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void pasteIntoEditor()}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[10px] text-[#c3caac] hover:text-white hover:bg-white/5 transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            {t.imaNotes.paste}
          </button>
        </div>
      )}
    </div>
  );
}
