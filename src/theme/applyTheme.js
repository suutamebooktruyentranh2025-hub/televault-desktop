export const THEME_STORAGE_KEY = 'televault_theme';
export const PRESET_STORAGE_KEY = 'televault_theme_preset';

export const AVAILABLE_THEMES = [
  {
    id: 'violet',
    nameKey: 'settingsThemePresetViolet',
    descKey: 'settingsThemePresetVioletDesc',
    mode: 'light',
    swatches: {
      light: ['#fafafa', '#ece7f0', '#5a3799'],
      dark: ['#131313', '#202020', '#cdbdff'],
    },
  },
  {
    id: 'catppuccin',
    nameKey: 'settingsThemePresetCatppuccin',
    descKey: 'settingsThemePresetCatppuccinDesc',
    mode: 'light',
    swatches: {
      light: ['#eff1f5', '#ccd0da', '#8839ef'],
      dark: ['#1e1e2e', '#313244', '#cba6f7'],
    },
  },
  {
    id: 'tokyonight',
    nameKey: 'settingsThemePresetTokyonight',
    descKey: 'settingsThemePresetTokyonightDesc',
    mode: 'dark',
    swatches: {
      light: ['#e1e2e7', '#bcbdc4', '#2e7de9'],
      dark: ['#1a1b26', '#24283b', '#7aa2f7'],
    },
  },
  {
    id: 'nord',
    nameKey: 'settingsThemePresetNord',
    descKey: 'settingsThemePresetNordDesc',
    mode: 'light',
    swatches: {
      light: ['#eceff4', '#d8dee9', '#5e81ac'],
      dark: ['#242933', '#3b4252', '#88c0d0'],
    },
  },
  {
    id: 'sepia',
    nameKey: 'settingsThemePresetSepia',
    descKey: 'settingsThemePresetSepiaDesc',
    mode: 'light',
    swatches: {
      light: ['#fbf5eb', '#e4d7c5', '#8d5b4c'],
      dark: ['#1f1916', '#332a25', '#e0a98b'],
    },
  },
  {
    id: 'oled',
    nameKey: 'settingsThemePresetOled',
    descKey: 'settingsThemePresetOledDesc',
    mode: 'dark',
    swatches: {
      light: ['#ffffff', '#d1d5db', '#0f172a'],
      dark: ['#000000', '#1c1c1c', '#38bdf8'],
    },
  },
  {
    id: 'dracula',
    nameKey: 'settingsThemePresetDracula',
    descKey: 'settingsThemePresetDraculaDesc',
    mode: 'dark',
    swatches: {
      light: ['#f8f8f2', '#deded6', '#7b52b9'],
      dark: ['#282a36', '#44475a', '#ff79c6'],
    },
  },
  {
    id: 'github',
    nameKey: 'settingsThemePresetGithub',
    descKey: 'settingsThemePresetGithubDesc',
    mode: 'light',
    swatches: {
      light: ['#ffffff', '#f6f8fa', '#0969da'],
      dark: ['#0d1117', '#161b22', '#2f81f7'],
    },
  },
  {
    id: 'onedark',
    nameKey: 'settingsThemePresetOnedark',
    descKey: 'settingsThemePresetOnedarkDesc',
    mode: 'dark',
    swatches: {
      light: ['#fafafa', '#f0f0f0', '#4078f2'],
      dark: ['#282c34', '#21252b', '#61afef'],
    },
  },
  {
    id: 'rosepine',
    nameKey: 'settingsThemePresetRosepine',
    descKey: 'settingsThemePresetRosepineDesc',
    mode: 'dark',
    swatches: {
      light: ['#faf4ed', '#f2e9de', '#b4637a'],
      dark: ['#191724', '#1f1d2e', '#ebbcba'],
    },
  },
  {
    id: 'emerald',
    nameKey: 'settingsThemePresetEmerald',
    descKey: 'settingsThemePresetEmeraldDesc',
    mode: 'light',
    swatches: {
      light: ['#f4f9f6', '#e6f3eb', '#059669'],
      dark: ['#111915', '#17231d', '#34d399'],
    },
  },
  {
    id: 'cyberpunk',
    nameKey: 'settingsThemePresetCyberpunk',
    descKey: 'settingsThemePresetCyberpunkDesc',
    mode: 'dark',
    swatches: {
      light: ['#fef8ee', '#f8ebd4', '#ff007f'],
      dark: ['#1a102f', '#261b40', '#00f0ff'],
    },
  },
];

export function applyTheme(theme, preset) {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  const modeVal = isDark ? 'dark' : 'light';
  document.documentElement.dataset.theme = modeVal;
  document.documentElement.classList.toggle('dark', isDark);

  const activePreset = preset && AVAILABLE_THEMES.some((t) => t.id === preset) ? preset : 'violet';
  document.documentElement.dataset.preset = activePreset;
  document.documentElement.setAttribute('data-theme-preset', activePreset);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, modeVal);
    localStorage.setItem(PRESET_STORAGE_KEY, activePreset);
  } catch {
    // ignore quota / private mode
  }
}

export function readCachedTheme() {
  try {
    const cached = localStorage.getItem(THEME_STORAGE_KEY);
    return cached === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function readCachedPreset() {
  try {
    const cached = localStorage.getItem(PRESET_STORAGE_KEY);
    if (AVAILABLE_THEMES.some((t) => t.id === cached)) return cached;
    return 'violet';
  } catch {
    return 'violet';
  }
}
