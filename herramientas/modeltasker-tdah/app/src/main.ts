import './style.css';
import { store } from './state/store';
import { applySound, applyTheme, wireHeaderControls } from './ui/theme';
import { wireBackupControls } from './ui/backup';
import { wireCapture } from './ui/capture';
import { renderActiveWip } from './ui/focusCard';
import { renderBacklog } from './ui/backlog';
import { renderParkingLot, updateParkingLotVisibility } from './ui/parkingLot';
import { renderVictoryLog, updateVictoryLogVisibility } from './ui/victoryLog';
import { renderStatsPanel, updateStatsPanelVisibility } from './ui/statsPanel';
import { wireGlobalShortcuts } from './ui/shortcuts';

function renderAll(): void {
  const prefs = store.getState().preferences;
  applyTheme(prefs.theme);
  applySound(prefs.soundEnabled);

  renderActiveWip(store);
  renderBacklog(store);
  renderParkingLot(store);
  updateParkingLotVisibility(store);
  renderVictoryLog(store);
  updateVictoryLogVisibility(store);
  renderStatsPanel(store);
  updateStatsPanelVisibility(store);
}

function wireCollapsibleToggles(): void {
  document.getElementById('parking-lot-toggle')?.addEventListener('click', () => {
    store.togglePreference('parkingLotExpanded');
  });
  document.getElementById('victory-log-toggle')?.addEventListener('click', () => {
    store.togglePreference('victoryLogExpanded');
  });
  document.getElementById('stats-panel-toggle')?.addEventListener('click', () => {
    store.togglePreference('statsExpanded');
  });
}

function bootstrap(): void {
  wireHeaderControls(store);
  wireBackupControls(store);
  wireCapture(store);
  wireCollapsibleToggles();
  wireGlobalShortcuts(store);

  store.subscribe(renderAll);
  renderAll();
}

bootstrap();
