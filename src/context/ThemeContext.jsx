import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, readCachedTheme } from '../theme/applyTheme';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
});

const settingsApi = window.televault?.settings;

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readCachedTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyTheme(readCachedTheme());
    void settingsApi?.get().then((result) => {
      if (result?.ok && result.theme) {
        setThemeState(result.theme === 'dark' ? 'dark' : 'light');
      }
    });
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    setThemeState(value);
    applyTheme(value);
    void settingsApi?.set?.({ theme: value });
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
