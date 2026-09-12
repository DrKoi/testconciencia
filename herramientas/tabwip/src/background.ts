/**
 * Service worker: unico lugar que llama a `chrome.tabs` / `chrome.tabGroups`.
 * Orquesta eventos del navegador, delega TODAS las decisiones a `policy.ts`
 * (logica pura) y persiste el resultado via `storage.ts`.
 */

import * as policy from './policy.js';
import * as storage from './storage.js';
import {
  Action,
  CompleteResult,
  FocusState,
  NEW_PARKING_GROUP,
  PARKING_GROUP_COLOR,
  PARKING_GROUP_TITLE,
  RuntimeMessage,
  Snapshot,
} from './types.js';

async function buildSnapshot(focusState: FocusState): Promise<Snapshot> {
  const [stats, preferences] = await Promise.all([storage.getStats(), storage.getPreferences()]);
  return { focusState, stats, preferences };
}

/**
 * Ejecuta el plan de `policy.ts` contra la API real de Chrome. Devuelve el
 * `FocusState` con `parkingGroupId` resuelto si hizo falta crear el grupo.
 */
async function executeActions(actions: Action[], state: FocusState): Promise<FocusState> {
  let parkingGroupId = state.parkingGroupId;

  for (const action of actions) {
    switch (action.type) {
      case 'MOVE_TO_PARKING': {
        if (action.groupId !== NEW_PARKING_GROUP) {
          await safeGroup(action.tabIds, action.groupId);
        } else if (parkingGroupId !== null) {
          await safeGroup(action.tabIds, parkingGroupId);
        } else {
          parkingGroupId = await chrome.tabs.group({ tabIds: action.tabIds });
          await chrome.tabGroups.update(parkingGroupId, {
            title: PARKING_GROUP_TITLE,
            color: PARKING_GROUP_COLOR,
          });
        }
        break;
      }
      case 'COLLAPSE_PARKING': {
        const groupId = action.groupId === NEW_PARKING_GROUP ? parkingGroupId : action.groupId;
        if (groupId !== null) await chrome.tabGroups.update(groupId, { collapsed: true });
        break;
      }
      case 'EXPAND_PARKING':
        await safeUpdateGroup(action.groupId, { collapsed: false });
        break;
      case 'DISSOLVE_PARKING': {
        const tabsInGroup = await chrome.tabs.query({ groupId: action.groupId });
        const ids = tabsInGroup.map((t) => t.id).filter((id): id is number => id !== undefined);
        if (ids.length > 0) await safeUngroup(ids);
        break;
      }
      case 'RELEASE_TAB_FROM_GROUP':
        await safeUngroup([action.tabId]);
        break;
    }
  }

  if (parkingGroupId !== null && parkingGroupId !== state.parkingGroupId) {
    return policy.withParkingGroupId(state, parkingGroupId);
  }
  return state;
}

/** Una pestana puede haberse cerrado entre la decision y la ejecucion; se ignora el error. */
async function safeGroup(tabIds: number[], groupId: number): Promise<void> {
  try {
    await chrome.tabs.group({ tabIds, groupId });
  } catch {
    /* no-op */
  }
}

async function safeUngroup(tabIds: number[]): Promise<void> {
  try {
    await chrome.tabs.ungroup(tabIds);
  } catch {
    /* no-op */
  }
}

async function safeUpdateGroup(groupId: number, props: chrome.tabGroups.UpdateProperties): Promise<void> {
  try {
    await chrome.tabGroups.update(groupId, props);
  } catch {
    /* el grupo pudo haber sido eliminado (ultima pestana del Parking Lot cerrada) */
  }
}

async function getFocusedWindowActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function activateFocus(): Promise<Snapshot> {
  const state = await storage.getFocusState();
  const activeTab = await getFocusedWindowActiveTab();
  if (!activeTab || activeTab.id === undefined) return buildSnapshot(state);

  const allTabs = await chrome.tabs.query({});
  const allTabIds = allTabs.map((t) => t.id).filter((id): id is number => id !== undefined);

  const { actions, nextState } = policy.planActivateFocus(allTabIds, activeTab.id, state);
  const resolvedState = await executeActions(actions, nextState);
  await storage.setFocusState(resolvedState);
  return buildSnapshot(resolvedState);
}

async function deactivateFocus(): Promise<Snapshot> {
  const state = await storage.getFocusState();
  const { actions, nextState } = policy.planDeactivateFocus(state);
  const resolvedState = await executeActions(actions, nextState);
  await storage.setFocusState(resolvedState);
  return buildSnapshot(resolvedState);
}

async function toggleFocus(): Promise<Snapshot> {
  const state = await storage.getFocusState();
  return state.focusModeOn ? deactivateFocus() : activateFocus();
}

function notifyVictory(title: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '✅ Victoria registrada',
    message: title || '(sin titulo)',
    priority: 0,
  });
}

/**
 * Cierre dopaminergico: registra la victoria, notifica, y cierra la pestana.
 * Si era la unica pestana de su ventana, abre una en blanco primero para no
 * cerrar la ventana (o el navegador) como efecto secundario inesperado.
 */
async function completeActiveTab(): Promise<CompleteResult> {
  const state = await storage.getFocusState();
  const activeTab = await getFocusedWindowActiveTab();
  if (!activeTab || activeTab.id === undefined) {
    return { ...(await buildSnapshot(state)), completed: false };
  }

  const stats = await storage.addVictory(activeTab.title ?? '', activeTab.url ?? '');
  notifyVictory(activeTab.title ?? '');

  const siblingTabs = await chrome.tabs.query({ windowId: activeTab.windowId });
  if (siblingTabs.length <= 1) {
    await chrome.tabs.create({ windowId: activeTab.windowId });
  }

  const { nextState } = policy.planTabClosed(state, activeTab.id);
  await storage.setFocusState(nextState);
  await chrome.tabs.remove(activeTab.id);

  const preferences = await storage.getPreferences();
  return { focusState: nextState, stats, preferences, completed: true };
}

async function handleMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.kind) {
    case 'getSnapshot':
      return buildSnapshot(await storage.getFocusState());
    case 'toggleFocus':
      return toggleFocus();
    case 'completeActiveTab':
      return completeActiveTab();
    case 'setPreferences':
      return storage.setPreferences(message.patch);
    case 'resetAll':
      await storage.resetAll();
      return buildSnapshot(await storage.getFocusState());
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-focus') void toggleFocus();
  if (command === 'complete-active-tab') void completeActiveTab();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const state = await storage.getFocusState();
  const { actions, nextState } = policy.planTabActivated(state, activeInfo.tabId);
  if (actions.length === 0 && nextState === state) return;
  const resolvedState = await executeActions(actions, nextState);
  await storage.setFocusState(resolvedState);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined) return;
  const state = await storage.getFocusState();
  const { nextState } = policy.planTabCreated(state, tab.id);
  if (nextState !== state) await storage.setFocusState(nextState);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await storage.getFocusState();
  const { nextState } = policy.planTabClosed(state, tabId);
  if (nextState !== state) await storage.setFocusState(nextState);
});
