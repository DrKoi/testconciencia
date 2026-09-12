/**
 * Pagina de preferencias. Igual que el popup, solo envia mensajes al service
 * worker; no contiene logica de negocio propia.
 */

import { Preferences, RuntimeMessage, Snapshot } from './types.js';

const soundToggle = document.getElementById('soundToggle') as HTMLInputElement;
const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const resetFeedback = document.getElementById('resetFeedback') as HTMLDivElement;

function send<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

function applyTheme(theme: Preferences['theme']): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function renderPreferences(preferences: Preferences): void {
  soundToggle.checked = preferences.soundOnComplete;
  themeSelect.value = preferences.theme;
  applyTheme(preferences.theme);
}

async function load(): Promise<void> {
  const snapshot = await send<Snapshot>({ kind: 'getSnapshot' });
  renderPreferences(snapshot.preferences);
}

soundToggle.addEventListener('change', async () => {
  const preferences = await send<Preferences>({
    kind: 'setPreferences',
    patch: { soundOnComplete: soundToggle.checked },
  });
  renderPreferences(preferences);
});

themeSelect.addEventListener('change', async () => {
  const preferences = await send<Preferences>({
    kind: 'setPreferences',
    patch: { theme: themeSelect.value as Preferences['theme'] },
  });
  renderPreferences(preferences);
});

resetBtn.addEventListener('click', async () => {
  const confirmed = window.confirm('Esto borra el Victory Log, las estadisticas y las preferencias. ¿Continuar?');
  if (!confirmed) return;
  const snapshot = await send<Snapshot>({ kind: 'resetAll' });
  renderPreferences(snapshot.preferences);
  resetFeedback.textContent = 'Datos borrados.';
  window.setTimeout(() => {
    resetFeedback.textContent = '';
  }, 2500);
});

void load();
