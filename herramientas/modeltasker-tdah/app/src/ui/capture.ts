import type { Store } from '../state/store';
import { showToast } from '../lib/toast';

export function wireCapture(store: Store): void {
  const form = document.getElementById('task-capture-form') as HTMLFormElement | null;
  const input = document.getElementById('task-capture-input') as HTMLInputElement | null;
  if (!form || !input) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const task = store.captureTask(input.value);
    if (!task) {
      input.focus();
      return;
    }
    input.value = '';
    input.focus();
    showToast('Tarea guardada en el Backlog.');
  });
}

export function focusCaptureInput(): void {
  const input = document.getElementById('task-capture-input') as HTMLInputElement | null;
  input?.focus();
}
