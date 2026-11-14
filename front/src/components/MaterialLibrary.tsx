import React, { useEffect, useRef, useState } from "react";
import {
  BookMarked,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
  ClipboardPaste,
  X,
  Folder,
  FolderOpen,
  Edit2,
  Check,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { LibraryFolder, MaterialFile, MaterialPackage } from "../types";
import { useI18n } from "../i18n";
import {
  MAX_LIBRARY_FILE_BYTES,
  LIBRARY_FILE_ACCEPT,
  isSupportedMaterialFile,
  extractMaterialFile,
  type ExtractedMaterialFile,
} from "../utils/extractMaterial";

interface MaterialLibraryProps {
  folders: LibraryFolder[];
  packages: MaterialPackage[];
  files: MaterialFile[];
  openFileId?: string | null;
  onOpenFileHandled?: () => void;
  onCreatePackage: (
    name: string,
    files: Array<{ name: string; content: string; format: string }>,
    folderId?: string,
  ) => void | Promise<unknown>;
  onAddFiles: (
    packageId: string,
    files: Array<{ name: string; content: string; format: string }>,
  ) => void | Promise<void>;
  onDeletePackage: (id: string) => void | Promise<void>;
  onDeleteFile: (id: string) => void | Promise<void>;
  onCreateFolder: (name: string) => void | Promise<void>;
  onRenameFolder: (folderId: string, name: string) => void | Promise<void>;
  onDeleteFolder: (folderId: string) => void | Promise<void>;
  legacy?: boolean;
  onOpenIma?: () => void;
}

export default function MaterialLibrary({
  folders,
  packages,
  files,
  openFileId,
  onOpenFileHandled,
  onCreatePackage,
  onAddFiles,
  onDeletePackage,
  onDeleteFile,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  legacy = false,
  onOpenIma,
}: MaterialLibraryProps) {
  const { t, locale } = useI18n();
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const packageFileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addFolderId, setAddFolderId] = useState("");
  const [addMode, setAddMode] = useState<"file" | "paste">("file");
  const [stagedFiles, setStagedFiles] = useState<ExtractedMaterialFile[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [openPackageId, setOpenPackageId] = useState<string | null>(null);
  const [readingFileId, setReadingFileId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractingStatus, setExtractingStatus] = useState("");
  const [creating, setCreating] = useState(false);

  const query = searchTerm.trim().toLowerCase();

  const selectedRealFolder = selectedFolderId && selectedFolderId !== "unassigned"
    ? folders.find(folder => folder.id === selectedFolderId) || null
    : null;

  const folderPackageCount = (folderId: string) =>
    packages.filter(pkg => pkg.folderId === folderId).length;
  const unassignedCount = packages.filter(pkg => !pkg.folderId).length;

  const packagesWithFiles = packages.map(pkg => ({
    pkg,
    files: files.filter(file => file.packageId === pkg.id),
  }));

  const filteredPackages = packagesWithFiles.filter(({ pkg, files: pkgFiles }) => {
    if (selectedFolderId === "unassigned") {
      if (pkg.folderId) return false;
    } else if (selectedFolderId) {
      if (pkg.folderId !== selectedFolderId) return false;
    }

    if (!query) return true;
    if (pkg.name.toLowerCase().includes(query)) return true;
    return pkgFiles.some(file => (
      file.name.toLowerCase().includes(query) || file.content.toLowerCase().includes(query)
    ));
  });

  const openPackage = openPackageId
    ? packages.find(pkg => pkg.id === openPackageId) || null
    : null;
  const openPackageFiles = openPackage
    ? files.filter(file => file.packageId === openPackage.id)
    : [];
  const readingFile = readingFileId
    ? files.find(file => file.id === readingFileId) || null
    : null;
  const readingPackage = readingFile
    ? packages.find(pkg => pkg.id === readingFile.packageId) || null
    : null;

  // Open a file requested from the Study chat source citation.
  useEffect(() => {
    if (!openFileId) return;
    const file = files.find(item => item.id === openFileId);
    if (file) {
      setOpenPackageId(file.packageId);
      setReadingFileId(file.id);
    }
    onOpenFileHandled?.();
  }, [openFileId, files, onOpenFileHandled]);

  useEffect(() => {
    if (openPackageId && !packages.some(pkg => pkg.id === openPackageId)) {
      setOpenPackageId(null);
      setReadingFileId(null);
    }
  }, [openPackageId, packages]);

  useEffect(() => {
    if (readingFileId && !files.some(file => file.id === readingFileId)) {
      setReadingFileId(null);
    }
  }, [readingFileId, files]);

  useEffect(() => {
    if (selectedFolderId === "unassigned" && unassignedCount === 0) {
      setSelectedFolderId(null);
    } else if (
      selectedFolderId &&
      selectedFolderId !== "unassigned" &&
      !folders.some(folder => folder.id === selectedFolderId)
    ) {
      setSelectedFolderId(null);
    }
  }, [selectedFolderId, folders, unassignedCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (readingFileId) setReadingFileId(null);
      else if (openPackageId) setOpenPackageId(null);
      else if (showAdd) resetAddPanel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(
    locale === "en-US" ? "en-US" : "zh-CN",
    { month: "short", day: "numeric", year: "numeric" },
  );

  const totalChars = (pkgFiles: MaterialFile[]) =>
    pkgFiles.reduce((sum, file) => sum + file.content.replace(/\s/g, "").length, 0);

  const formatLabel = (format: string) => format.toUpperCase();

  const extractFiles = async (fileList: FileList | File[]) => {
    const list = Array.from(fileList);
    const extracted: ExtractedMaterialFile[] = [];
    const errors: string[] = [];

    setExtracting(true);
    setError(null);
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      setExtractingStatus(`${index + 1}/${list.length}`);
      if (!isSupportedMaterialFile(file)) {
        errors.push(`${file.name}: ${t.library.unsupportedFormat}`);
        continue;
      }
      if (file.size > MAX_LIBRARY_FILE_BYTES) {
        errors.push(`${file.name}: ${t.library.fileTooLarge}`);
        continue;
      }
      try {
        const result = await extractMaterialFile(file);
        if (result.content.trim()) extracted.push(result);
        else errors.push(`${file.name}: ${t.library.emptyFile}`);
      } catch (extractionError) {
        console.error("Failed to extract material", file.name, extractionError);
        errors.push(`${file.name}: ${t.library.extractFailed}`);
      }
    }
    setExtracting(false);
    setExtractingStatus("");
    return { extracted, errors };
  };

  const handleAddFileSelection = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const { extracted, errors } = await extractFiles(fileList);
    if (extracted.length > 0) {
      setStagedFiles(prev => [...prev, ...extracted]);
    }
    if (errors.length > 0) setError(errors.join("\n"));
  };

  const stagePastedText = () => {
    const text = pastedText.trim();
    if (!text) {
      setError(t.library.emptyFile);
      return;
    }
    const firstLine = text.split("\n").map(line => line.trim()).find(Boolean) || "";
    setStagedFiles(prev => [...prev, {
      name: `${firstLine.slice(0, 40) || t.library.pastedName}.txt`,
      content: text,
      format: "txt",
    }]);
    setPastedText("");
    setError(null);
  };

  const resetAddPanel = () => {
    setShowAdd(false);
    setAddName("");
    setAddFolderId("");
    setAddMode("file");
    setStagedFiles([]);
    setPastedText("");
    setDragOver(false);
    setError(null);
    setExtractingStatus("");
  };

  const openAddPanel = () => {
    setShowAdd(true);
    setAddName("");
    setAddFolderId(selectedRealFolder?.id || "");
    setAddMode("file");
    setStagedFiles([]);
    setPastedText("");
    setError(null);
  };

  const createPackage = async () => {
    if (stagedFiles.length === 0) {
      setError(t.library.noFiles);
      return;
    }
    const fallbackName = stagedFiles[0].name.replace(/\.[^.]+$/, "") || t.library.pastedName;
    setCreating(true);
    setError(null);
    try {
      await onCreatePackage(addName.trim() || fallbackName, stagedFiles, addFolderId || undefined);
      resetAddPanel();
    } catch (createError) {
      console.error("Failed to create material package", createError);
      setError(t.library.saveFailed);
    } finally {
      setCreating(false);
    }
  };

  const handleAddFilesToPackage = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !openPackage) return;
    const { extracted, errors } = await extractFiles(fileList);
    if (extracted.length > 0) {
      await onAddFiles(openPackage.id, extracted);
    }
    if (errors.length > 0) setError(errors.join("\n"));
  };

  const handleDeletePackage = async (pkg: MaterialPackage) => {
    if (!confirm(t.library.confirmDeletePackage)) return;
    await onDeletePackage(pkg.id);
    if (openPackageId === pkg.id) {
      setOpenPackageId(null);
      setReadingFileId(null);
    }
  };

  const handleDeleteFile = async (file: MaterialFile) => {
    if (!confirm(t.library.confirmDeleteFile)) return;
    await onDeleteFile(file.id);
    if (readingFileId === file.id) setReadingFileId(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName.trim());
    setNewFolderName("");
    setShowCreateFolder(false);
  };

  const saveFolderRename = async () => {
    if (editingFolderId && editingFolderName.trim()) {
      await onRenameFolder(editingFolderId, editingFolderName.trim());
    }
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm(t.library.confirmDeleteFolder)) return;
    await onDeleteFolder(folderId);
    setSelectedFolderId(null);
    setEditingFolderId(null);
  };

  return (
    <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto scrollbar-modern" id="material-library-pane">
      <div className="w-full max-w-6xl space-y-5 text-left">
        {/* Heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-[#e3e3de] flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-[#b8f600]" />
              {legacy ? t.library.imaLocalLegacy : t.library.title}
            </h2>
            <p className="text-xs text-[#c3caac]/70 mt-1">
              {legacy ? t.library.imaLocalLegacyHint : t.library.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onOpenIma && (
              <button
                onClick={onOpenIma}
                className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-[#e3e3de] hover:border-white/20 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                {t.library.imaBackToIma}
              </button>
            )}
            {!legacy && (
              <button
                onClick={openAddPanel}
                className="flex items-center gap-2 px-4 py-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                {t.library.addPackage}
              </button>
            )}
          </div>
        </div>

        {/* Folder bar */}
        <div className="bg-[#1a1c19] border border-white/5 rounded px-4 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                selectedFolderId === null
                  ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                  : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" />
              <span>{t.library.allPackages}</span>
              <span className="text-[9px] text-white/40 font-mono ml-1">{packages.length}</span>
            </button>

            {unassignedCount > 0 && (
              <button
                onClick={() => setSelectedFolderId("unassigned")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  selectedFolderId === "unassigned"
                    ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                    : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>{t.library.unassignedPackages}</span>
                <span className="text-[9px] text-white/40 font-mono ml-1">{unassignedCount}</span>
              </button>
            )}

            {folders.map(folder => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  selectedFolderId === folder.id
                    ? "bg-[#b8f600]/10 text-[#b8f600] border border-[#b8f600]/30"
                    : "text-[#c3caac] hover:bg-[#222222] hover:text-[#e3e3de]"
                }`}
              >
                {selectedFolderId === folder.id
                  ? <FolderOpen className="w-3.5 h-3.5" />
                  : <Folder className="w-3.5 h-3.5" />}
                <span>{folder.name}</span>
                <span className="text-[9px] text-white/40 font-mono ml-1">{folderPackageCount(folder.id)}</span>
              </button>
            ))}

            {selectedRealFolder && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={() => {
                    setEditingFolderId(selectedRealFolder.id);
                    setEditingFolderName(selectedRealFolder.name);
                  }}
                  title={t.library.renameFolder}
                  className="p-1 rounded text-white/30 hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => void handleDeleteFolder(selectedRealFolder.id)}
                  title={t.library.deleteFolder}
                  className="p-1 rounded text-white/30 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}

            {showCreateFolder ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleCreateFolder();
                    if (event.key === "Escape") {
                      setShowCreateFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  placeholder={t.library.enterFolderName}
                  className="bg-[#222222] border border-white/10 rounded px-3 py-1.5 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] w-36"
                  autoFocus
                />
                <button
                  onClick={() => void handleCreateFolder()}
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
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.library.createFolder}</span>
              </button>
            )}
          </div>

          {editingFolderId && (
            <div className="flex items-center gap-1.5 mt-2">
              <input
                type="text"
                value={editingFolderName}
                onChange={(event) => setEditingFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveFolderRename();
                  if (event.key === "Escape") {
                    setEditingFolderId(null);
                    setEditingFolderName("");
                  }
                }}
                className="bg-[#222222] border border-[#b8f600]/30 rounded px-3 py-1.5 text-xs text-[#e3e3de] focus:outline-none w-48"
                autoFocus
              />
              <button
                onClick={() => void saveFolderRename()}
                className="p-1.5 bg-[#b8f600] rounded text-[#111111] hover:bg-[#a6d600] transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setEditingFolderId(null); setEditingFolderName(""); }}
                className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t.library.searchPlaceholder}
            className="w-full bg-[#1a1c19] border border-white/5 rounded pl-10 pr-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] transition-colors"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-white/30">
          <span>{t.library.materialsCount.replace("{count}", String(packages.length))}</span>
          <span>{t.library.autoSaveHint}</span>
        </div>

        {/* Package cards */}
        {packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
            <BookMarked className="w-12 h-12 text-white/10 mb-4" />
            <p className="text-sm text-white/40 font-mono">{t.library.emptyTitle}</p>
            <p className="text-xs text-[#c3caac]/65 mt-1 max-w-sm leading-relaxed">{t.library.emptyDesc}</p>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="py-16 text-center">
            <Search className="w-8 h-8 text-white/10 mx-auto mb-2" />
            <p className="text-xs text-white/40">{t.library.noResults}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredPackages.map(({ pkg, files: pkgFiles }) => {
              const folder = folders.find(item => item.id === pkg.folderId);
              return (
                <motion.div
                  key={pkg.id}
                  layout
                  onClick={() => {
                    setError(null);
                    setOpenPackageId(pkg.id);
                  }}
                  title={t.library.openPackage}
                  className="group bg-[#222222] border border-white/5 hover:border-[#b8f600]/30 hover:bg-[#2A2A2A] rounded-lg p-4 cursor-pointer transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <BookMarked className="w-3.5 h-3.5 text-[#b8f600] shrink-0" />
                        <span className="text-[11px] font-bold text-[#e3e3de] truncate">{pkg.name}</span>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeletePackage(pkg);
                        }}
                        title={t.library.deletePackage}
                        className="p-1 -m-1 rounded text-white/20 hover:text-rose-400 hover:bg-rose-400/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/30 mt-1.5">
                      {folder && (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <Folder className="w-2.5 h-2.5" />
                            {folder.name}
                          </span>
                          <span>·</span>
                        </>
                      )}
                      <span>{t.library.fileCount.replace("{count}", String(pkgFiles.length))}</span>
                    </div>

                    <div className="mt-3 space-y-1.5 min-h-[3.2rem]">
                      {pkgFiles.slice(0, 3).map(file => (
                        <div key={file.id} className="flex items-center gap-1.5 text-[10px] text-[#c3caac]/80 font-mono min-w-0">
                          <FileText className="w-2.5 h-2.5 text-white/30 shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </div>
                      ))}
                      {pkgFiles.length > 3 && (
                        <span className="text-[9px] text-white/25 font-mono block">
                          +{pkgFiles.length - 3}
                        </span>
                      )}
                      {pkgFiles.length === 0 && (
                        <span className="text-[10px] text-white/25 font-mono">{t.library.noFiles}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-mono text-white/25 mt-3 pt-2.5 border-t border-white/5">
                    <span>{totalChars(pkgFiles)} {t.library.chars}</span>
                    <span>{formatDate(pkg.updatedAt)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add package modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center p-4"
            onClick={() => { if (!extracting && !creating) resetAddPanel(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-lg max-h-[88vh] bg-[#222222] border border-white/10 rounded shadow-2xl flex flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between gap-3 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-[#e3e3de]">{t.library.addPackage}</h3>
                  <p className="text-[10px] text-[#c3caac]/60 mt-0.5">{t.library.supportedFormats}</p>
                </div>
                <button
                  onClick={() => { if (!extracting && !creating) resetAddPanel(); }}
                  className="text-white/40 hover:text-white p-1 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3 overflow-y-auto scrollbar-modern flex-1">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] text-[#c3caac] block mb-1">{t.library.packageName}</span>
                    <input
                      type="text"
                      value={addName}
                      onChange={(event) => setAddName(event.target.value)}
                      placeholder={t.library.enterPackageName}
                      className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-[#c3caac] block mb-1">{t.library.packageFolder}</span>
                    <select
                      value={addFolderId}
                      onChange={(event) => setAddFolderId(event.target.value)}
                      className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    >
                      <option value="">{t.library.noFolder}</option>
                      {folders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex bg-[#1a1c19] border border-white/5 rounded p-0.5 w-fit">
                  <button
                    onClick={() => setAddMode("file")}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${
                      addMode === "file" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
                    }`}
                  >
                    {t.library.chooseFiles}
                  </button>
                  <button
                    onClick={() => setAddMode("paste")}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${
                      addMode === "paste" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
                    }`}
                  >
                    {t.materialReview.pasteTab}
                  </button>
                </div>

                {addMode === "file" ? (
                  <div
                    onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragOver(false);
                      void handleAddFileSelection(event.dataTransfer.files);
                    }}
                    onClick={() => addFileInputRef.current?.click()}
                    className={`border border-dashed rounded-lg py-8 px-5 text-center cursor-pointer transition-colors ${
                      dragOver
                        ? "border-[#b8f600] bg-[#b8f600]/5"
                        : "border-white/10 bg-[#1a1c19]/60 hover:border-[#b8f600]/40 hover:bg-[#1a1c19]"
                    }`}
                  >
                    <div className="w-11 h-11 rounded-full bg-[#b8f600]/10 border border-[#b8f600]/20 flex items-center justify-center mx-auto mb-3">
                      <Upload className="w-5 h-5 text-[#b8f600]" />
                    </div>
                    <p className="text-xs font-medium text-[#e3e3de]">{t.library.dragFilesHint}</p>
                    <p className="text-[10px] text-white/40 mt-1.5 font-mono">PDF · DOCX · TXT · MD · CSV</p>
                    <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-[#b8f600]/10 border border-[#b8f600]/20 text-[#b8f600] text-[10px] font-bold rounded">
                      <Plus className="w-3 h-3" />
                      {t.library.chooseFiles}
                    </span>
                  </div>
                ) : (
                  <div>
                    <textarea
                      rows={5}
                      value={pastedText}
                      onChange={(event) => setPastedText(event.target.value)}
                      placeholder={t.materialReview.pastePlaceholder}
                      className="w-full bg-[#1a1c19] border border-white/10 rounded px-4 py-3 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] transition-colors resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={stagePastedText}
                        disabled={!pastedText.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors disabled:opacity-30"
                      >
                        <ClipboardPaste className="w-3 h-3" />
                        {t.materialReview.usePastedText}
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={addFileInputRef}
                  type="file"
                  multiple
                  accept={LIBRARY_FILE_ACCEPT}
                  onChange={(event) => {
                    void handleAddFileSelection(event.target.files);
                    event.target.value = "";
                  }}
                  className="hidden"
                />

                {extracting && (
                  <div className="flex items-center gap-2 text-[10px] text-[#b8f600] font-mono">
                    <span className="w-3 h-3 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                    {t.library.extracting} {extractingStatus}
                  </div>
                )}

                {error && (
                  <p className="text-[10px] text-rose-400 whitespace-pre-line">{error}</p>
                )}

                {stagedFiles.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-mono text-white/40 tracking-wider block mb-1.5">
                      {t.library.stagedFiles} · {stagedFiles.length}
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-modern">
                      {stagedFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-2 bg-[#1a1c19] border border-white/5 rounded px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="w-3 h-3 text-[#b8f600] shrink-0" />
                            <span className="text-[10px] text-[#e3e3de] truncate">{file.name}</span>
                            <span className="text-[8px] font-mono text-white/30 shrink-0">{formatLabel(file.format)}</span>
                          </div>
                          <button
                            onClick={() => setStagedFiles(prev => prev.filter((_, i) => i !== index))}
                            title={t.library.removeStagedFile}
                            className="p-0.5 text-white/25 hover:text-rose-400 transition-colors shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2 shrink-0">
                <button
                  onClick={resetAddPanel}
                  disabled={extracting || creating}
                  className="px-3 py-1.5 text-[11px] text-[#c3caac] hover:text-white transition-colors disabled:opacity-30"
                >
                  {t.library.close}
                </button>
                <button
                  onClick={() => void createPackage()}
                  disabled={extracting || creating || stagedFiles.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold rounded transition-colors disabled:opacity-30"
                >
                  {creating ? (
                    <>
                      <span className="w-3 h-3 border-2 border-[#141f00]/30 border-t-[#141f00] rounded-full animate-spin" />
                      {t.library.creating}
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      {t.library.createPackage}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Package detail */}
      <AnimatePresence>
        {openPackage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setOpenPackageId(null)}
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
                  <div className="flex items-center gap-2 min-w-0">
                    <BookMarked className="w-4 h-4 text-[#b8f600] shrink-0" />
                    <h3 className="text-sm font-bold text-[#e3e3de] truncate">{openPackage.name}</h3>
                  </div>
                  <span className="text-[10px] text-white/30 font-mono mt-1 block">
                    {t.library.fileCount.replace("{count}", String(openPackageFiles.length))}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!legacy && (
                    <button
                      onClick={() => packageFileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#b8f600]/30 text-[#b8f600] hover:bg-[#b8f600]/10 text-[10px] font-bold transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {t.library.addFilesToPackage}
                    </button>
                  )}
                  <button
                    onClick={() => void handleDeletePackage(openPackage)}
                    title={t.library.deletePackage}
                    className="p-1.5 rounded text-white/30 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setOpenPackageId(null)}
                    title={t.library.close}
                    className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 scrollbar-modern">
                <input
                  ref={packageFileInputRef}
                  type="file"
                  multiple
                  accept={LIBRARY_FILE_ACCEPT}
                  onChange={(event) => {
                    void handleAddFilesToPackage(event.target.files);
                    event.target.value = "";
                  }}
                  className="hidden"
                />

                {extracting && (
                  <div className="flex items-center gap-2 text-[10px] text-[#b8f600] font-mono px-2 py-2">
                    <span className="w-3 h-3 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                    {t.library.extracting} {extractingStatus}
                  </div>
                )}
                {error && <p className="text-[10px] text-rose-400 whitespace-pre-line px-2 py-2">{error}</p>}

                {openPackageFiles.length === 0 ? (
                  <div className="py-14 text-center">
                    <FileText className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    <p className="text-[11px] text-white/40">{t.library.noFiles}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {openPackageFiles.map(file => (
                      <div
                        key={file.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setReadingFileId(file.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setReadingFileId(file.id);
                          }
                        }}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded border border-white/5 bg-[#1a1c19] hover:border-[#b8f600]/30 hover:bg-[#202220] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-[#b8f600] shrink-0" />
                          <span className="text-[11px] text-[#e3e3de] truncate">{file.name}</span>
                          <span className="text-[8px] font-mono text-white/30 shrink-0 px-1.5 py-0.5 bg-white/5 rounded">
                            {formatLabel(file.format)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] font-mono text-white/25">
                            {file.content.replace(/\s/g, "").length} {t.library.chars}
                          </span>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteFile(file);
                            }}
                            title={t.library.deleteFile}
                            className="p-1 rounded text-white/20 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File reader */}
      <AnimatePresence>
        {readingFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setReadingFileId(null)}
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
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-[#b8f600] shrink-0" />
                    <h3 className="text-sm font-bold text-[#e3e3de] truncate">{readingFile.name}</h3>
                  </div>
                  <span className="text-[10px] text-white/30 font-mono mt-1 block">
                    {readingPackage?.name ? `${readingPackage.name} · ` : ""}
                    {formatLabel(readingFile.format)} · {readingFile.content.replace(/\s/g, "").length} {t.library.chars}
                  </span>
                </div>
                <button
                  onClick={() => setReadingFileId(null)}
                  title={t.library.close}
                  className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-modern">
                <pre className="text-sm text-[#e3e3de] leading-relaxed font-mono whitespace-pre-wrap">
                  {readingFile.content}
                </pre>
              </div>

              <div className="px-6 py-3 border-t border-[#434933]/30 flex items-center justify-end shrink-0">
                <button
                  onClick={() => void handleDeleteFile(readingFile)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[11px] font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t.library.deleteFile}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
