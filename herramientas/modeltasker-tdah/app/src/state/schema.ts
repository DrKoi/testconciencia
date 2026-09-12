import type { AppState, MicroStep, Task, TaskState } from '../types';
import { generateId } from '../lib/id';

export const STORAGE_KEY = 'modeltasker_tdah_state_v2';
export const LEGACY_STORAGE_KEY = 'modeltasker_tdah_state_v1';
export const CURRENT_VERSION = 2;

const VALID_TASK_STATES: TaskState[] = ['backlog', 'active', 'parked', 'completed'];

export function getDefaultState(): AppState {
  return {
    version: CURRENT_VERSION,
    activeTaskId: null,
    tasks: [],
    preferences: {
      theme: 'dark',
      parkingLotExpanded: true,
      victoryLogExpanded: false,
      statsExpanded: false,
      soundEnabled: false
    },
    stats: {
      totalVictories: 0,
      totalMicroStepsCompleted: 0
    }
  };
}

export function cleanMicroStep(raw: any): MicroStep {
  return {
    id: String(raw?.id || generateId('step')),
    text: String(raw?.text || '').trim(),
    completed: Boolean(raw?.completed),
    createdAt: Number(raw?.createdAt) || Date.now(),
    completedAt: raw?.completedAt ? Number(raw.completedAt) : undefined
  };
}

export function cleanTask(raw: any, fallbackOrder: number): Task {
  if (!raw || typeof raw !== 'object') {
    return {
      id: generateId('task'),
      title: 'Tarea recuperada',
      notes: '',
      state: 'backlog',
      order: fallbackOrder,
      createdAt: Date.now(),
      microSteps: []
    };
  }
  return {
    id: String(raw.id || generateId('task')),
    title: String(raw.title || 'Sin título').trim(),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    state: VALID_TASK_STATES.includes(raw.state) ? raw.state : 'backlog',
    order: Number.isFinite(raw.order) ? Number(raw.order) : fallbackOrder,
    createdAt: Number(raw.createdAt) || Date.now(),
    parkedAt: raw.parkedAt ? Number(raw.parkedAt) : undefined,
    parkedReason: raw.parkedReason ? String(raw.parkedReason) : undefined,
    completedAt: raw.completedAt ? Number(raw.completedAt) : undefined,
    microSteps: Array.isArray(raw.microSteps) ? raw.microSteps.map(cleanMicroStep) : []
  };
}

export function sanitizeState(raw: any): AppState {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) {
    throw new Error('Esquema de estado invalido');
  }
  const tasks = raw.tasks.map((t: any, i: number) => cleanTask(t, i));
  return {
    version: CURRENT_VERSION,
    activeTaskId: typeof raw.activeTaskId === 'string' ? raw.activeTaskId : null,
    tasks,
    preferences: {
      theme: raw.preferences?.theme === 'light' ? 'light' : 'dark',
      parkingLotExpanded: raw.preferences?.parkingLotExpanded !== false,
      victoryLogExpanded: raw.preferences?.victoryLogExpanded === true,
      statsExpanded: raw.preferences?.statsExpanded === true,
      soundEnabled: raw.preferences?.soundEnabled === true
    },
    stats: {
      totalVictories: Number(raw.stats?.totalVictories) || 0,
      totalMicroStepsCompleted: Number(raw.stats?.totalMicroStepsCompleted) || 0
    }
  };
}

/** Migra el esquema v1 (archivo unico original) al v2 (proyecto modular), añadiendo `notes` y `order`. */
export function migrateFromV1(rawV1: any): AppState {
  const base = sanitizeState({ ...rawV1, tasks: rawV1?.tasks ?? [] });
  base.tasks = base.tasks.map((t, i) => ({ ...t, order: i }));
  return base;
}
