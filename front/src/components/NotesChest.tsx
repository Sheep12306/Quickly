import React, { useState, useEffect, useRef } from "react";
import { NoteItem, NoteFolder } from "../types";
import { BookOpen, Search, Download, Trash2, Edit2, Check, Folder, FolderOpen, Plus, X, FilePlus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useI18n } from "../i18n";

interface NotesChestProps {
  notes: NoteItem[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updatedContent: string) => void;
  folders: NoteFolder[];
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveNoteToFolder: (noteId: string, folderId: string | undefined) => void;
  onCreateNote?: (topic: string, content: string, folderId?: string) => void;
  jumpToNoteId?: string | null;
  onClose?: () => void;
}

export default function NotesChest({ 
  notes, onDelete, onUpdate, 
  folders, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveNoteToFolder,
  onCreateNote,
  jumpToNoteId,
  onClose 
}: NotesChestProps) {
  const { t, locale } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const noteCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to jumped-to note
  useEffect(() => {
    if (jumpToNoteId && noteCardRefs.current[jumpToNoteId]) {
      // Find the folder this note belongs to and select it
      const note = notes.find(n => n.id === jumpToNoteId);
      if (note?.folderId) {
        setSelectedFolderId(note.folderId);
      } else if (!note?.folderId) {
        setSelectedFolderId(null);
      }
      // Scroll to the note after a short delay for rendering
      setTimeout(() => {
        noteCardRefs.current[jumpToNoteId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [jumpToNoteId, notes]);

  // Filter notes based on selected folder
  const filteredNotes = notes.filter((n) => {
    const matchesSearch = n.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedFolderId === null) {
      return matchesSearch;
    } else if (selectedFolderId === "unassigned") {
      return matchesSearch && !n.folderId;
    } else {
      return matchesSearch && n.folderId === selectedFolderId;
    }
  });

  const startEdit = (note: NoteItem) => {
    setEditingId(note.id);
    setEditText(note.content);
  };

  const saveEdit = (id: string) => {
    onUpdate(id, editText);
    setEditingId(null);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setShowCreateFolder(false);
    }
  };

  const startRenameFolder = (folder: NoteFolder) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  };

  const saveRenameFolder = () => {
    if (editingFolderId && editingFolderName.trim()) {
      onRenameFolder(editingFolderId, editingFolderName.trim());
    }
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

  const exportToMarkdown = () => {
    const notesToExport = selectedFolderId === null 
      ? notes 
      : selectedFolderId === "unassigned"
        ? notes.filter(n => !n.folderId)
        : notes.filter(n => n.folderId === selectedFolderId);
        
    const mdContent = notesToExport
      .map((n) => `## ${n.topic} (${n.timestamp})\n\n${n.content}\n\n---\n`)
      .join("\n");
      
    const blob = new Blob([mdContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Quickly_AI_Notes_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFolderNoteCount = (folderId: string) => notes.filter(n => n.folderId === folderId).length;
  const unassignedCount = notes.filter(n => !n.folderId).length;

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
            <div key={folder.id} className="relative group">
              {editingFolderId === folder.id ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editingFolderName}
                    onChange={(e) => setEditingFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRenameFolder();
                      if (e.key === "Escape") setEditingFolderId(null);
                    }}
                    onBlur={saveRenameFolder}
                    className="bg-[#222222] border border-[#b8f600]/30 rounded px-2 py-1 text-xs text-[#e3e3de] focus:outline-none w-24"
                    autoFocus
                  />
                </div>
              ) : (
                <button
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
              )}
            </div>
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
      <div className="flex-1 p-8 overflow-y-auto flex flex-col">
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
                      if (e.key === "Escape") setEditingFolderId(null);
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
            {/* New Note Button with Title Prompt */}
            <div className="relative">
              <button
                onClick={() => { setShowNewNotePrompt(!showNewNotePrompt); setNewNoteTitle(""); }}
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
                      className="absolute right-0 top-full mt-2 bg-[#222222] border border-white/10 rounded-lg shadow-2xl p-4 z-50 w-72"
                    >
                      <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider block mb-2">
                        {t.notes.noteTitle}
                      </label>
                      <input
                        type="text"
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newNoteTitle.trim()) {
                            const folderId = selectedFolderId && selectedFolderId !== "unassigned" ? selectedFolderId : undefined;
                            onCreateNote?.(newNoteTitle.trim(), "", folderId);
                            setShowNewNotePrompt(false);
                            setNewNoteTitle("");
                          }
                        }}
                        placeholder={t.notes.enterNoteTitle}
                        className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] mb-3"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setShowNewNotePrompt(false); setNewNoteTitle(""); }}
                          className="px-3 py-1.5 rounded text-xs text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          {locale === "en-US" ? "Cancel" : "取消"}
                        </button>
                        <button
                          onClick={() => {
                            if (newNoteTitle.trim()) {
                              const folderId = selectedFolderId && selectedFolderId !== "unassigned" ? selectedFolderId : undefined;
                              onCreateNote?.(newNoteTitle.trim(), "", folderId);
                              setShowNewNotePrompt(false);
                              setNewNoteTitle("");
                            }
                          }}
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
              onClick={exportToMarkdown}
              disabled={filteredNotes.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#222222] hover:bg-[#2A2A2A] border border-white/5 text-xs text-[#e3e3de] hover:text-[#b8f600] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>{t.notes.exportMarkdown}</span>
            </button>
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

        {/* Notes Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
              <BookOpen className="w-12 h-12 text-white/10 mb-4" />
              <p className="text-sm text-white/40 font-mono">{t.notes.emptyTitle}</p>
              <p className="text-xs text-[#c3caac]/65 mt-1 max-w-xs leading-relaxed">{t.notes.emptyDesc}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {filteredNotes.map((note) => {
                  const noteFolder = folders.find(f => f.id === note.folderId);
                  const isHighlighted = jumpToNoteId === note.id;
                  return (
                    <motion.div
                      key={note.id}
                      ref={(el) => { noteCardRefs.current[note.id] = el; }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`bg-[#222222] border rounded p-5 flex flex-col justify-between group hover:border-[#b8f600]/20 transition-all duration-300 relative text-left ${
                        isHighlighted ? "border-[#b8f600] shadow-lg shadow-[#b8f600]/10" : "border-white/5"
                      }`}
                    >
                      <div className="space-y-3.5 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2.5 py-0.5 rounded font-bold">
                            {note.topic}
                          </span>
                          <span className="text-[10px] text-white/30 font-mono">{note.timestamp}</span>
                        </div>

                        {/* Folder Badge */}
                        {noteFolder && (
                          <span className="inline-flex items-center gap-1 text-[9px] text-[#c3caac] bg-[#1a1c19] border border-white/5 px-2 py-0.5 rounded">
                            <Folder className="w-3 h-3" />
                            {noteFolder.name}
                          </span>
                        )}

                        {editingId === note.id ? (
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full bg-[#111111] border border-[#b8f600]/30 rounded p-2.5 text-xs text-[#e3e3de] focus:outline-none min-h-[5.5rem]"
                            rows={4}
                          />
                        ) : (
                          <p className="text-xs text-[#e3e3de] leading-relaxed font-mono whitespace-pre-wrap">
                            {note.content}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-between items-center mt-5 pt-3 border-t border-white/5 opacity-85 group-hover:opacity-100 transition-opacity">
                        {/* Move to Folder */}
                        <div className="relative">
                          <button
                            onClick={() => setMoveNoteId(moveNoteId === note.id ? null : note.id)}
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
                          {editingId === note.id ? (
                            <button
                              onClick={() => saveEdit(note.id)}
                              className="p-1 px-2.5 gap-1 rounded bg-[#b8f600] text-[#111111] text-[10px] font-bold flex items-center transition-colors hover:bg-[#a6d600]"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{t.notes.save}</span>
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(note)}
                                className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-[#b8f600] transition-colors cursor-pointer"
                                title={t.notes.edit}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDelete(note.id)}
                                className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-rose-400 transition-colors cursor-pointer"
                                title={t.notes.delete}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
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
    </div>
  );
}
