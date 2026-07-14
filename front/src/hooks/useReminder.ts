import { useEffect, useRef, useCallback } from "react";

interface ReminderSettings {
  enabled: boolean;
  time: string; // "HH:mm"
  soundEnabled: boolean;
  onFire?: (notification: { title: string; message: string }) => void;
}

/**
 * Hook to manage browser-based learning reminders.
 * Shows both desktop notifications (if permitted) and in-app toasts.
 */
export function useReminder(settings: ReminderSettings) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFiredDateRef = useRef<string>("");
  const onFireRef = useRef(settings.onFire);
  onFireRef.current = settings.onFire;

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!settings.enabled || !settings.time) return;

    timerRef.current = setInterval(async () => {
      const now = new Date();
      const [h, m] = settings.time.split(":").map(Number);
      const currentDateStr = now.toDateString();

      if (
        now.getHours() === h &&
        now.getMinutes() === m &&
        lastFiredDateRef.current !== currentDateStr
      ) {
        lastFiredDateRef.current = currentDateStr;

        const isZh = localStorage.getItem("quickly_locale") !== "en-US";
        const title = isZh ? "Quickly 学习提醒" : "Quickly Study Reminder";
        const message = isZh
          ? "该开始今天的学习了！保持每日习惯，进步看得见 💪"
          : "Time to start studying! Keep the daily habit going 💪";

        // In-app notification (always fires)
        onFireRef.current?.({ title, message });

        // Browser notification (if permitted)
        const hasPermission = await requestPermission();
        if (hasPermission) {
          new Notification(title, {
            body: message,
            icon: "/favicon.ico",
            tag: "quickly-reminder",
          });
        }
      }
    }, 30000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [settings.enabled, settings.time, requestPermission]);

  return { requestPermission };
}
