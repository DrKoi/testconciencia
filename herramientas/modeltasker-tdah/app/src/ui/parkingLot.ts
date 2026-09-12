import type { Store } from '../state/store';
import type { Task } from '../types';
import { el, replaceChildren } from '../lib/dom';
import { relativeAge } from '../lib/time';
import { showToast } from '../lib/toast';
import { UNDO_WINDOW_MS } from '../state/store';
import { requestFocusTask } from './focusFlow';

const STALE_PARK_MS = 3 * 24 * 60 * 60 * 1000;

function buildParkedItem(store: Store, task: Task): HTMLElement {
  const isStale = task.parkedAt ? Date.now() - task.parkedAt > STALE_PARK_MS : false;

  return el('div', { className: 'parked-item' + (isStale ? ' parked-item-stale' : '') }, [
    el('div', { className: 'parked-item-content' }, [
      el('div', { className: 'parked-item-title' }, [task.title]),
      el('div', { className: 'parked-item-reason' }, [
        task.parkedReason || 'Pausada temporalmente',
        task.parkedAt ? ` • aparcada ${relativeAge(task.parkedAt)}` : '',
        isStale ? ' · aviso amistoso: lleva tiempo en pausa, sin presión para retomarla' : ''
      ]),
    ]),
    el('div', { className: 'task-item-actions' }, [
      el('button', {
        className: 'unpark-btn',
        title: 'Reanudar foco',
        onclick: () => requestFocusTask(store, task.id)
      }, ['Reanudar Foco']),
      el('button', {
        className: 'delete-item-btn',
        title: 'Eliminar de Parking Lot',
        'aria-label': 'Eliminar tarea aparcada',
        onclick: () => {
          const tokenId = store.deleteTasksSoft([task.id]);
          if (!tokenId) return;
          showToast('Tarea eliminada.', {
            durationMs: UNDO_WINDOW_MS,
            action: { label: 'Deshacer', onClick: () => store.undoDelete(tokenId) }
          });
        }
      }, ['×'])
    ])
  ]);
}

export function renderParkingLot(store: Store): void {
  const content = document.getElementById('parking-lot-content');
  const badgeCount = document.getElementById('parking-badge-count');
  if (!content) return;

  const parked = store.getParkedTasks();
  if (badgeCount) badgeCount.textContent = String(parked.length);

  if (parked.length === 0) {
    replaceChildren(content, el('div', { className: 'empty-state' }, [
      'No hay tareas en el Parking Lot. Cuando necesites pausar una tarea activa sin perderla, apárcala aquí.'
    ]));
    return;
  }

  replaceChildren(content, ...parked.map((t) => buildParkedItem(store, t)));
}

export function updateParkingLotVisibility(store: Store): void {
  const content = document.getElementById('parking-lot-content');
  const toggleBtn = document.getElementById('parking-lot-toggle');
  const icon = document.getElementById('parking-toggle-icon');
  const text = document.getElementById('parking-toggle-text');
  const expanded = store.getState().preferences.parkingLotExpanded;

  if (content) content.style.display = expanded ? 'block' : 'none';
  toggleBtn?.setAttribute('aria-expanded', String(expanded));
  if (icon) icon.textContent = expanded ? '▼' : '▶';
  if (text) text.textContent = expanded ? 'Ocultar' : 'Mostrar';
}
