export interface ModalOptions {
  title: string;
  bodyHtml: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function getContainer(): HTMLElement {
  const el = document.getElementById('modal-container');
  if (!el) throw new Error('Contenedor de modal no encontrado');
  return el;
}

export function showModal(options: ModalOptions): void {
  const container = getContainer();

  const card = document.createElement('div');
  card.className = 'modal-card';

  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = options.title;
  card.appendChild(title);

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.innerHTML = options.bodyHtml;
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  if (options.cancelText) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn secondary';
    cancelBtn.textContent = options.cancelText;
    cancelBtn.addEventListener('click', () => {
      closeModal();
      options.onCancel?.();
    });
    actions.appendChild(cancelBtn);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'modal-btn ' + (options.danger ? 'danger' : 'primary');
  confirmBtn.textContent = options.confirmText;
  confirmBtn.addEventListener('click', () => {
    closeModal();
    options.onConfirm?.();
  });
  actions.appendChild(confirmBtn);

  card.appendChild(actions);
  container.innerHTML = '';
  container.appendChild(card);
  container.classList.remove('hidden');
  container.setAttribute('aria-hidden', 'false');
  confirmBtn.focus();
}

export function closeModal(): void {
  const container = getContainer();
  container.classList.add('hidden');
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = '';
}

export function isModalOpen(): boolean {
  return !getContainer().classList.contains('hidden');
}
