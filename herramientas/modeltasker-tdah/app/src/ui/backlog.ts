import type { Store } from '../state/store';
import type { Task } from '../types';
import { el, replaceChildren } from '../lib/dom';
import { relativeAge } from '../lib/time';
import { showToast } from '../lib/toast';
import { UNDO_WINDOW_MS } from '../state/store';
import { requestFocusTask } from './focusFlow';

let searchQuery = '';
let selectionMode = false;
let selectedIds: Set<string> = new Set();
let draggedId: string | null = null;

function exitSelectionMode(): void {
  selectionMode = false;
  selectedIds = new Set();
}

function buildTaskItem(store: Store, task: Task): HTMLElement {
  const titleEl = el('div', { className: 'task-item-title', tabIndex: 0, title: 'Doble clic para editar' }, [task.title]);

  titleEl.addEventListener('dblclick', () => {
    const input = el('input', { className: 'title-edit-input inline', type: 'text', value: task.title }) as HTMLInputElement;
    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      const trimmed = input.value.trim();
      if (trimmed && trimmed !== task.title) store.updateTaskTitle(task.id, trimmed);
      else input.replaceWith(titleEl);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); settled = true; input.replaceWith(titleEl); }
    });
    input.addEventListener('blur', commit);
    titleEl.replaceWith(input);
    input.focus();
    input.select();
  });

  const metaParts: string[] = [relativeAge(task.createdAt)];
  if (task.microSteps.length > 0) {
    metaParts.push(`${task.microSteps.filter((s) => s.completed).length}/${task.microSteps.length} micro-pasos`);
  }
  if (task.notes.trim()) metaParts.push('📝 nota');

  const content = el('div', { className: 'task-item-content' }, [
    titleEl,
    el('div', { className: 'task-item-meta' }, [metaParts.join(' • ')])
  ]);

  const checkbox = el('input', {
    type: 'checkbox',
    className: 'task-select-checkbox',
    'aria-label': 'Seleccionar tarea',
    checked: selectedIds.has(task.id)
  }) as HTMLInputElement;
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedIds.add(task.id);
    else selectedIds.delete(task.id);
    renderBacklog(store);
  });

  const focusBtn = el('button', {
    className: 'task-focus-btn',
    title: 'Enfocar en modo WIP=1',
    onclick: () => requestFocusTask(store, task.id)
  }, ['Enfocar (WIP=1)']);

  const deleteBtn = el('button', {
    className: 'delete-item-btn',
    title: 'Eliminar del backlog',
    'aria-label': 'Eliminar tarea',
    onclick: () => {
      const tokenId = store.deleteTasksSoft([task.id]);
      if (!tokenId) return;
      showToast('Tarea eliminada.', {
        durationMs: UNDO_WINDOW_MS,
        action: { label: 'Deshacer', onClick: () => store.undoDelete(tokenId) }
      });
    }
  }, ['×']);

  const actions = el('div', { className: 'task-item-actions' }, [selectionMode ? null : focusBtn, selectionMode ? null : deleteBtn]);

  const item = el('div', {
    className: 'task-item' + (draggedId === task.id ? ' dragging' : ''),
    dataset: { taskId: task.id },
    draggable: selectionMode ? 'false' : 'true'
  }, [
    selectionMode ? checkbox : el('span', { className: 'drag-handle', title: 'Arrastrar para reordenar' }, ['⠿']),
    content,
    actions
  ]);

  if (!selectionMode) {
    item.addEventListener('dragstart', () => {
      draggedId = task.id;
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      draggedId = null;
      renderBacklog(store);
    });
    item.addEventListener('dragover', (e) => e.preventDefault());
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedId || draggedId === task.id) return;
      const ordered = store.getBacklogTasks().map((t) => t.id);
      const fromIdx = ordered.indexOf(draggedId);
      const toIdx = ordered.indexOf(task.id);
      if (fromIdx === -1 || toIdx === -1) return;
      ordered.splice(toIdx, 0, ordered.splice(fromIdx, 1)[0]);
      store.reorderBacklog(ordered);
    });
  }

  return item;
}

function buildToolbar(store: Store): HTMLElement {
  const searchInput = el('input', {
    type: 'search',
    className: 'backlog-search-input',
    placeholder: '🔎 Buscar en el Backlog (opcional)...',
    value: searchQuery,
    'aria-label': 'Buscar en el backlog'
  }) as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderBacklog(store);
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  });

  const selectToggle = el('button', {
    className: 'subtle-btn',
    onclick: () => {
      if (selectionMode) exitSelectionMode();
      else selectionMode = true;
      renderBacklog(store);
    }
  }, [selectionMode ? 'Cancelar selección' : '☑ Seleccionar varias']);

  const bulkDeleteBtn = selectionMode && selectedIds.size > 0
    ? el('button', {
        className: 'subtle-btn btn-danger-text',
        onclick: () => {
          const ids = Array.from(selectedIds);
          const count = ids.length;
          const tokenId = store.deleteTasksSoft(ids);
          exitSelectionMode();
          if (!tokenId) return;
          showToast(`${count} tarea${count > 1 ? 's' : ''} eliminada${count > 1 ? 's' : ''}.`, {
            durationMs: UNDO_WINDOW_MS,
            action: { label: 'Deshacer', onClick: () => store.undoDelete(tokenId) }
          });
        }
      }, [`🗑 Eliminar seleccionadas (${selectedIds.size})`])
    : null;

  return el('div', { className: 'backlog-toolbar' }, [searchInput, selectToggle, bulkDeleteBtn]);
}

export function renderBacklog(store: Store): void {
  const listContainer = document.getElementById('backlog-list');
  const badgeCount = document.getElementById('backlog-badge-count');
  const dimmedNotice = document.getElementById('backlog-dimmed-notice');
  const toolbarContainer = document.getElementById('backlog-toolbar-container');
  if (!listContainer) return;

  const allBacklog = store.getBacklogTasks();
  const filtered = searchQuery.trim()
    ? allBacklog.filter((t) => t.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : allBacklog;

  if (badgeCount) badgeCount.textContent = String(allBacklog.length);

  const isWipActive = store.hasActiveTask();
  if (dimmedNotice) dimmedNotice.className = isWipActive && !selectionMode ? 'dimmed-notice' : 'dimmed-notice hidden';
  listContainer.className = isWipActive && !selectionMode ? 'tasks-list backlog-dimmed' : 'tasks-list';

  if (toolbarContainer) replaceChildren(toolbarContainer as HTMLElement, buildToolbar(store));

  if (allBacklog.length === 0) {
    replaceChildren(listContainer, el('div', { className: 'empty-state' }, [
      'Bandeja vacía. No tienes tareas acumuladas en el backlog. ¡Captura una arriba con total libertad!'
    ]));
    return;
  }

  if (filtered.length === 0) {
    replaceChildren(listContainer, el('div', { className: 'empty-state' }, [
      `Sin resultados para "${searchQuery}". Prueba otra palabra o limpia la búsqueda.`
    ]));
    return;
  }

  replaceChildren(listContainer, ...filtered.map((t) => buildTaskItem(store, t)));
}
