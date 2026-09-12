import type { Store } from '../state/store';

export function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  if (label) label.textContent = theme === 'dark' ? 'Oscuro' : 'Claro';
}

export function applySound(enabled: boolean): void {
  const icon = document.getElementById('sound-icon');
  const label = document.getElementById('sound-label');
  if (icon) icon.textContent = enabled ? '🔔' : '🔇';
  if (label) label.textContent = enabled ? 'Activo' : 'Silencio';
}

export function wireHeaderControls(store: Store): void {
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    store.toggleTheme();
  });

  document.getElementById('sound-toggle-btn')?.addEventListener('click', () => {
    const enabled = store.toggleSound();
    applySound(enabled);
    if (enabled) import('../lib/sound').then((m) => m.playDopamineChime());
  });
}
