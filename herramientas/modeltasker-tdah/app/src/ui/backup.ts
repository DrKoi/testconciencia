import type { Store } from '../state/store';
import { showModal } from '../lib/modal';
import { showToast } from '../lib/toast';

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function wireBackupControls(store: Store): void {
  document.getElementById('export-json-btn')?.addEventListener('click', () => {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modeltasker-backup-${todayStamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('💾 Respaldo exportado correctamente.');
  });

  const importInput = document.getElementById('import-json-input') as HTMLInputElement | null;
  importInput?.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importJSON(String(reader.result));
        showToast('📂 Respaldo importado. Tus datos fueron restaurados.');
      } catch (err) {
        console.error(err);
        showToast('⚠️ El archivo no es un respaldo válido. Tus datos actuales no fueron modificados.', {
          isError: true,
          durationMs: 4200
        });
      } finally {
        importInput.value = '';
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('reset-app-btn')?.addEventListener('click', () => {
    showModal({
      title: '¿Reiniciar la aplicación?',
      bodyHtml:
        'Esta acción borrará todas las tareas locales y restablecerá el sistema a un estado inicial limpio. ' +
        'Si quieres conservar un respaldo, exporta primero con el botón <strong>💾 Exportar</strong>.',
      confirmText: 'Reiniciar todo de forma segura',
      cancelText: 'Cancelar',
      danger: true,
      onConfirm: () => {
        store.resetAll();
        showToast('🔄 Sistema reiniciado. Tabula rasa lista para hoy.');
      }
    });
  });
}
