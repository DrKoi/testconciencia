import type { Store } from '../state/store';
import { showModal } from '../lib/modal';
import { showToast } from '../lib/toast';

function focusMicrostepInputSoon(): void {
  setTimeout(() => {
    (document.getElementById('jit-microstep-input') as HTMLInputElement | null)?.focus();
  }, 60);
}

/** Intenta enfocar una tarea del Backlog o Parking Lot, resolviendo el conflicto de WIP=1 con un dialogo. */
export function requestFocusTask(store: Store, taskId: string): void {
  const result = store.focusTask(taskId);
  if (result.ok) {
    showToast('Tarea en Foco Único (WIP=1) 🎯');
    focusMicrostepInputSoon();
    return;
  }

  const current = result.current;
  const target = store.getState().tasks.find((t) => t.id === taskId);
  if (!target) return;

  showModal({
    title: 'Límite Estricto WIP=1',
    bodyHtml:
      `Ya tienes una tarea en foco activo: <strong>${escapeForModal(current.title)}</strong>.<br><br>` +
      `¿Deseas aparcar la actual en el Parking Lot para concentrarte en <strong>${escapeForModal(target.title)}</strong>?`,
    confirmText: 'Aparcar actual y Enfocar nueva',
    cancelText: 'Continuar con la actual',
    onConfirm: () => {
      store.swapFocus(current.id, target.id);
      showToast('Tarea previa aparcada. ¡Nuevo foco activado! 🎯');
      focusMicrostepInputSoon();
    }
  });
}

function escapeForModal(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
