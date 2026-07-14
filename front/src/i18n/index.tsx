import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import zhCN from "./zh-CN";
import enUS from "./en-US";
import type { Translations } from "./zh-CN";

type Locale = "zh-CN" | "en-US";

const translations: Record<Locale, Translations> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

interface I18nContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh-CN",
  t: zhCN,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("quickly_locale");
    return (saved === "en-US" ? "en-US" : "zh-CN") as Locale;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("quickly_locale", newLocale);
  }, []);

  const t = translations[locale];

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
