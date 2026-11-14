import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookMarked,
  Folder,
  FileText,
  Search,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  X,
  Database,
  Settings,
  StickyNote,
  AlertCircle,
  Link2,
  Plus,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Move,
  Tag,
} from "lucide-react";
import type { IMAConfig, IMAKnowledgeBase, IMAKnowledgeItem } from "../types";
import { useI18n } from "../i18n";

interface ImasKnowledgeBaseProps {
  imaConfig: IMAConfig;
  onOpenSettings: () => void;
  onOpenLocal?: () => void;
  hasLocal?: boolean;
}

type MediaResult = {
  type: "note" | "file" | "unavailable";
  mediaType: number;
  content?: string;
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

export default function ImasKnowledgeBase({
  imaConfig,
  onOpenSettings,
  onOpenLocal,
  hasLocal = false,
}: ImasKnowledgeBaseProps) {
  const { t } = useI18n();
  const clientId = imaConfig.clientId.trim();
  const apiKey = imaConfig.apiKey.trim();
  const hasCredentials = Boolean(clientId && apiKey);
  const isEnabled = hasCredentials && imaConfig.enabled && (imaConfig.provider || "ima") === "ima";

  const [knowledgeBases, setKnowledgeBases] = useState<IMAKnowledgeBase[]>([]);
  const [loadingKbs, setLoadingKbs] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);

  const [activeKb, setActiveKb] = useState<IMAKnowledgeBase | null>(null);
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [items, setItems] = useState<IMAKnowledgeItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [isEnd, setIsEnd] = useState(true);
  const [nextCursor, setNextCursor] = useState("");

  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<IMAKnowledgeItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchIsEnd, setSearchIsEnd] = useState(true);
  const [searchCursor, setSearchCursor] = useState("");

  const [selectedItem, setSelectedItem] = useState<IMAKnowledgeItem | null>(null);
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const [createKbOpen, setCreateKbOpen] = useState(false);
  const [newKbName, setNewKbName] = useState("");
  const [newKbDescription, setNewKbDescription] = useState("");
  const [creatingKb, setCreatingKb] = useState(false);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [importUrlText, setImportUrlText] = useState("");
  const [importingUrls, setImportingUrls] = useState(false);

  const [manageItem, setManageItem] = useState<IMAKnowledgeItem | null>(null);
  const [manageRename, setManageRename] = useState("");
  const [manageTargetKbId, setManageTargetKbId] = useState("");
  const [manageTag, setManageTag] = useState("");
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const imaPost = useCallback(async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, apiKey, ...body }),
    });
    const data = await response.json().catch(() => ({}));
    if (!data.success) {
      throw new Error(data.error || "IMA request failed");
    }
    return data;
  }, [clientId, apiKey]);

  const loadKnowledgeBases = useCallback(async () => {
    if (!isEnabled) {
      setKnowledgeBases([]);
      setKbError(null);
      return;
    }
    setLoadingKbs(true);
    setKbError(null);
    try {
      const data = await imaPost("/api/ima/knowledge-bases", { query: "", cursor: "", limit: 20 });
      setKnowledgeBases(Array.isArray(data.knowledgeBases) ? data.knowledgeBases : []);
    } catch (error: any) {
      setKbError(error?.message || t.library.imaLoadFailed);
    } finally {
      setLoadingKbs(false);
    }
  }, [isEnabled, imaPost, t.library.imaLoadFailed]);

  useEffect(() => {
    void loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  useEffect(() => {
    setActiveKb(null);
    setFolderStack([]);
    setItems([]);
    setQuery("");
    setSearchTerm("");
    setSearchResults([]);
  }, [clientId, apiKey, imaConfig.enabled]);

  useEffect(() => {
    if (!activeKb || !isEnabled) return;
    let cancelled = false;
    const folderId = folderStack.length ? folderStack[folderStack.length - 1].id : "";

    setItemsLoading(true);
    setItemsError(null);

    imaPost("/api/ima/knowledge-list", {
      knowledgeBaseId: activeKb.id,
      folderId,
      cursor: "",
      limit: 50,
    })
      .then((data) => {
        if (cancelled) return;
        const result = data.data || {};
        setItems(Array.isArray(result.items) ? result.items : []);
        setIsEnd(Boolean(result.isEnd));
        setNextCursor(String(result.nextCursor || ""));
      })
      .catch((error) => {
        if (!cancelled) setItemsError(error?.message || t.library.imaLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeKb, folderStack, isEnabled, imaPost, t.library.imaLoadFailed]);

  const clearSearch = () => {
    setQuery("");
    setSearchTerm("");
    setSearchResults([]);
    setSearchError(null);
    setSearchIsEnd(true);
    setSearchCursor("");
  };

  const openKnowledgeBase = (kb: IMAKnowledgeBase) => {
    setActiveKb(kb);
    setFolderStack([]);
    setItems([]);
    clearSearch();
  };

  const submitSearch = async (term: string, cursor = "") => {
    const trimmed = term.trim();
    if (!activeKb || !trimmed) return;

    setSearching(true);
    setSearchError(null);
    try {
      const data = await imaPost("/api/ima/search-knowledge", {
        knowledgeBaseId: activeKb.id,
        query: trimmed,
        cursor,
      });
      const result = data.data || {};
      const nextItems = Array.isArray(result.items) ? result.items : [];
      setSearchResults(prev => (cursor ? [...prev, ...nextItems] : nextItems));
      setSearchTerm(trimmed);
      setSearchIsEnd(Boolean(result.isEnd));
      setSearchCursor(String(result.nextCursor || ""));
    } catch (error: any) {
      setSearchError(error?.message || t.library.imaLoadFailed);
    } finally {
      setSearching(false);
    }
  };

  const loadMoreItems = async () => {
    if (!activeKb || !nextCursor || itemsLoading) return;
    const folderId = folderStack.length ? folderStack[folderStack.length - 1].id : "";

    setItemsLoading(true);
    setItemsError(null);
    try {
      const data = await imaPost("/api/ima/knowledge-list", {
        knowledgeBaseId: activeKb.id,
        folderId,
        cursor: nextCursor,
        limit: 50,
      });
      const result = data.data || {};
      setItems(prev => [...prev, ...(Array.isArray(result.items) ? result.items : [])]);
      setIsEnd(Boolean(result.isEnd));
      setNextCursor(String(result.nextCursor || ""));
    } catch (error: any) {
      setItemsError(error?.message || t.library.imaLoadFailed);
    } finally {
      setItemsLoading(false);
    }
  };

  const loadMedia = async (item: IMAKnowledgeItem) => {
    setMediaLoading(true);
    setMediaError(null);
    setMedia(null);
    try {
      const data = await imaPost("/api/ima/media-info", { mediaId: item.mediaId });
      setMedia(data.data || null);
    } catch (error: any) {
      setMediaError(error?.message || t.library.imaLoadFailed);
    } finally {
      setMediaLoading(false);
    }
  };

  const openItem = (item: IMAKnowledgeItem) => {
    if (item.isFolder) {
      setFolderStack(prev => [...prev, {
        id: item.folderId || item.mediaId || item.id,
        name: item.title,
      }]);
      clearSearch();
      return;
    }
    setSelectedItem(item);
    void loadMedia(item);
  };

  const currentFolderId = folderStack.length ? folderStack[folderStack.length - 1].id : "";
  const reloadCurrentFolder = () => setFolderStack(prev => [...prev]);

  const handleCreateKb = async () => {
    if (!newKbName.trim()) return;
    setCreatingKb(true);
    try {
      await imaPost("/api/ima/create-knowledge-base", {
        name: newKbName.trim(),
        description: newKbDescription.trim(),
      });
      setCreateKbOpen(false);
      setNewKbName("");
      setNewKbDescription("");
      await loadKnowledgeBases();
    } catch (createError: any) {
      setKbError(createError?.message || t.library.imaLoadFailed);
    } finally {
      setCreatingKb(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!activeKb || !newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await imaPost("/api/ima/create-folder", {
        knowledgeBaseId: activeKb.id,
        name: newFolderName.trim(),
        parentFolderId: currentFolderId || undefined,
      });
      setCreateFolderOpen(false);
      setNewFolderName("");
      reloadCurrentFolder();
    } catch (createError: any) {
      setItemsError(createError?.message || t.library.imaLoadFailed);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleImportUrls = async () => {
    if (!activeKb) return;
    const urls = importUrlText.split(/[\n,]+/).map(url => url.trim()).filter(Boolean).slice(0, 10);
    if (urls.length === 0) return;
    setImportingUrls(true);
    try {
      await imaPost("/api/ima/import-urls", {
        knowledgeBaseId: activeKb.id,
        folderId: currentFolderId || undefined,
        urls,
      });
      setImportUrlOpen(false);
      setImportUrlText("");
      reloadCurrentFolder();
    } catch (importError: any) {
      setItemsError(importError?.message || t.library.imaLoadFailed);
    } finally {
      setImportingUrls(false);
    }
  };

  const openManage = (item: IMAKnowledgeItem) => {
    setManageItem(item);
    setManageRename(item.title);
    setManageTargetKbId(activeKb?.id || "");
    setManageTag("");
    setManageError(null);
  };

  const manageMediaId = () => manageItem?.mediaId || manageItem?.folderId || manageItem?.id || "";

  const handleRenameItem = async () => {
    if (!activeKb || !manageItem || !manageRename.trim()) return;
    setManaging(true);
    setManageError(null);
    try {
      await imaPost("/api/ima/rename-knowledge", {
        knowledgeBaseId: activeKb.id,
        mediaId: manageMediaId(),
        name: manageRename.trim(),
      });
      setManageItem(null);
      reloadCurrentFolder();
    } catch (renameError: any) {
      setManageError(renameError?.message || t.library.imaLoadFailed);
    } finally {
      setManaging(false);
    }
  };

  const handleMoveItem = async () => {
    if (!activeKb || !manageItem || !manageTargetKbId) return;
    setManaging(true);
    setManageError(null);
    try {
      await imaPost("/api/ima/move-knowledge", {
        sourceKnowledgeBaseId: activeKb.id,
        targetKnowledgeBaseId: manageTargetKbId,
        mediaIds: [manageMediaId()],
      });
      setManageItem(null);
      await loadKnowledgeBases();
      reloadCurrentFolder();
    } catch (moveError: any) {
      setManageError(moveError?.message || t.library.imaLoadFailed);
    } finally {
      setManaging(false);
    }
  };

  const handleTagItem = async () => {
    if (!activeKb || !manageItem || !manageTag.trim()) return;
    setManaging(true);
    setManageError(null);
    try {
      await imaPost("/api/ima/tag-add", {
        knowledgeBaseId: activeKb.id,
        tagName: manageTag.trim(),
        mediaIds: [manageMediaId()],
      });
      setManageTag("");
    } catch (tagError: any) {
      setManageError(tagError?.message || t.library.imaLoadFailed);
    } finally {
      setManaging(false);
    }
  };

  const openOriginal = async () => {
    if (!selectedItem) return;
    setOpening(true);
    setMediaError(null);

    // Open the window synchronously so the async file fetch is not treated as a popup.
    const popup = window.open("", "_blank");

    try {
      const response = await fetch("/api/ima/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          apiKey,
          mediaId: selectedItem.mediaId,
          fileName: selectedItem.title,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t.library.imaUnavailable);
      }
      const contentType = response.headers.get("content-type") || "";
      const disposition = response.headers.get("content-disposition") || "";
      const shouldDownload = /attachment/i.test(disposition) || /html|svg|xml/i.test(contentType);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (shouldDownload) {
        const link = document.createElement("a");
        link.href = url;
        link.download = selectedItem.title || "ima-file";
        document.body.appendChild(link);
        link.click();
        link.remove();
        popup?.close();
      } else if (popup) {
        popup.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: any) {
      popup?.close();
      setMediaError(error?.message || t.library.imaUnavailable);
    } finally {
      setOpening(false);
    }
  };

  const mediaLabel = (item: IMAKnowledgeItem) => {
    if (item.isFolder) return t.library.imaFolder;
    if (item.mediaType === 11) return t.library.imaNote;
    const extension = item.title.includes(".")
      ? item.title.split(".").pop()?.toUpperCase() || ""
      : "";
    if (extension && extension.length <= 5) return extension;
    const labels: Record<number, string> = {
      1: "PDF",
      2: "Web",
      3: "Word",
      4: "PPT",
      5: "Excel",
      6: "Web",
      7: "MD",
      9: "Image",
      13: "TXT",
      14: "XMind",
      15: "Audio",
      16: "Video",
      19: "Podcast",
      20: "HTML",
      21: "EPUB",
      98: "Code",
    };
    return labels[item.mediaType] || t.library.imaFile;
  };

  const renderItem = (item: IMAKnowledgeItem) => (
    <div
      key={item.id}
      role="button"
      tabIndex={0}
      onClick={() => openItem(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openItem(item);
        }
      }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded border border-white/5 bg-[#1a1c19] hover:border-[#b8f600]/30 hover:bg-[#202220] transition-colors text-left cursor-pointer"
    >
      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
        item.isFolder ? "bg-amber-400/10" : item.mediaType === 11 ? "bg-violet-400/10" : "bg-[#b8f600]/10"
      }`}>
        {item.isFolder ? (
          <Folder className="w-4 h-4 text-amber-400" />
        ) : item.mediaType === 11 ? (
          <StickyNote className="w-4 h-4 text-violet-300" />
        ) : (
          <FileText className="w-4 h-4 text-[#b8f600]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-[#e3e3de] truncate">{item.title}</span>
          <span className="text-[8px] font-mono text-white/40 shrink-0 px-1.5 py-0.5 bg-white/5 rounded">
            {mediaLabel(item)}
          </span>
        </div>
        {item.highlightContent && (
          <p className="text-[10px] text-[#c3caac]/70 truncate mt-0.5">
            {stripHtml(item.highlightContent)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {item.isFolder ? (
          <ChevronRight className="w-3.5 h-3.5 text-white/25" />
        ) : (
          <ExternalLink className="w-3.5 h-3.5 text-white/25" />
        )}
        <button
          onClick={(event) => {
            event.stopPropagation();
            openManage(item);
          }}
          title={t.library.imaManage}
          className="p-1 rounded text-white/25 hover:text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const activeFolderName = folderStack.length ? folderStack[folderStack.length - 1].name : t.library.imaRoot;

  return (
    <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto scrollbar-modern" id="ima-knowledge-base-pane">
      <div className="w-full max-w-6xl space-y-5 text-left">
        {/* Heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-[#e3e3de] flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-[#b8f600]" />
              {t.library.imaTitle}
            </h2>
            <p className="text-xs text-[#c3caac]/70 mt-1">{t.library.imaSubtitle}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setCreateKbOpen(true);
                setNewKbName("");
                setNewKbDescription("");
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-[#b8f600]/25 bg-[#b8f600]/5 text-[10px] font-bold text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.library.imaCreateKb}
            </button>
            {activeKb && (
              <>
                <button
                  onClick={() => {
                    setCreateFolderOpen(true);
                    setNewFolderName("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  {t.library.imaCreateFolder}
                </button>
                <button
                  onClick={() => {
                    setImportUrlOpen(true);
                    setImportUrlText("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white hover:border-white/20 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {t.library.imaImportUrl}
                </button>
              </>
            )}
            {hasLocal && onOpenLocal && (
              <button
                onClick={onOpenLocal}
                className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-[#e3e3de] hover:border-white/20 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                {t.library.imaOpenLocal}
              </button>
            )}
            <button
              onClick={() => {
                void loadKnowledgeBases();
                if (activeKb) setFolderStack(prev => [...prev]);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-[#e3e3de] hover:border-white/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t.library.imaRefresh}
            </button>
            <a
              href="https://ima.qq.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-[#b8f600]/20 text-[10px] font-bold text-[#b8f600] hover:bg-[#b8f600]/10 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t.library.imaOpenInIma}
            </a>
          </div>
        </div>

        {/* Not configured */}
        {!hasCredentials ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
            <Database className="w-12 h-12 text-white/10 mb-4" />
            <p className="text-sm text-white/50 font-mono">{t.library.imaNotConfigured}</p>
            <p className="text-xs text-[#c3caac]/65 mt-1 max-w-md leading-relaxed">
              {t.library.imaNotConfiguredDesc}
            </p>
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-4 py-2 mt-5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              {t.library.imaConfigure}
            </button>
          </div>
        ) : !imaConfig.enabled ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
            <Database className="w-12 h-12 text-white/10 mb-4" />
            <p className="text-sm text-white/50 font-mono">{t.library.imaDisabled}</p>
            <p className="text-xs text-[#c3caac]/65 mt-1 max-w-md leading-relaxed">
              {t.library.imaDisabledDesc}
            </p>
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-4 py-2 mt-5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              {t.library.imaEnable}
            </button>
          </div>
        ) : loadingKbs && knowledgeBases.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-24 text-xs text-[#c3caac]/70 font-mono">
            <span className="w-4 h-4 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
            {t.library.imaLoading}
          </div>
        ) : kbError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-rose-500/20 rounded bg-rose-500/5">
            <AlertCircle className="w-8 h-8 text-rose-400/70 mb-3" />
            <p className="text-xs text-rose-300">{kbError}</p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => void loadKnowledgeBases()}
                className="px-3 py-1.5 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white transition-colors"
              >
                {t.library.imaRetry}
              </button>
              <button
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded bg-[#b8f600] text-[#141f00] text-[10px] font-bold hover:bg-[#a1d800] transition-colors"
              >
                {t.library.imaConfigure}
              </button>
            </div>
          </div>
        ) : !activeKb ? (
          <>
            <div className="flex items-center justify-between text-[10px] font-mono text-white/30">
              <span>{t.library.imaContentCount.replace("{count}", String(knowledgeBases.length))}</span>
              <span>IMA OpenAPI</span>
            </div>

            {knowledgeBases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-[#434933]/20 rounded bg-[#1a1c19]/50">
                <Database className="w-10 h-10 text-white/10 mb-3" />
                <p className="text-xs text-white/40">{t.library.imaNoKnowledgeBases}</p>
                <p className="text-[10px] text-[#c3caac]/60 mt-1 max-w-sm">{t.library.imaNoKnowledgeBasesDesc}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {knowledgeBases.map((kb) => (
                  <motion.button
                    key={kb.id}
                    layout
                    onClick={() => openKnowledgeBase(kb)}
                    className="group bg-[#222222] border border-white/5 hover:border-[#b8f600]/30 hover:bg-[#2A2A2A] rounded-lg p-4 transition-all duration-300 text-left flex flex-col justify-between min-h-[128px]"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-9 h-9 rounded-lg bg-[#b8f600]/10 flex items-center justify-center shrink-0">
                          <Database className="w-4 h-4 text-[#b8f600]" />
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-[#b8f600] transition-colors shrink-0" />
                      </div>
                      <p className="text-[12px] font-bold text-[#e3e3de] truncate mt-3">{kb.name}</p>
                      {kb.description && (
                        <p className="text-[10px] text-[#c3caac]/60 line-clamp-2 mt-1">{kb.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-mono text-white/30 mt-3 pt-2.5 border-t border-white/5">
                      <span>{t.library.imaContentCount.replace("{count}", String(kb.contentCount || 0))}</span>
                      <span className="text-[#b8f600]/60 group-hover:text-[#b8f600] transition-colors">
                        {t.library.imaOpen}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#c3caac]">
              <button
                onClick={() => { setActiveKb(null); clearSearch(); }}
                className="flex items-center gap-1 hover:text-[#b8f600] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t.library.imaBackToKbs}
              </button>
              <ChevronRight className="w-3 h-3 text-white/20" />
              <button
                onClick={() => { setFolderStack([]); clearSearch(); }}
                className={`hover:text-[#b8f600] transition-colors ${folderStack.length === 0 ? "text-[#e3e3de]" : ""}`}
              >
                {activeKb.name}
              </button>
              {folderStack.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <ChevronRight className="w-3 h-3 text-white/20" />
                  <button
                    onClick={() => { setFolderStack(prev => prev.slice(0, index + 1)); clearSearch(); }}
                    className={`hover:text-[#b8f600] transition-colors ${index === folderStack.length - 1 ? "text-[#e3e3de]" : ""}`}
                  >
                    {folder.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Search */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitSearch(query);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t.library.imaSearchPlaceholder}
                  className="w-full bg-[#1a1c19] border border-white/5 rounded pl-10 pr-9 py-2.5 text-xs text-[#e3e3de] placeholder-white/30 focus:outline-none focus:border-[#b8f600] transition-colors"
                />
                {query && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    title={t.library.imaClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!query.trim() || searching}
                className="px-4 py-2.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[11px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {searching ? (
                  <span className="w-3.5 h-3.5 border-2 border-[#141f00]/30 border-t-[#141f00] rounded-full animate-spin block" />
                ) : (
                  t.library.imaSearch
                )}
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] font-mono text-white/30">
              <span>
                {searchTerm
                  ? `${t.library.imaSearchResults} · ${searchResults.length}`
                  : `${activeFolderName} · ${t.library.imaItemsCount.replace("{count}", String(items.length))}`}
              </span>
              <span>{activeKb.name}</span>
            </div>

            {/* Search results or folder contents */}
            {searchTerm ? (
              <div className="space-y-1.5">
                {searchError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded border border-rose-500/20 bg-rose-500/5 text-[10px] text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {searchError}
                  </div>
                )}
                {searchResults.length === 0 && !searching && !searchError ? (
                  <div className="py-16 text-center">
                    <Search className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    <p className="text-xs text-white/40">{t.library.imaNoResults}</p>
                  </div>
                ) : (
                  searchResults.map(renderItem)
                )}
                {searching && searchResults.length === 0 && (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#c3caac]/70 font-mono">
                    <span className="w-4 h-4 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                    {t.library.imaLoading}
                  </div>
                )}
                {!searchIsEnd && searchCursor && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => void submitSearch(searchTerm, searchCursor)}
                      disabled={searching}
                      className="px-3 py-1.5 rounded border border-white/10 text-[10px] text-[#c3caac] hover:text-white transition-colors disabled:opacity-30"
                    >
                      {t.library.imaLoadMore}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {itemsError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded border border-rose-500/20 bg-rose-500/5 text-[10px] text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {itemsError}
                  </div>
                )}
                {itemsLoading && items.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-xs text-[#c3caac]/70 font-mono">
                    <span className="w-4 h-4 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                    {t.library.imaLoading}
                  </div>
                ) : items.length === 0 ? (
                  <div className="py-16 text-center">
                    <Folder className="w-8 h-8 text-white/10 mx-auto mb-2" />
                    <p className="text-xs text-white/40">{t.library.imaEmptyFolder}</p>
                  </div>
                ) : (
                  items.map(renderItem)
                )}
                {!isEnd && nextCursor && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => void loadMoreItems()}
                      disabled={itemsLoading}
                      className="px-3 py-1.5 rounded border border-white/10 text-[10px] text-[#c3caac] hover:text-white transition-colors disabled:opacity-30"
                    >
                      {itemsLoading ? t.library.imaLoading : t.library.imaLoadMore}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Item reader */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setSelectedItem(null)}
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
                    {selectedItem.mediaType === 11 ? (
                      <StickyNote className="w-4 h-4 text-violet-300 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-[#b8f600] shrink-0" />
                    )}
                    <h3 className="text-sm font-bold text-[#e3e3de] truncate">{selectedItem.title}</h3>
                    <span className="text-[8px] font-mono text-white/40 shrink-0 px-1.5 py-0.5 bg-white/5 rounded">
                      {mediaLabel(selectedItem)}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/30 font-mono mt-1 block">{activeKb?.name}</span>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-modern">
                {mediaLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-xs text-[#c3caac]/70 font-mono">
                    <span className="w-4 h-4 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                    {t.library.imaLoading}
                  </div>
                ) : mediaError ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-8 h-8 text-rose-400/70 mb-3" />
                    <p className="text-xs text-rose-300">{mediaError}</p>
                    <button
                      onClick={() => void loadMedia(selectedItem)}
                      className="mt-4 px-3 py-1.5 rounded border border-white/10 text-[10px] text-[#c3caac] hover:text-white transition-colors"
                    >
                      {t.library.imaRetry}
                    </button>
                  </div>
                ) : media?.type === "note" ? (
                  <pre className="text-sm text-[#e3e3de] leading-relaxed font-mono whitespace-pre-wrap">
                    {media.content || ""}
                  </pre>
                ) : media?.type === "file" ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-14 h-14 rounded-full bg-[#b8f600]/10 border border-[#b8f600]/20 flex items-center justify-center mb-4">
                      <FileText className="w-6 h-6 text-[#b8f600]" />
                    </div>
                    <p className="text-xs text-[#c3caac]/70 max-w-sm leading-relaxed">
                      {mediaLabel(selectedItem)} · {activeKb?.name}
                    </p>
                    <button
                      onClick={() => void openOriginal()}
                      disabled={opening}
                      className="flex items-center gap-2 px-4 py-2 mt-5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-xs font-bold rounded transition-colors disabled:opacity-50"
                    >
                      {opening ? (
                        <span className="w-3.5 h-3.5 border-2 border-[#141f00]/30 border-t-[#141f00] rounded-full animate-spin" />
                      ) : (
                        <Link2 className="w-3.5 h-3.5" />
                      )}
                      {opening ? t.library.imaOpening : t.library.imaOpenOriginal}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-8 h-8 text-amber-400/70 mb-3" />
                    <p className="text-xs text-[#c3caac]/70 max-w-sm leading-relaxed">
                      {t.library.imaUnavailable}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create knowledge base */}
      <AnimatePresence>
        {createKbOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setCreateKbOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-md bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.library.imaCreateKb}</h3>
                <button onClick={() => setCreateKbOpen(false)} className="text-white/40 hover:text-white p-1"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5 space-y-3">
                <label className="block">
                  <span className="text-[10px] text-[#c3caac] block mb-1">{t.library.imaKbName}</span>
                  <input
                    type="text"
                    value={newKbName}
                    onChange={(event) => setNewKbName(event.target.value)}
                    className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-[#c3caac] block mb-1">{t.library.imaKbDescription}</span>
                  <textarea
                    rows={3}
                    value={newKbDescription}
                    onChange={(event) => setNewKbDescription(event.target.value)}
                    className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600] resize-none"
                  />
                </label>
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex justify-end gap-2">
                <button onClick={() => setCreateKbOpen(false)} className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white">{t.library.imaCancel}</button>
                <button
                  onClick={() => void handleCreateKb()}
                  disabled={creatingKb || !newKbName.trim()}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold disabled:opacity-30"
                >
                  {creatingKb ? t.library.imaCreating : t.library.imaSave}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create folder */}
      <AnimatePresence>
        {createFolderOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setCreateFolderOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-md bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.library.imaCreateFolder}</h3>
                <button onClick={() => setCreateFolderOpen(false)} className="text-white/40 hover:text-white p-1"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5">
                <label className="block">
                  <span className="text-[10px] text-[#c3caac] block mb-1">{t.library.imaFolderName}</span>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    autoFocus
                  />
                </label>
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex justify-end gap-2">
                <button onClick={() => setCreateFolderOpen(false)} className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white">{t.library.imaCancel}</button>
                <button
                  onClick={() => void handleCreateFolder()}
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold disabled:opacity-30"
                >
                  {creatingFolder ? t.library.imaCreating : t.library.imaSave}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import URLs */}
      <AnimatePresence>
        {importUrlOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setImportUrlOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-lg bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.library.imaImportUrl}</h3>
                <button onClick={() => setImportUrlOpen(false)} className="text-white/40 hover:text-white p-1"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5">
                <textarea
                  rows={6}
                  value={importUrlText}
                  onChange={(event) => setImportUrlText(event.target.value)}
                  placeholder={t.library.imaUrlPlaceholder}
                  className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2.5 text-xs text-[#e3e3de] placeholder-white/25 focus:outline-none focus:border-[#b8f600] resize-y"
                />
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex justify-end gap-2">
                <button onClick={() => setImportUrlOpen(false)} className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white">{t.library.imaCancel}</button>
                <button
                  onClick={() => void handleImportUrls()}
                  disabled={importingUrls || !importUrlText.trim()}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold disabled:opacity-30"
                >
                  {importingUrls ? t.library.imaImporting : t.library.imaImportUrl}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manage item */}
      <AnimatePresence>
        {manageItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setManageItem(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-md bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#e3e3de] truncate">{t.library.imaManage}</h3>
                  <p className="text-[10px] text-white/30 truncate mt-0.5">{manageItem.title}</p>
                </div>
                <button onClick={() => setManageItem(null)} className="text-white/40 hover:text-white p-1"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[10px] text-[#c3caac] block mb-1">{t.library.imaRename}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manageRename}
                      onChange={(event) => setManageRename(event.target.value)}
                      className="flex-1 bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    />
                    <button
                      onClick={() => void handleRenameItem()}
                      disabled={managing || !manageRename.trim()}
                      className="px-3 py-1.5 rounded bg-[#b8f600] text-[#141f00] text-[10px] font-bold disabled:opacity-30"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-[#c3caac] block mb-1">{t.library.imaMove}</label>
                  <div className="flex gap-2">
                    <select
                      value={manageTargetKbId}
                      onChange={(event) => setManageTargetKbId(event.target.value)}
                      className="flex-1 bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    >
                      {knowledgeBases.map(kb => (
                        <option key={kb.id} value={kb.id}>{kb.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleMoveItem()}
                      disabled={managing || !manageTargetKbId}
                      className="px-3 py-1.5 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white disabled:opacity-30"
                    >
                      <Move className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-[#c3caac] block mb-1">{t.library.imaTag}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manageTag}
                      onChange={(event) => setManageTag(event.target.value)}
                      className="flex-1 bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    />
                    <button
                      onClick={() => void handleTagItem()}
                      disabled={managing || !manageTag.trim()}
                      className="px-3 py-1.5 rounded border border-white/10 text-[10px] font-bold text-[#c3caac] hover:text-white disabled:opacity-30"
                    >
                      <Tag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {manageError && (
                  <p className="text-[10px] text-rose-400 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {manageError}
                  </p>
                )}
                {managing && (
                  <p className="text-[10px] text-[#b8f600] flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                    {t.library.imaManaging}
                  </p>
                )}
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30">
                <p className="text-[9px] text-white/25 leading-relaxed">{t.library.imaNoDelete}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
