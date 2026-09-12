/**
 * Wrapper fino sobre `chrome.storage.local`. Unico punto de lectura/escritura de
 * persistencia: estado de foco, Victory Log, estadisticas derivadas y preferencias.
 * Sin rachas punitivas: las estadisticas solo cuentan victorias, nunca dias fallidos.
 */
import { DEFAULT_PREFERENCES, INITIAL_FOCUS_STATE } from './types.js';
const KEY_FOCUS_STATE = 'focusState';
const KEY_PREFERENCES = 'preferences';
const KEY_VICTORY_LOG = 'victoryLog';
const MAX_VICTORY_LOG_ENTRIES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
async function readKey(key, fallback) {
    const stored = await chrome.storage.local.get(key);
    const value = stored[key];
    return value === undefined ? fallback : value;
}
export async function getFocusState() {
    return readKey(KEY_FOCUS_STATE, INITIAL_FOCUS_STATE);
}
export async function setFocusState(state) {
    await chrome.storage.local.set({ [KEY_FOCUS_STATE]: state });
}
export async function getPreferences() {
    const stored = await readKey(KEY_PREFERENCES, {});
    return { ...DEFAULT_PREFERENCES, ...stored };
}
export async function setPreferences(patch) {
    const current = await getPreferences();
    const next = { ...current, ...patch };
    await chrome.storage.local.set({ [KEY_PREFERENCES]: next });
    return next;
}
export async function getVictoryLog() {
    return readKey(KEY_VICTORY_LOG, []);
}
export async function addVictory(title, url) {
    const log = await getVictoryLog();
    const entry = {
        id: crypto.randomUUID(),
        title: title || '(sin titulo)',
        url,
        completedAt: Date.now(),
    };
    const next = [entry, ...log].slice(0, MAX_VICTORY_LOG_ENTRIES);
    await chrome.storage.local.set({ [KEY_VICTORY_LOG]: next });
    return computeStats(next);
}
export async function getStats() {
    return computeStats(await getVictoryLog());
}
function computeStats(log) {
    const now = Date.now();
    let today = 0;
    let week = 0;
    for (const entry of log) {
        const age = now - entry.completedAt;
        if (age < DAY_MS)
            today += 1;
        if (age < WEEK_MS)
            week += 1;
    }
    return { today, week, total: log.length };
}
export async function resetAll() {
    await chrome.storage.local.clear();
}
