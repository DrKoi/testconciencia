/**
 * Pagina de preferencias. Igual que el popup, solo envia mensajes al service
 * worker; no contiene logica de negocio propia.
 */
const soundToggle = document.getElementById('soundToggle');
const themeSelect = document.getElementById('themeSelect');
const resetBtn = document.getElementById('resetBtn');
const resetFeedback = document.getElementById('resetFeedback');
function send(message) {
    return chrome.runtime.sendMessage(message);
}
function applyTheme(theme) {
    if (theme === 'system')
        delete document.documentElement.dataset.theme;
    else
        document.documentElement.dataset.theme = theme;
}
function renderPreferences(preferences) {
    soundToggle.checked = preferences.soundOnComplete;
    themeSelect.value = preferences.theme;
    applyTheme(preferences.theme);
}
async function load() {
    const snapshot = await send({ kind: 'getSnapshot' });
    renderPreferences(snapshot.preferences);
}
soundToggle.addEventListener('change', async () => {
    const preferences = await send({
        kind: 'setPreferences',
        patch: { soundOnComplete: soundToggle.checked },
    });
    renderPreferences(preferences);
});
themeSelect.addEventListener('change', async () => {
    const preferences = await send({
        kind: 'setPreferences',
        patch: { theme: themeSelect.value },
    });
    renderPreferences(preferences);
});
resetBtn.addEventListener('click', async () => {
    const confirmed = window.confirm('Esto borra el Victory Log, las estadisticas y las preferencias. ¿Continuar?');
    if (!confirmed)
        return;
    const snapshot = await send({ kind: 'resetAll' });
    renderPreferences(snapshot.preferences);
    resetFeedback.textContent = 'Datos borrados.';
    window.setTimeout(() => {
        resetFeedback.textContent = '';
    }, 2500);
});
void load();
export {};
