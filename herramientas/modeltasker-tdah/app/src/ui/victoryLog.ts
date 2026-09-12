import type { Store } from '../state/store';
import type { Task } from '../types';
import { el, replaceChildren } from '../lib/dom';

function buildVictoryItem(task: Task): HTMLElement {
  const time = task.completedAt
    ? new Date(task.completedAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  return el('div', { className: 'victory-item' }, [
    el('div', {}, [
      el('div', { className: 'victory-item-title' }, [task.title]),
      el('div', { className: 'victory-item-meta' }, [time])
    ]),
    el('span', { className: 'victory-medal' }, ['🏆'])
  ]);
}

export function renderVictoryLog(store: Store): void {
  const content = document.getElementById('victory-log-content');
  const badgeCount = document.getElementById('victory-badge-count');
  if (!content) return;

  const completed = store.getCompletedTasks();
  if (badgeCount) badgeCount.textContent = String(completed.length);

  if (completed.length === 0) {
    replaceChildren(content, el('div', { className: 'empty-state' }, [
      'Aún no hay victorias registradas. Completa tu primera tarea para ver el tachado y el trofeo aquí.'
    ]));
    return;
  }

  replaceChildren(content, ...completed.map(buildVictoryItem));
}

export function updateVictoryLogVisibility(store: Store): void {
  const content = document.getElementById('victory-log-content');
  const toggleBtn = document.getElementById('victory-log-toggle');
  const icon = document.getElementById('victory-toggle-icon');
  const text = document.getElementById('victory-toggle-text');
  const expanded = store.getState().preferences.victoryLogExpanded;

  if (content) content.style.display = expanded ? 'block' : 'none';
  toggleBtn?.setAttribute('aria-expanded', String(expanded));
  if (icon) icon.textContent = expanded ? '▼' : '▶';
  if (text) text.textContent = expanded ? 'Ocultar historial' : 'Ver historial';
}
