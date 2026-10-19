import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AVAILABLE_THEMES,
  applyTheme,
  readCachedPreset,
  readCachedTheme,
} from '../theme/applyTheme';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  darkMode: false,
  presetTheme: 'violet',
  setPresetTheme: () => {},
  availableThemes: AVAILABLE_THEMES,
});

const settingsApi = window.televault?.settings;

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readCachedTheme);
  const [presetTheme, setPresetThemeState] = useState(readCachedPreset);

  useEffect(() => {
    applyTheme(theme, presetTheme);
  }, [theme, presetTheme]);

  useEffect(() => {
    applyTheme(readCachedTheme(), readCachedPreset());
    void settingsApi?.get().then((result) => {
      if (result?.ok) {
        if (result.theme) {
          setThemeState(result.theme === 'dark' ? 'dark' : 'light');
        }
        if (result.themePreset && AVAILABLE_THEMES.some((t) => t.id === result.themePreset)) {
          setPresetThemeState(result.themePreset);
        }
      }
    });
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    setThemeState(value);
    applyTheme(value, presetTheme);
    void settingsApi?.set?.({ theme: value });
  }, [presetTheme]);

  const setPresetTheme = useCallback((preset) => {
    if (AVAILABLE_THEMES.some((t) => t.id === preset)) {
      setPresetThemeState(preset);
      applyTheme(theme, preset);
      void settingsApi?.set?.({ themePreset: preset });
    }
  }, [theme]);

  const darkMode = theme === 'dark';

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      darkMode,
      presetTheme,
      setPresetTheme,
      availableThemes: AVAILABLE_THEMES,
    }),
    [theme, setTheme, darkMode, presetTheme, setPresetTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
