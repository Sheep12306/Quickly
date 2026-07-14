import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Bell, CheckCircle, AlertCircle, Info } from "lucide-react";

export interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "reminder";
  title: string;
  message: string;
  timestamp: string;
  read?: boolean;
}

interface ToastContainerProps {
  toasts: Notification[];
  onDismiss: (id: string) => void;
}

const iconMap = {
  info: Info,
  success: CheckCircle,
  warning: AlertCircle,
  reminder: Bell,
};

const colorMap = {
  info: "text-blue-400",
  success: "text-[#b8f600]",
  warning: "text-amber-400",
  reminder: "text-[#b8f600]",
};

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { key?: string; toast: Notification; onDismiss: (id: string) => void }) {
  const Icon = iconMap[toast.type];
  const iconColor = colorMap[toast.type];

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 8000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="pointer-events-auto bg-[#222222] border border-white/10 rounded-lg shadow-2xl p-4 flex items-start gap-3 min-w-[280px]"
    >
      <div className={`w-8 h-8 rounded-full bg-[#1a1c19] flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-[#e3e3de] truncate">{toast.title}</h4>
          <button
            onClick={() => onDismiss(toast.id)}
            className="p-0.5 rounded text-white/30 hover:text-white hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-[#c3caac] mt-1 leading-relaxed">{toast.message}</p>
        <span className="text-[9px] text-white/30 font-mono mt-2 block">{toast.timestamp}</span>
      </div>
    </motion.div>
  );
}
