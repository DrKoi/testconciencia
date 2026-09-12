/**
 * UI del popup. No decide nada por si mismo: solo pide un `Snapshot` al service
 * worker y envia mensajes de accion. El sonido vive aqui (no en el service
 * worker) porque MV3 no expone Web Audio dentro de un service worker.
 */
const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const statusSub = document.getElementById('statusSub');
const toggleFocusBtn = document.getElementById('toggleFocusBtn');
const completeBtn = document.getElementById('completeBtn');
const toast = document.getElementById('toast');
const statToday = document.getElementById('statToday');
const statWeek = document.getElementById('statWeek');
const statTotal = document.getElementById('statTotal');
const optionsLink = document.getElementById('optionsLink');
function send(message) {
    return chrome.runtime.sendMessage(message);
}
function applyTheme(theme) {
    if (theme === 'system')
        delete document.documentElement.dataset.theme;
    else
        document.documentElement.dataset.theme = theme;
}
function render(snapshot) {
    const { focusState, stats } = snapshot;
    applyTheme(snapshot.preferences.theme);
    dot.classList.toggle('on', focusState.focusModeOn);
    statusText.textContent = focusState.focusModeOn ? 'Modo Foco activo' : 'Modo Foco apagado';
    statusSub.textContent = focusState.focusModeOn
        ? 'Las demas pestanas estan en 🅿️ Parking Lot (colapsado).'
        : 'Activalo para aislar la pestana actual y aparcar el resto.';
    toggleFocusBtn.textContent = focusState.focusModeOn ? 'Salir de Foco' : '🎯 Activar Foco (WIP=1)';
    toggleFocusBtn.disabled = false;
    completeBtn.disabled = false;
    statToday.textContent = String(stats.today);
    statWeek.textContent = String(stats.week);
    statTotal.textContent = String(stats.total);
}
function showToast(message) {
    toast.textContent = message;
    window.setTimeout(() => {
        if (toast.textContent === message)
            toast.textContent = '';
    }, 2200);
}
/** Tono corto y suave (no alarmante) para el cierre dopaminergico. Apagado por defecto. */
function playChime() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
        osc.onended = () => void ctx.close();
    }
    catch {
        /* Web Audio puede no estar disponible en algunos contextos; el sonido es opcional. */
    }
}
async function refresh() {
    const snapshot = await send({ kind: 'getSnapshot' });
    render(snapshot);
}
toggleFocusBtn.addEventListener('click', async () => {
    toggleFocusBtn.disabled = true;
    const snapshot = await send({ kind: 'toggleFocus' });
    render(snapshot);
});
completeBtn.addEventListener('click', async () => {
    completeBtn.disabled = true;
    const result = await send({ kind: 'completeActiveTab' });
    render(result);
    if (result.completed) {
        showToast('✨ Victoria registrada');
        if (result.preferences.soundOnComplete)
            playChime();
    }
    else {
        showToast('No hay pestana activa para completar');
    }
});
optionsLink.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
});
void refresh();
export {};
