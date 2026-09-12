import type { Store } from '../state/store';
import { isModalOpen, closeModal } from '../lib/modal';
import { showToast } from '../lib/toast';
import { focusCaptureInput } from './capture';

export function wireGlobalShortcuts(store: Store): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalOpen()) {
      e.preventDefault();
      closeModal();
      return;
    }

    if (!e.altKey) return;

    const key = e.key.toLowerCase();
    switch (key) {
      case 'n':
        e.preventDefault();
        focusCaptureInput();
        break;
      case 'm': {
        e.preventDefault();
        const jitInput = document.getElementById('jit-microstep-input') as HTMLInputElement | null;
        jitInput?.focus();
        break;
      }
      case 'p':
        e.preventDefault();
        if (store.parkActiveTask()) showToast('Tarea aparcada en el Parking Lot. Retómala cuando quieras sin culpa. ⏸');
        break;
      case 'c':
        e.preventDefault();
        if (store.completeActiveTask()) showToast('🎉 ¡Victoria completada! Tarea registrada en tu historial.');
        break;
      case 'l':
        e.preventDefault();
        store.togglePreference('parkingLotExpanded');
        break;
      case 'v':
        e.preventDefault();
        store.togglePreference('victoryLogExpanded');
        break;
      default:
        break;
    }
  });
}
