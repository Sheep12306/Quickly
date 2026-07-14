import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Simple session-only study timer.
 * - Starts at 0 every page load.
 * - Tracks elapsed time in seconds.
 * - Returns minutesLearned for display.
 * - No persistence — resets on page refresh.
 */
export function useStudyTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const prevTotalRef = useRef(0); // accumulated seconds before current run
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // ─── Tick every second while running ───
  useEffect(() => {
    if (!isRunning) {
      clearTick();
      return;
    }

    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const delta = Math.floor((Date.now() - startTimeRef.current!) / 1000);
      setElapsedSeconds(prevTotalRef.current + delta);
    }, 250); // faster tick for smoother display

    return clearTick;
  }, [isRunning]);

  const startTimer = useCallback(() => {
    prevTotalRef.current = elapsedSeconds;
    setIsRunning(true);
  }, [elapsedSeconds]);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
    prevTotalRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const minutesLearned = Math.floor(elapsedSeconds / 60);

  return {
    elapsedSeconds,
    minutesLearned,
    isRunning,
    startTimer,
    pauseTimer,
  };
}
