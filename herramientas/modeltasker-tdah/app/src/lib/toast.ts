export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  isError?: boolean;
  durationMs?: number;
  action?: ToastAction;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function getToastEl(): HTMLElement {
  const el = document.getElementById('dopamine-toast');
  if (!el) throw new Error('Toast container no encontrado');
  return el;
}

export function showToast(message: string, options: ToastOptions = {}): void {
  const toast = getToastEl();
  toast.innerHTML = '';

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  toast.appendChild(text);

  if (options.action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action-btn';
    btn.textContent = options.action.label;
    btn.addEventListener('click', () => {
      options.action!.onClick();
      hideToastNow();
    });
    toast.appendChild(btn);
  }

  toast.className = 'dopamine-toast visible' + (options.isError ? ' toast-error' : '');

  if (hideTimer) clearTimeout(hideTimer);
  const duration = options.durationMs ?? 2800;
  hideTimer = setTimeout(() => {
    toast.className = 'dopamine-toast hidden';
  }, duration);
}

export function hideToastNow(): void {
  const toast = getToastEl();
  if (hideTimer) clearTimeout(hideTimer);
  toast.className = 'dopamine-toast hidden';
}
