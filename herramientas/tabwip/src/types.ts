/**
 * Tipos compartidos. `policy.ts` depende SOLO de este archivo (datos planos),
 * nunca de `chrome.*`, para poder testear la logica de reagrupamiento sin navegador.
 */

export type TabId = number;
export type GroupId = number;

/** Sentinela: el destino "Parking Lot" aun no tiene un groupId real de Chrome asignado. */
export const NEW_PARKING_GROUP = 'NEW_PARKING_GROUP' as const;
export type ParkingGroupTarget = GroupId | typeof NEW_PARKING_GROUP;

export const PARKING_GROUP_TITLE = '🅿️ Parking Lot';
/** Chrome no tiene "amber" en su paleta de grupos; "orange" es el tono nativo mas cercano. */
export const PARKING_GROUP_COLOR = 'orange';

/** Snapshot minimo de una pestana real, tal como la entrega `chrome.tabs.query`. */
export interface TabSnapshot {
  id: TabId;
  groupId: GroupId;
  windowId: number;
}

/**
 * Estado de foco persistido. `parkingGroupId` es `null` hasta que `background.ts`
 * crea el grupo real en Chrome y lo registra con `withParkingGroupId`.
 */
export interface FocusState {
  focusModeOn: boolean;
  focusedTabId: TabId | null;
  parkingGroupId: GroupId | null;
}

export const INITIAL_FOCUS_STATE: FocusState = {
  focusModeOn: false,
  focusedTabId: null,
  parkingGroupId: null,
};

/**
 * Acciones declarativas que `policy.ts` decide y que solo `background.ts` ejecuta
 * contra `chrome.tabs` / `chrome.tabGroups`. Mantener esto como datos (no funciones)
 * es lo que permite testear la decision sin mockear la API del navegador.
 */
export type Action =
  | { type: 'MOVE_TO_PARKING'; tabIds: TabId[]; groupId: ParkingGroupTarget }
  | { type: 'COLLAPSE_PARKING'; groupId: ParkingGroupTarget }
  | { type: 'EXPAND_PARKING'; groupId: GroupId }
  | { type: 'DISSOLVE_PARKING'; groupId: GroupId }
  | { type: 'RELEASE_TAB_FROM_GROUP'; tabId: TabId };

export interface PolicyResult {
  actions: Action[];
  nextState: FocusState;
}

export interface VictoryEntry {
  id: string;
  title: string;
  url: string;
  completedAt: number;
}

export interface Stats {
  today: number;
  week: number;
  total: number;
}

export interface Preferences {
  soundOnComplete: boolean;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_PREFERENCES: Preferences = {
  soundOnComplete: false,
  theme: 'system',
};

/** Snapshot combinado que el popup/options pide al service worker tras cada accion. */
export interface Snapshot {
  focusState: FocusState;
  stats: Stats;
  preferences: Preferences;
}

export interface CompleteResult extends Snapshot {
  completed: boolean;
}

export type RuntimeMessage =
  | { kind: 'getSnapshot' }
  | { kind: 'toggleFocus' }
  | { kind: 'completeActiveTab' }
  | { kind: 'setPreferences'; patch: Partial<Preferences> }
  | { kind: 'resetAll' };
