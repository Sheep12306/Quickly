import React, { useState, useEffect, useRef } from "react";
import { NoteItem, NoteFolder } from "../types";
import { BookOpen, Search, Download, Trash2, Edit2, Check, Folder, FolderOpen, Plus, X, FilePlus, FileDown, FileUp, ChevronRight, BookMarked, Sparkles, Link2, ImagePlus, Server, Copy, Database, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useI18n } from "../i18n";
import {
  extractMaterialFile,
  isSupportedMaterialFile,
  MAX_LIBRARY_FILE_BYTES,
  LIBRARY_FILE_ACCEPT,
} from "../utils/extractMaterial";

interface NotesChestProps {
  notes: NoteItem[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: { topic?: string; content?: string }) => void;
  folders: NoteFolder[];
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveNoteToFolder: (noteId: string, folderId: string | undefined) => void;
  onCreateNote?: (topic: string, content: string, folderId?: string) => void;
  onRestoreBackup?: (backup: { notes: NoteItem[]; folders: NoteFolder[] }) => void | Promise<void>;
  onOrganizeNotes?: (notes: NoteItem[], name: string, mode: "raw" | "ai") => void | Promise<void>;
  onAnalyzeNoteSource?: (source: {
    link?: string;
    imageDataUrl?: string;
    instruction?: string;
  }) => Promise<{ title: string; content: string }>;
  jumpToNoteId?: string | null;
  onClose?: () => void;
  onOpenIma?: () => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, term: string) {
  const needle = term.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "gi"));
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    part.toLowerCase() === needle.toLowerCase()
      ? <mark key={index} className="bg-[#b8f600]/25 text-inherit rounded-sm px-0.5">{part}</mark>
      : <React.Fragment key={index}>{part}</React.Fragment>
  ));
}

export default function NotesChest({ 
  notes, onDelete, onUpdate, 
  folders, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveNoteToFolder,
  onCreateNote,
  onRestoreBackup,
  onOrganizeNotes,
  onAnalyzeNoteSource,
  jumpToNoteId,
  onClose,
  onOpenIma,
}: NotesChestProps) {
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editText, setEditText] = useState("");
  
  // Folder states
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [moveNoteId, setMoveNoteId] = useState<string | null>(null);

  // New note title prompt
  const [showNewNotePrompt, setShowNewNotePrompt] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [showNoteAI, setShowNoteAI] = useState(false);
  const [sourceLink, setSourceLink] = useState("");
  const [sourceImage, setSourceImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [sourceInstruction, setSourceInstruction] = useState("");
  const [analyzingSource, setAnalyzingSource] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [showMcpConfig, setShowMcpConfig] = useState(false);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [mcpTokenLoading, setMcpTokenLoading] = useState(false);
  const [mcpTokenRotating, setMcpTokenRotating] = useState(false);
  const [mcpTokenCopied, setMcpTokenCopied] = useState(false);
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const noteCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastJumpRef = useRef<string | null>(null);
  const cancelFolderRenameRef = useRef(false);
  const cancelEditRef = useRef(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const importNotesInputRef = useRef<HTMLInputElement>(null);
  const [readingNoteId, setReadingNoteId] = useState<string | null>(null);

  // Selection mode: turn several notes into one library material package.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [showOrganize, setShowOrganize] = useState(false);
  const [organizeName, setOrganizeName] = useState("");
  const [organizeMode, setOrganizeMode] = useState<"raw" | "ai">("ai");
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);

  // Locate a note coming from another page (e.g. a chat source citation):
  // switch to its folder, clear the search filter, then scroll it into view.
  useEffect(() => {
    if (!jumpToNoteId) {
      lastJumpRef.current = null;
      return;
    }
    if (lastJumpRef.current === jumpToNoteId) return;

    const note = notes.find(n => n.id === jumpToNoteId);
    if (!note) return;

    lastJumpRef.current = jumpToNoteId;
    setSearchTerm("");
    setSelectedFolderId(note.folderId || "unassigned");
    setTimeout(() => {
      noteCardRefs.current[jumpToNoteId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [jumpToNoteId, notes]);

  // Filter notes based on selected folder
  const filteredNotes = notes.filter((n) => {
    const matchesSearch = n.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedFolderId === null) {
      // In "All" view, folders represent their contents. The main grid only
      // shows unfiled notes unless the user is actively searching.
      return matchesSearch && (searchTerm.trim() ? true : !n.folderId);
    } else if (selectedFolderId === "unassigned") {
      return matchesSearch && !n.folderId;
    } else {
      return matchesSearch && n.folderId === selectedFolderId;
    }
  });

  const startEdit = (note: NoteItem) => {
    cancelEditRef.current = false;
    setEditingId(note.id);
    setEditTopic(note.topic);
    setEditText(note.content);
  };

  const saveEdit = (note: NoteItem) => {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      setEditingId(null);
      setEditTopic("");
      setEditText("");
      return;
    }
    onUpdate(note.id, {
      topic: editTopic.trim() || note.topic,
      content: editText,
    });
    setEditingId(null);
  };

  const cancelEdit = () => {
    cancelEditRef.current = true;
    setEditingId(null);
    setEditTopic("");
    setEditText("");
  };

  const readingNote = readingNoteId
    ? notes.find(note => note.id === readingNoteId) || null
    : null;
  const readingNoteFolder = readingNote
    ? folders.find(folder => folder.id === readingNote.folderId) || null
    : null;

  useEffect(() => {
    if (!readingNoteId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReadingNoteId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readingNoteId]);

  useEffect(() => {
    if (readingNoteId && !notes.some(note => note.id === readingNoteId)) {
      setReadingNoteId(null);
    }
  }, [readingNoteId, notes]);

  const editFromReader = (note: NoteItem) => {
    setReadingNoteId(null);
    startEdit(note);
  };

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedNoteIds(new Set());
    setShowOrganize(false);
    setOrganizeError(null);
  };

  const openOrganizeDialog = () => {
    if (selectedNoteIds.size === 0) return;
    setOrganizeName(
      `${t.library.notesPackagePrefix} ${new Date().toLocaleDateString(locale === "en-US" ? "en-US" : "zh-CN")}`,
    );
    setOrganizeMode("ai");
    setOrganizeError(null);
    setShowOrganize(true);
  };

  const submitOrganize = async () => {
    const selected = notes.filter(note => selectedNoteIds.has(note.id));
    if (selected.length === 0 || !onOrganizeNotes) return;
    setOrganizing(true);
    setOrganizeError(null);
    try {
      await onOrganizeNotes(selected, organizeName, organizeMode);
      exitSelectionMode();
    } catch (error) {
      console.error("Failed to organize notes", error);
      setOrganizeError(t.notes.organizeFailed);
    } finally {
      setOrganizing(false);
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setShowCreateFolder(false);
    }
  };

  const startRenameFolder = (folder: NoteFolder) => {
    cancelFolderRenameRef.current = false;
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  };

  const saveRenameFolder = () => {
    if (cancelFolderRenameRef.current) {
      // Escape was pressed; the following blur must not save the edit.
      cancelFolderRenameRef.current = false;
      setEditingFolderId(null);
      setEditingFolderName("");
      return;
    }
    if (editingFolderId && editingFolderName.trim()) {
      onRenameFolder(editingFolderId, editingFolderName.trim());
    }
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const cancelRenameFolder = () => {
    cancelFolderRenameRef.current = true;
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = (folderId: string) => {
    if (confirm(t.notes.confirmDeleteFolder)) {
      onDeleteFolder(folderId);
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
    }
  };

  const submitNewNote = () => {
    if (!newNoteTitle.trim()) return;
    const folderId = selectedFolderId && selectedFolderId !== "unassigned"
      ? selectedFolderId
      : undefined;
    onCreateNote?.(newNoteTitle.trim(), newNoteContent, folderId);
    setShowNewNotePrompt(false);
    setNewNoteTitle("");
    setNewNoteContent("");
    setSearchTerm("");
  };

  const handleScreenshotFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setAnalyzeError(t.notes.imageOnly);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAnalyzeError(t.notes.imageTooLarge);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSourceImage({ dataUrl: String(reader.result || ""), name: file.name });
      setAnalyzeError(null);
    };
    reader.onerror = () => setAnalyzeError(t.notes.analyzeFailed);
    reader.readAsDataURL(file);
  };

  const handleScreenshotPaste = (event: React.ClipboardEvent) => {
    const items = Array.from(event.clipboardData.items) as DataTransferItem[];
    const imageItem = items.find(item => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (file) {
      event.preventDefault();
      handleScreenshotFile(file);
    }
  };

  const analyzeSource = async () => {
    if (!sourceLink.trim() && !sourceImage) {
      setAnalyzeError(t.notes.needSource);
      return;
    }
    if (!onAnalyzeNoteSource) {
      setAnalyzeError(t.notes.analyzeFailed);
      return;
    }
    setAnalyzingSource(true);
    setAnalyzeError(null);
    try {
      const result = await onAnalyzeNoteSource({
        link: sourceLink.trim() || undefined,
        imageDataUrl: sourceImage?.dataUrl,
        instruction: sourceInstruction.trim() || undefined,
      });
      setNewNoteTitle(result.title);
      setNewNoteContent(result.content);
    } catch (error) {
      console.error("Failed to analyze note source", error);
      setAnalyzeError(error instanceof Error ? error.message : t.notes.analyzeFailed);
    } finally {
      setAnalyzingSource(false);
    }
  };

  const mcpEndpoint = typeof window !== "undefined"
    ? `${window.location.origin}/mcp`
    : "http://localhost:3001/mcp";
  const mcpConfig = JSON.stringify({
    mcpServers: {
      quickly: {
        type: "http",
        url: mcpEndpoint,
        ...(mcpToken ? { headers: { Authorization: `Bearer ${mcpToken}` } } : {}),
      },
    },
  }, null, 2);

  useEffect(() => {
    if (!showMcpConfig || mcpToken) return;
    let cancelled = false;
    setMcpTokenLoading(true);
    fetch("/api/mcp/token", { credentials: "same-origin" })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(payload => {
        if (!cancelled && typeof payload?.token === "string") setMcpToken(payload.token);
      })
      .catch(error => console.error("Failed to load MCP token", error))
      .finally(() => { if (!cancelled) setMcpTokenLoading(false); });
    return () => { cancelled = true; };
  }, [showMcpConfig, mcpToken]);

  const copyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfig);
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy MCP config", error);
    }
  };

  const copyMcpToken = async () => {
    if (!mcpToken) return;
    try {
      await navigator.clipboard.writeText(mcpToken);
      setMcpTokenCopied(true);
      setTimeout(() => setMcpTokenCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy MCP token", error);
    }
  };

  const rotateMcpToken = async () => {
    if (!confirm(t.notes.mcpTokenRotateConfirm)) return;
    setMcpTokenRotating(true);
    try {
      const response = await fetch("/api/mcp/token/rotate", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && typeof payload?.token === "string") setMcpToken(payload.token);
    } catch (error) {
      console.error("Failed to rotate MCP token", error);
    } finally {
      setMcpTokenRotating(false);
    }
  };

  const exportNotesBackup = () => {
    const payload = {
      app: "Quickly",
      version: 1,
      exportedAt: new Date().toISOString(),
      folders,
      notes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Quickly_Notes_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onRestoreBackup) return;

    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.notes) || !Array.isArray(data.folders)) {
        throw new Error("Invalid backup shape");
      }
      const validNotes: NoteItem[] = data.notes.filter((note: any) => (
        note && typeof note.id === "string" && typeof note.topic === "string" && typeof note.content === "string"
      ));
      const validFolders: NoteFolder[] = data.folders.filter((folder: any) => (
        folder && typeof folder.id === "string" && typeof folder.name === "string"
      ));
      if (validNotes.length === 0 && validFolders.length === 0) {
        throw new Error("Empty backup");
      }
      await onRestoreBackup({ notes: validNotes, folders: validFolders });
      setSearchTerm("");
      setSelectedFolderId(null);
      alert(
        t.notes.importSuccess
          .replace("{notes}", String(validNotes.length))
          .replace("{folders}", String(validFolders.length)),
      );
    } catch (error) {
      console.error("Failed to import notes backup", error);
      alert(t.notes.importError);
    }
  };

  const escapeHtml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const exportToWord = () => {
    const notesToExport = selectedFolderId === null && !searchTerm.trim()
      ? notes
      : filteredNotes;
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <title>Quickly Notes</title>
  <style>
    body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; color: #111; font-size: 12pt; line-height: 1.7; }
    h1 { font-size: 20pt; margin: 0 0 16px; }
    h2 { font-size: 14pt; margin: 20px 0 6px; }
    .meta { color: #666; font-size: 9pt; margin-bottom: 8px; }
    .note { page-break-inside: avoid; margin-bottom: 18px; }
    hr { border: 0; border-top: 1px solid #ddd; margin: 14px 0; }
  </style>
</head>
<body>
  <h1>Quickly Notes</h1>
  ${notesToExport.map((note) => `
    <div class="note">
      <h2>${escapeHtml(note.topic)}</h2>
      <div class="meta">${escapeHtml(note.timestamp || "")}</div>
      <div>${escapeHtml(note.content).replace(/\n/g, "<br>")}</div>
    </div>
    <hr>
  `).join("")}
</body>
</html>`;
    const blob = new Blob(["﻿", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Quickly_Notes_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportNotes = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0 || !onCreateNote) return;
    const targetFolderId = selectedFolderId && selectedFolderId !== "unassigned"
      ? selectedFolderId
      : undefined;
    const errors: string[] = [];

    for (const file of files) {
      if (!isSupportedMaterialFile(file) || file.size > MAX_LIBRARY_FILE_BYTES) {
        errors.push(`${file.name}: ${t.notes.importNotesFailed}`);
        continue;
      }
      try {
        const extracted = await extractMaterialFile(file);
        if (!extracted.content.trim()) {
          errors.push(`${file.name}: ${t.notes.emptyContent}`);
          continue;
        }
        const title = extracted.name.replace(/\.[^.]+$/, "") || extracted.name;
        await onCreateNote(title, extracted.content.trim(), targetFolderId);
      } catch (error) {
        console.error("Failed to import note file", file.name, error);
        errors.push(`${file.name}: ${t.notes.importNotesFailed}`);
      }
    }

    event.target.value = "";
    if (errors.length > 0) alert(errors.join("\n"));
  };

  const getFolderNoteCount = (folderId: string) => notes.filter(n => n.folderId === folderId).length;
  const unassignedCount = notes.filter(n => !n.folderId).length;

  // If the selected folder disappears (or becomes empty), fall back to All Notes.
  useEffect(() => {
    if (selectedFolderId === "unassigned" && unassignedCount === 0) {
      setSelectedFolderId(null);
    } else if (
      selectedFolderId &&
      selectedFolderId !== "unassigned" &&
      !folders.some(folder => folder.id === selectedFolderId)
    ) {
      setSelectedFolderId(null);
      setEditingFolderId(null);
    }
  }, [selectedFolderId, folders, unassignedCount]);

  // Close the "move to folder" popover when clicking anywhere else.
  useEffect(() => {
    if (!moveNoteId) return;
    const closePopover = () => setMoveNoteId(null);
    document.addEventListener("click", closePopover);
    return () => document.removeEventListener("click", closePopover);
  }, [moveNoteId]);

  return (
    <div className="flex-1 bg-[#121411] h-screen overflow-hidden flex flex-col" id="notes-chest-container">
      {/* Folder Top Bar */}
      <div className="bg-[#1a1c19] border-b border-[#434933]/30 px-6 py-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* All Notes Tab */}
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              selectedFolderId === null
                ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t.notes.allNotes}</span>
            <span className="text-[9px] text-white/40 font-mono ml-1">{notes.length}</span>
          </button>

          {/* Unassigned Tab */}
          {unassignedCount > 0 && (
            <button
              onClick={() => setSelectedFolderId("unassigned")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                selectedFolderId === "unassigned"
                  ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                  : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
              }`}
            >
              <Folder className="w-3.5 h-3.5 text-white/40" />
              <span>{t.notes.unassignedNotes}</span>
              <span className="text-[9px] text-white/40 font-mono ml-1">{unassignedCount}</span>
            </button>
          )}

          {/* Folder Tabs */}
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setSelectedFolderId(folder.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                selectedFolderId === folder.id
                  ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                  : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
              }`}
            >
              {selectedFolderId === folder.id ? (
                <FolderOpen className="w-3.5 h-3.5" />
              ) : (
                <Folder className="w-3.5 h-3.5" />
              )}
              <span>{folder.name}</span>
              <span className="text-[9px] text-white/40 font-mono ml-1">{getFolderNoteCount(folder.id)}</span>
            </button>
          ))}

          {/* Create Folder Button */}
          {showCreateFolder ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                placeholder={t.notes.enterFolderName}
                className="bg-[#222222] border border-white/10 rounded px-3 py-1.5 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] w-40"
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="p-1.5 bg-[#b8f600] rounded text-[#111111] hover:bg-[#a6d600] transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setShowCreateFolder(false); setNewFolderName(""); }}
                className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateFolder(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs text-white/40 hover:text-[#b8f600] hover:bg-[#222222] transition-colors"
              title={t.notes.createFolder}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.notes.createFolder}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-6xl p-8 overflow-y-auto scrollbar-modern flex flex-col">
        {/* Top action header bar */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#434933]/30 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-[#e3e3de] tracking-tight flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#b8f600]" />
                {editingFolderId && selectedFolderId && selectedFolderId !== "unassigned" && folders.find(f => f.id === selectedFolderId) ? (
                  <input
                    type="text"
                    value={editingFolderName}
                    onChange={(e) => setEditingFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRenameFolder();
                      if (e.key === "Escape") cancelRenameFolder();
                    }}
                    onBlur={saveRenameFolder}
                    className="bg-[#1a1c19] border border-[#b8f600]/30 rounded px-3 py-1 text-lg text-[#e3e3de] font-bold focus:outline-none w-48"
                    autoFocus
                  />
                ) : (
                  <span>{selectedFolderId === null 
                    ? t.notes.allNotes 
                    : selectedFolderId === "unassigned" 
                      ? t.notes.unassignedNotes
                      : folders.find(f => f.id === selectedFolderId)?.name || t.notes.allNotes
                  }</span>
                )}
              </h2>
              {/* Folder Actions - shown when a specific folder is selected */}
              {selectedFolderId && selectedFolderId !== "unassigned" && !editingFolderId && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const folder = folders.find(f => f.id === selectedFolderId);
                      if (folder) startRenameFolder(folder);
                    }}
                    className="p-1.5 rounded bg-[#1a1c19] text-white/40 hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-all"
                    title={t.notes.renameFolder}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(selectedFolderId)}
                    className="p-1.5 rounded bg-[#1a1c19] text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    title={t.notes.deleteFolder}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-[#c3caac]/75 mt-1">
              {t.notes.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenIma && (
              <button
                onClick={onOpenIma}
                className="flex items-center gap-2 px-3 py-2 rounded border border-[#b8f600]/25 bg-[#b8f600]/5 text-[#b8f600] text-xs font-bold hover:bg-[#b8f600]/10 transition-colors"
              >
                <Database className="w-4 h-4" />
                <span>{t.imaNotes.tab}</span>
              </button>
            )}
            <button
              onClick={() => {
                if (selectionMode) exitSelectionMode();
                else {
                  setSelectionMode(true);
                  setSelectedNoteIds(new Set());
                }
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-bold transition-colors ${
                selectionMode
                  ? "bg-[#b8f600]/10 border-[#b8f600]/30 text-[#b8f600]"
                  : "bg-[#222222] border-white/5 text-[#c3caac] hover:text-[#b8f600] hover:bg-[#2A2A2A]"
              }`}
            >
              <BookMarked className="w-4 h-4" />
              <span>{selectionMode ? t.notes.cancelSelection : t.notes.selectNotes}</span>
            </button>

            {/* New Note Button with Title Prompt */}
            <div className="relative order-last">
              <button
                onClick={() => {
                  setShowNewNotePrompt(!showNewNotePrompt);
                  setNewNoteTitle("");
                  setNewNoteContent("");
                  setShowNoteAI(false);
                  setSourceLink("");
                  setSourceImage(null);
                  setSourceInstruction("");
                  setAnalyzeError(null);
                  setShowMcpConfig(false);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded bg-[#b8f600] hover:bg-[#a6d600] text-[#111111] text-xs font-bold transition-colors"
              >
                <FilePlus className="w-4 h-4" />
                <span>{t.notes.createNote}</span>
              </button>

              <AnimatePresence>
                {showNewNotePrompt && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNewNotePrompt(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute right-0 top-full mt-2 bg-[#222222] border border-white/10 rounded-lg shadow-2xl p-4 z-50 w-96 max-h-[80vh] overflow-y-auto scrollbar-modern"
                      onPaste={handleScreenshotPaste}
                    >
                      <button
                        onClick={() => setShowNoteAI(prev => !prev)}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-[#c3caac] hover:text-[#b8f600] transition-colors mb-3"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {t.notes.aiSourceToggle}
                        <ChevronRight className={`w-3 h-3 transition-transform ${showNoteAI ? "rotate-90" : ""}`} />
                      </button>

                      {showNoteAI && (
                        <div className="space-y-2.5 mb-3 p-3 bg-[#1a1c19] border border-white/5 rounded">
                          <label className="block">
                            <span className="text-[9px] text-white/40 block mb-1">{t.notes.linkLabel}</span>
                            <div className="relative">
                              <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
                              <input
                                type="url"
                                value={sourceLink}
                                onChange={(event) => setSourceLink(event.target.value)}
                                placeholder={t.notes.linkPlaceholder}
                                className="w-full bg-[#121411] border border-white/10 rounded pl-8 pr-2 py-2 text-[10px] text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600]"
                              />
                            </div>
                          </label>

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={() => noteImageInputRef.current?.click()}
                                className="flex items-center gap-1 text-[10px] text-[#c3caac] hover:text-[#b8f600] transition-colors"
                              >
                                <ImagePlus className="w-3.5 h-3.5" />
                                {t.notes.uploadScreenshot}
                              </button>
                              <span className="text-[8px] text-white/25">{t.notes.screenshotHint}</span>
                            </div>
                            <input
                              ref={noteImageInputRef}
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) handleScreenshotFile(file);
                                event.target.value = "";
                              }}
                              className="hidden"
                            />
                            {sourceImage && (
                              <div className="relative mt-2 w-fit">
                                <img
                                  src={sourceImage.dataUrl}
                                  alt={sourceImage.name}
                                  className="max-h-24 rounded border border-white/10"
                                />
                                <button
                                  onClick={() => setSourceImage(null)}
                                  title={t.notes.removeImage}
                                  className="absolute -top-1.5 -right-1.5 bg-[#222222] border border-white/10 rounded-full p-0.5 text-white/50 hover:text-rose-400 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          <label className="block">
                            <span className="text-[9px] text-white/40 block mb-1">{t.notes.aiInstruction}</span>
                            <textarea
                              rows={2}
                              value={sourceInstruction}
                              onChange={(event) => setSourceInstruction(event.target.value)}
                              placeholder={t.notes.aiInstructionPlaceholder}
                              className="w-full bg-[#121411] border border-white/10 rounded px-2.5 py-2 text-[10px] text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] resize-none"
                            />
                          </label>

                          <button
                            onClick={() => void analyzeSource()}
                            disabled={analyzingSource || (!sourceLink.trim() && !sourceImage) || !onAnalyzeNoteSource}
                            className="w-full flex items-center justify-center gap-1.5 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors disabled:opacity-30"
                          >
                            {analyzingSource ? (
                              <>
                                <span className="w-3 h-3 border-2 border-[#141f00]/30 border-t-[#141f00] rounded-full animate-spin" />
                                {t.notes.analyzingSource}
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                {t.notes.analyzeSource}
                              </>
                            )}
                          </button>
                          {analyzeError && (
                            <p className="text-[9px] text-rose-400 whitespace-pre-line">{analyzeError}</p>
                          )}
                        </div>
                      )}

                      <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                        {t.notes.noteTitle}
                      </label>
                      <input
                        type="text"
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitNewNote();
                        }}
                        placeholder={t.notes.enterNoteTitle}
                        className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] mb-2"
                        autoFocus={!showNoteAI}
                      />
                      <textarea
                        rows={4}
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        placeholder={t.notes.enterNoteContent}
                        className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] mb-3 resize-none"
                      />

                      {/* MCP integration config */}
                      <div className="mb-3 pt-3 border-t border-white/5">
                        <button
                          onClick={() => setShowMcpConfig(prev => !prev)}
                          className="w-full flex items-center justify-between gap-2 text-[10px] text-[#c3caac] hover:text-[#b8f600] transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            <Server className="w-3 h-3" />
                            {t.notes.mcpTitle}
                          </span>
                          <ChevronRight className={`w-3 h-3 transition-transform ${showMcpConfig ? "rotate-90" : ""}`} />
                        </button>
                        {showMcpConfig && (
                          <div className="mt-2 space-y-2">
                            <p className="text-[9px] text-white/40 leading-relaxed">{t.notes.mcpDesc}</p>
                            <pre className="bg-[#121411] border border-white/10 rounded p-2 text-[8px] text-[#c3caac] whitespace-pre-wrap break-all max-h-32 overflow-y-auto scrollbar-modern">
{mcpConfig}
                            </pre>
                            <button
                              onClick={() => void copyMcpConfig()}
                              className="flex items-center gap-1 text-[9px] font-bold text-[#b8f600] hover:text-white transition-colors"
                            >
                              {mcpCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {mcpCopied ? t.notes.mcpCopied : t.notes.mcpCopy}
                            </button>
                            <div className="rounded border border-white/10 bg-[#1a1c19] p-2 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-bold text-[#c3caac]">{t.notes.mcpTokenLabel}</span>
                                <button
                                  onClick={() => void rotateMcpToken()}
                                  disabled={mcpTokenRotating}
                                  className="flex items-center gap-1 text-[9px] text-white/40 hover:text-[#b8f600] transition-colors disabled:opacity-40"
                                >
                                  <RefreshCw className={`w-2.5 h-2.5 ${mcpTokenRotating ? "animate-spin" : ""}`} />
                                  {t.notes.mcpTokenRotate}
                                </button>
                              </div>
                              {mcpTokenLoading ? (
                                <p className="text-[9px] text-white/30">{t.notes.mcpTokenLoading}</p>
                              ) : mcpToken ? (
                                <div className="flex items-center gap-1.5">
                                  <code className="flex-1 min-w-0 truncate font-mono text-[9px] text-[#e3e3de]">{mcpToken}</code>
                                  <button
                                    onClick={() => void copyMcpToken()}
                                    title={t.notes.mcpTokenLabel}
                                    className="p-1 rounded text-white/40 hover:text-[#b8f600] transition-colors"
                                  >
                                    {mcpTokenCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              ) : null}
                              <p className="text-[8px] text-white/30 leading-relaxed">{t.notes.mcpTokenHint}</p>
                            </div>
                            <p className="text-[9px] text-white/30 leading-relaxed">{t.notes.mcpTools}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setShowNewNotePrompt(false);
                            setNewNoteTitle("");
                            setNewNoteContent("");
                            setSourceLink("");
                            setSourceImage(null);
                            setSourceInstruction("");
                            setAnalyzeError(null);
                          }}
                          className="px-3 py-1.5 rounded text-xs text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          {t.notes.cancel}
                        </button>
                        <button
                          onClick={submitNewNote}
                          disabled={!newNoteTitle.trim()}
                          className="px-3 py-1.5 rounded bg-[#b8f600] text-[#111111] text-xs font-bold hover:bg-[#a6d600] transition-colors disabled:opacity-40"
                        >
                          ✓
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={exportToWord}
              disabled={(selectedFolderId === null && !searchTerm.trim() ? notes.length : filteredNotes.length) === 0}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#222222] hover:bg-[#2A2A2A] border border-white/5 text-xs text-[#e3e3de] hover:text-[#b8f600] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>{t.notes.exportWord}</span>
            </button>

            <button
              onClick={() => importNotesInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#222222] hover:bg-[#2A2A2A] border border-white/5 text-xs text-[#e3e3de] hover:text-[#b8f600] transition-colors"
            >
              <FileUp className="w-4 h-4" />
              <span>{t.notes.importNotes}</span>
            </button>
            <input
              ref={importNotesInputRef}
              type="file"
              multiple
              accept={LIBRARY_FILE_ACCEPT}
              onChange={handleImportNotes}
              className="hidden"
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder={t.notes.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#1a1c19] border border-white/5 rounded pl-10 pr-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] transition-colors"
          />
        </div>

        {selectionMode && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 mb-4 bg-[#1a1c19] border border-[#b8f600]/20 rounded">
            <span className="text-[11px] text-[#c3caac]">
              {t.notes.selectedCount.replace("{count}", String(selectedNoteIds.size))}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={openOrganizeDialog}
                disabled={selectedNoteIds.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors disabled:opacity-30"
              >
                <BookMarked className="w-3.5 h-3.5" />
                {t.notes.organizeIntoMaterial}
              </button>
              <button
                onClick={exitSelectionMode}
                className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white transition-colors"
              >
                {t.notes.cancelSelection}
              </button>
            </div>
          </div>
        )}

        {/* Notes Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-modern">
          {selectedFolderId === null && !searchTerm.trim() && folders.length > 0 && (
            <div className="mb-7">
              <div className="flex items-center gap-2 mb-3 text-[10px] font-mono text-white/40 uppercase tracking-wider">
                <Folder className="w-3.5 h-3.5" />
                {t.notes.folders}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {folders.map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className="bg-[#222222] border border-white/5 hover:border-[#b8f600]/30 hover:bg-[#2A2A2A] rounded-lg p-4 text-left transition-colors flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#b8f600]/10 flex items-center justify-center shrink-0">
                      <Folder className="w-4 h-4 text-[#b8f600]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-bold text-[#e3e3de] block truncate">{folder.name}</span>
                      <span className="text-[9px] text-white/30 font-mono">
                        {getFolderNoteCount(folder.id)} {t.review.noteCount}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
              <BookOpen className="w-12 h-12 text-white/10 mb-4" />
              <p className="text-sm text-white/40 font-mono">
                {selectedFolderId === null && folders.length > 0 && !searchTerm.trim()
                  ? t.notes.noUnfiledNotes
                  : t.notes.emptyTitle}
              </p>
              <p className="text-xs text-[#c3caac]/65 mt-1 max-w-xs leading-relaxed">{t.notes.emptyDesc}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {filteredNotes.map((note) => {
                  const noteFolder = folders.find(f => f.id === note.folderId);
                  const isHighlighted = jumpToNoteId === note.id;
                  const isSelected = selectedNoteIds.has(note.id);
                  return (
                    <motion.div
                      key={note.id}
                      ref={(el) => { noteCardRefs.current[note.id] = el; }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => {
                        if (selectionMode) toggleNoteSelection(note.id);
                        else if (editingId !== note.id) setReadingNoteId(note.id);
                      }}
                      title={selectionMode ? t.notes.selectNotes : editingId === note.id ? undefined : t.notes.openNote}
                      className={`bg-[#222222] border rounded-lg p-4 flex flex-col justify-between group hover:bg-[#2A2A2A] hover:border-[#b8f600]/30 hover:shadow-lg hover:shadow-black/20 transition-all duration-300 relative text-left cursor-pointer ${
                        isSelected
                          ? "border-[#b8f600] bg-[#b8f600]/5"
                          : isHighlighted
                            ? "border-[#b8f600] shadow-lg shadow-[#b8f600]/10"
                            : "border-white/5"
                      }`}
                    >
                      <div className="space-y-2.5 text-left">
                        <div className="flex items-center justify-between gap-2">
                          {selectionMode && (
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? "bg-[#b8f600] border-[#b8f600]" : "border-white/20"
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-[#141f00]" strokeWidth={3} />}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2.5 py-0.5 rounded font-bold min-w-0 truncate">
                            {highlightText(note.topic, searchTerm)}
                          </span>
                          {!selectionMode && (
                            <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-[#b8f600] group-hover:translate-x-0.5 transition-all shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/30 min-w-0">
                          {noteFolder && (
                            <>
                              <span className="inline-flex items-center gap-1 min-w-0 truncate">
                                <Folder className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{noteFolder.name}</span>
                              </span>
                              <span className="text-white/20 shrink-0">·</span>
                            </>
                          )}
                          <span className="shrink-0">{note.timestamp}</span>
                        </div>

                        <p className="text-xs text-[#e3e3de] leading-relaxed font-mono whitespace-pre-wrap line-clamp-3 min-h-[3.6rem]">
                          {highlightText(note.content, searchTerm)}
                        </p>
                      </div>

                      <div
                        onClick={(event) => event.stopPropagation()}
                        className={`flex justify-between items-center mt-5 pt-3 border-t border-white/5 opacity-85 group-hover:opacity-100 transition-opacity ${
                          selectionMode ? "hidden" : ""
                        }`}
                      >
                        {/* Move to Folder */}
                        <div className="relative">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setMoveNoteId(moveNoteId === note.id ? null : note.id);
                            }}
                            className="flex items-center gap-1 p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-[#b8f600] transition-colors cursor-pointer text-[10px]"
                          >
                            <Folder className="w-3.5 h-3.5" />
                            <span>{t.notes.moveNote}</span>
                          </button>
                          
                          <AnimatePresence>
                            {moveNoteId === note.id && (
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="absolute bottom-full left-0 mb-1 bg-[#1a1c19] border border-white/10 rounded shadow-lg z-10 min-w-[140px]"
                              >
                                <button
                                  onClick={() => { onMoveNoteToFolder(note.id, undefined); setMoveNoteId(null); }}
                                  className={`w-full text-left px-3 py-2 text-[10px] hover:bg-[#222222] transition-colors ${!note.folderId ? "text-[#b8f600]" : "text-[#c3caac]"}`}
                                >
                                  {t.notes.unassignedNotes}
                                </button>
                                {folders.map(folder => (
                                  <button
                                    key={folder.id}
                                    onClick={() => { onMoveNoteToFolder(note.id, folder.id); setMoveNoteId(null); }}
                                    className={`w-full text-left px-3 py-2 text-[10px] hover:bg-[#222222] transition-colors ${note.folderId === folder.id ? "text-[#b8f600]" : "text-[#c3caac]"}`}
                                  >
                                    {folder.name}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2.5">
                          <button
                            onClick={() => startEdit(note)}
                            className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-[#b8f600] transition-colors cursor-pointer"
                            title={t.notes.edit}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(t.notes.confirmDeleteNote)) onDelete(note.id);
                            }}
                            className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-rose-400 transition-colors cursor-pointer"
                            title={t.notes.delete}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Organize selected notes into a library package */}
      <AnimatePresence>
        {showOrganize && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center p-4"
            onClick={() => { if (!organizing) setShowOrganize(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-lg bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-[#b8f600]" />
                  <h3 className="text-sm font-bold text-[#e3e3de]">{t.notes.organizeTitle}</h3>
                </div>
                <button
                  onClick={() => setShowOrganize(false)}
                  disabled={organizing}
                  className="text-white/40 hover:text-white p-1 rounded transition-colors disabled:opacity-30"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <label className="block">
                  <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider block mb-1.5">
                    {t.notes.organizeName}
                  </span>
                  <input
                    type="text"
                    value={organizeName}
                    onChange={(event) => setOrganizeName(event.target.value)}
                    placeholder={t.notes.enterOrganizeName}
                    className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] transition-colors"
                    autoFocus
                  />
                </label>

                <div>
                  <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider block mb-1.5">
                    {t.notes.organizeMode}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setOrganizeMode("raw")}
                      className={`text-left p-3 rounded border transition-colors ${
                        organizeMode === "raw"
                          ? "border-[#b8f600]/50 bg-[#b8f600]/5"
                          : "border-white/10 bg-[#1a1c19] hover:border-white/20"
                      }`}
                    >
                      <BookMarked className={`w-4 h-4 mb-2 ${organizeMode === "raw" ? "text-[#b8f600]" : "text-[#c3caac]"}`} />
                      <span className="text-[11px] font-bold text-[#e3e3de] block">{t.notes.keepOriginal}</span>
                      <span className="text-[9px] text-white/35 leading-relaxed block mt-1">{t.notes.keepOriginalDesc}</span>
                    </button>
                    <button
                      onClick={() => setOrganizeMode("ai")}
                      className={`text-left p-3 rounded border transition-colors ${
                        organizeMode === "ai"
                          ? "border-[#b8f600]/50 bg-[#b8f600]/5"
                          : "border-white/10 bg-[#1a1c19] hover:border-white/20"
                      }`}
                    >
                      <Sparkles className={`w-4 h-4 mb-2 ${organizeMode === "ai" ? "text-[#b8f600]" : "text-[#c3caac]"}`} />
                      <span className="text-[11px] font-bold text-[#e3e3de] block">{t.notes.aiOrganize}</span>
                      <span className="text-[9px] text-white/35 leading-relaxed block mt-1">{t.notes.aiOrganizeDesc}</span>
                    </button>
                  </div>
                </div>

                {organizeError && (
                  <p className="text-[10px] text-rose-400">{organizeError}</p>
                )}
              </div>

              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono text-white/30">
                  {t.notes.selectedCount.replace("{count}", String(selectedNoteIds.size))}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowOrganize(false)}
                    disabled={organizing}
                    className="px-3 py-1.5 text-[11px] text-[#c3caac] hover:text-white transition-colors disabled:opacity-30"
                  >
                    {t.notes.cancel}
                  </button>
                  <button
                    onClick={() => void submitOrganize()}
                    disabled={organizing || !onOrganizeNotes}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold rounded transition-colors disabled:opacity-30"
                  >
                    {organizing ? (
                      <>
                        <span className="w-3 h-3 border-2 border-[#141f00]/30 border-t-[#141f00] rounded-full animate-spin" />
                        {t.notes.organizing}
                      </>
                    ) : (
                      <>
                        <BookMarked className="w-3.5 h-3.5" />
                        {t.notes.createMaterial}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full note reader */}
      <AnimatePresence>
        {readingNote && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setReadingNoteId(null)}
            id="note-reader-overlay"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-3xl max-h-[85vh] bg-[#222222] border border-white/10 rounded shadow-2xl flex flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-[#434933]/30 flex items-start justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2.5 py-0.5 rounded font-bold">
                      {readingNote.topic}
                    </span>
                    {readingNoteFolder && (
                      <span className="inline-flex items-center gap-1 text-[9px] text-[#c3caac] bg-[#1a1c19] border border-white/5 px-2 py-0.5 rounded">
                        <Folder className="w-3 h-3" />
                        {readingNoteFolder.name}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/30 font-mono mt-1.5 block">
                    {readingNote.timestamp}
                  </span>
                </div>
                <button
                  onClick={() => setReadingNoteId(null)}
                  title={t.notes.close}
                  className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-modern">
                {readingNote.content.trim() ? (
                  <p className="text-sm text-[#e3e3de] leading-relaxed font-mono whitespace-pre-wrap">
                    {highlightText(readingNote.content, searchTerm)}
                  </p>
                ) : (
                  <p className="text-xs text-white/30 font-mono">{t.notes.emptyContent}</p>
                )}
              </div>

              <div className="px-6 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2 shrink-0">
                <button
                  onClick={() => editFromReader(readingNote)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#b8f600]/30 text-[#b8f600] hover:bg-[#b8f600]/10 text-[11px] font-bold transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  {t.notes.edit}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t.notes.confirmDeleteNote)) {
                      onDelete(readingNote.id);
                      setReadingNoteId(null);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[11px] font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.notes.delete}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-size note editor */}
      <AnimatePresence>
        {editingId && (() => {
          const editingNote = notes.find(note => note.id === editingId);
          if (!editingNote) return null;
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[75] modal-backdrop flex items-center justify-center p-4"
              onClick={cancelEdit}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 8 }}
                className="w-full max-w-3xl max-h-[88vh] bg-[#222222] border border-white/10 rounded shadow-2xl flex flex-col overflow-hidden"
                onClick={(event) => event.stopPropagation()}
                id="note-editor-modal"
              >
                <div className="px-6 py-4 border-b border-[#434933]/30 flex items-center justify-between gap-3 shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-[#e3e3de] flex items-center gap-2">
                      <Edit2 className="w-4 h-4 text-[#b8f600]" />
                      {t.notes.edit}
                    </h3>
                    <p className="text-[10px] text-white/30 mt-0.5">{editingNote.timestamp}</p>
                  </div>
                  <button
                    onClick={cancelEdit}
                    className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-modern">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1.5">
                      {t.notes.noteTitle}
                    </span>
                    <input
                      type="text"
                      value={editTopic}
                      onChange={(event) => setEditTopic(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelEdit();
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          saveEdit(editingNote);
                        }
                      }}
                      placeholder={t.notes.enterNoteTitle}
                      className="w-full bg-[#1a1c19] border border-white/10 rounded px-4 py-2.5 text-sm text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] transition-colors"
                      autoFocus
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1.5">
                      {t.notes.noteContent}
                    </span>
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelEdit();
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          saveEdit(editingNote);
                        }
                      }}
                      placeholder={t.notes.enterNoteContent}
                      className="w-full min-h-[42vh] bg-[#1a1c19] border border-white/10 rounded px-4 py-3 text-sm text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] transition-colors leading-relaxed resize-y"
                    />
                  </label>
                </div>

                <div className="px-6 py-3 border-t border-[#434933]/30 flex items-center justify-between gap-3 shrink-0">
                  <span className="text-[9px] text-white/25 font-mono">Ctrl / ⌘ + Enter</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1.5 text-[11px] text-[#c3caac] hover:text-white transition-colors"
                    >
                      {t.notes.cancel}
                    </button>
                    <button
                      onClick={() => saveEdit(editingNote)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t.notes.save}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
