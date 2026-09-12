import type { Store } from '../state/store';
import { el, replaceChildren } from '../lib/dom';

function buildStatTile(value: number, label: string): HTMLElement {
  return el('div', { className: 'stat-tile' }, [
    el('div', { className: 'stat-value' }, [String(value)]),
    el('div', { className: 'stat-label' }, [label])
  ]);
}

export function renderStatsPanel(store: Store): void {
  const content = document.getElementById('stats-panel-content');
  if (!content) return;
  const stats = store.getStats();

  replaceChildren(content,
    el('div', { className: 'stats-grid' }, [
      buildStatTile(stats.victoriesToday, 'Victorias hoy'),
      buildStatTile(stats.victoriesWeek, 'Victorias esta semana'),
      buildStatTile(stats.totalVictories, 'Victorias totales'),
      buildStatTile(stats.totalMicroStepsCompleted, 'Micro-pasos totales')
    ]),
    el('p', { className: 'stats-footnote' }, [
      'Sin rachas punitivas ni comparaciones: estos números son solo evidencia amable de que avanzaste.'
    ])
  );
}

export function updateStatsPanelVisibility(store: Store): void {
  const content = document.getElementById('stats-panel-content');
  const toggleBtn = document.getElementById('stats-panel-toggle');
  const icon = document.getElementById('stats-toggle-icon');
  const text = document.getElementById('stats-toggle-text');
  const expanded = store.getState().preferences.statsExpanded;

  if (content) content.style.display = expanded ? 'block' : 'none';
  toggleBtn?.setAttribute('aria-expanded', String(expanded));
  if (icon) icon.textContent = expanded ? '▼' : '▶';
  if (text) text.textContent = expanded ? 'Ocultar estadísticas' : 'Ver estadísticas';
}
