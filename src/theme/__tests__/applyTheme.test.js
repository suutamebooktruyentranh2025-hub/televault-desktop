import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVAILABLE_THEMES,
  applyTheme,
  readCachedPreset,
  readCachedTheme,
  THEME_STORAGE_KEY,
  PRESET_STORAGE_KEY,
} from '../applyTheme.js';
import { vi, en } from '../../i18n/locales.js';

test('AVAILABLE_THEMES contains all 12 curated themes matching crawler_pc', () => {
  assert.equal(AVAILABLE_THEMES.length, 12);
  const ids = AVAILABLE_THEMES.map((t) => t.id);
  assert.deepEqual(ids, [
    'violet',
    'catppuccin',
    'tokyonight',
    'nord',
    'sepia',
    'oled',
    'dracula',
    'github',
    'onedark',
    'rosepine',
    'emerald',
    'cyberpunk',
  ]);
});

test('every theme has swatches with 3 colors for light and dark', () => {
  for (const t of AVAILABLE_THEMES) {
    assert.ok(t.swatches.light, `theme ${t.id} must have light swatches`);
    assert.equal(t.swatches.light.length, 3, `theme ${t.id} light must have 3 swatches`);
    assert.ok(t.swatches.dark, `theme ${t.id} must have dark swatches`);
    assert.equal(t.swatches.dark.length, 3, `theme ${t.id} dark must have 3 swatches`);
  }
});

test('every theme nameKey and descKey exists in both vi and en locales', () => {
  for (const t of AVAILABLE_THEMES) {
    assert.ok(vi[t.nameKey], `vi.${t.nameKey} missing for theme ${t.id}`);
    assert.ok(en[t.nameKey], `en.${t.nameKey} missing for theme ${t.id}`);
    assert.ok(vi[t.descKey], `vi.${t.descKey} missing for theme ${t.id}`);
    assert.ok(en[t.descKey], `en.${t.descKey} missing for theme ${t.id}`);
  }
  assert.ok(vi.settingsThemePreset);
  assert.ok(en.settingsThemePreset);
  assert.ok(vi.settingsThemePresetHint);
  assert.ok(en.settingsThemePresetHint);
});

test('readCachedTheme falls back safely to light', () => {
  assert.equal(readCachedTheme(), 'light');
});

test('readCachedPreset falls back safely to violet', () => {
  assert.equal(readCachedPreset(), 'violet');
});
