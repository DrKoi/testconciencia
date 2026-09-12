import type { AppState, PendingDeletion, Task } from '../types';
import { generateId } from '../lib/id';
import { isSameCalendarDay, isSameISOWeek } from '../lib/time';
import { CURRENT_VERSION, LEGACY_STORAGE_KEY, STORAGE_KEY, getDefaultState, migrateFromV1, sanitizeState } from './schema';

export const UNDO_WINDOW_MS = 10000;

type Listener = () => void;

export class Store {
  private state: AppState;
  private listeners: Set<Listener> = new Set();
  private pendingDeletions: Map<string, PendingDeletion> = new Map();

  constructor() {
    this.state = this.load();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private load(): AppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return sanitizeState(parsed);
      }
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        const migrated = migrateFromV1(parsedLegacy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      const fresh = getDefaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    } catch (err) {
      console.warn('Recuperacion de almacenamiento fallida, restaurando estado base:', err);
      const healed = getDefaultState();
      try {
        const damaged = localStorage.getItem(STORAGE_KEY);
        if (damaged) localStorage.setItem(`modeltasker_corrupted_backup_${Date.now()}`, damaged);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(healed));
      } catch {
        /* almacenamiento no disponible; continua en memoria */
      }
      return healed;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.error('Error al persistir en localStorage:', err);
      throw err;
    }
  }

  private commit(): void {
    this.save();
    this.notify();
  }

  getState(): Readonly<AppState> {
    return this.state;
  }

  getActiveTask(): Task | null {
    if (!this.state.activeTaskId) return null;
    return this.state.tasks.find((t) => t.id === this.state.activeTaskId && t.state === 'active') || null;
  }

  getBacklogTasks(): Task[] {
    return this.state.tasks.filter((t) => t.state === 'backlog').sort((a, b) => a.order - b.order);
  }

  getParkedTasks(): Task[] {
    return this.state.tasks.filter((t) => t.state === 'parked').sort((a, b) => (b.parkedAt ?? 0) - (a.parkedAt ?? 0));
  }

  getCompletedTasks(): Task[] {
    return this.state.tasks.filter((t) => t.state === 'completed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  }

  getStats(now: number = Date.now()) {
    const completed = this.getCompletedTasks();
    const victoriesToday = completed.filter((t) => t.completedAt && isSameCalendarDay(t.completedAt, now)).length;
    const victoriesWeek = completed.filter((t) => t.completedAt && isSameISOWeek(t.completedAt, now)).length;
    return {
      victoriesToday,
      victoriesWeek,
      totalVictories: this.state.stats.totalVictories,
      totalMicroStepsCompleted: this.state.stats.totalMicroStepsCompleted
    };
  }

  captureTask(rawTitle: string): Task | null {
    const title = rawTitle.trim();
    if (!title) return null;
    // Orden descendente de captura: lo mas reciente aparece primero en el Backlog,
    // salvo que el usuario lo reordene manualmente por arrastre.
    const minOrder = this.state.tasks.reduce((m, t) => Math.min(m, t.order), 0);
    const task: Task = {
      id: generateId('task'),
      title,
      notes: '',
      state: 'backlog',
      order: minOrder - 1,
      createdAt: Date.now(),
      microSteps: []
    };
    this.state.tasks.unshift(task);
    this.commit();
    return task;
  }

  hasActiveTask(): boolean {
    return this.getActiveTask() !== null;
  }

  /** Activa una tarea en WIP=1. Lanza 'conflict' si ya hay otra tarea activa distinta. */
  focusTask(taskId: string): { ok: true } | { ok: false; reason: 'conflict'; current: Task } {
    const target = this.state.tasks.find((t) => t.id === taskId);
    if (!target) return { ok: false, reason: 'conflict', current: this.getActiveTask()! };
    const current = this.getActiveTask();
    if (current && current.id !== taskId) {
      return { ok: false, reason: 'conflict', current };
    }
    target.state = 'active';
    this.state.activeTaskId = target.id;
    this.commit();
    return { ok: true };
  }

  /** Aparca la tarea activa actual y enfoca la nueva en un solo paso atomico. */
  swapFocus(currentId: string, nextId: string): void {
    const current = this.state.tasks.find((t) => t.id === currentId);
    const next = this.state.tasks.find((t) => t.id === nextId);
    if (current) {
      current.state = 'parked';
      current.parkedAt = Date.now();
      current.parkedReason = current.parkedReason || 'Aparcada para enfocar nueva tarea';
    }
    if (next) {
      next.state = 'active';
      this.state.activeTaskId = next.id;
    }
    this.commit();
  }

  unfocusActiveTask(): void {
    const active = this.getActiveTask();
    if (!active) return;
    active.state = 'backlog';
    this.state.activeTaskId = null;
    this.commit();
  }

  addMicrostep(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const active = this.getActiveTask();
    if (!active) return false;
    active.microSteps.push({
      id: generateId('step'),
      text: trimmed,
      completed: false,
      createdAt: Date.now()
    });
    this.commit();
    return true;
  }

  completeMicrostep(stepId?: string): boolean {
    const active = this.getActiveTask();
    if (!active) return false;
    let step = stepId ? active.microSteps.find((s) => s.id === stepId) : undefined;
    if (!step) step = active.microSteps.filter((s) => !s.completed)[0];
    if (!step || step.completed) return false;
    step.completed = true;
    step.completedAt = Date.now();
    this.state.stats.totalMicroStepsCompleted += 1;
    this.commit();
    return true;
  }

  completeActiveTask(): boolean {
    const active = this.getActiveTask();
    if (!active) return false;
    active.state = 'completed';
    active.completedAt = Date.now();
    this.state.activeTaskId = null;
    this.state.stats.totalVictories += 1;
    this.commit();
    return true;
  }

  parkActiveTask(reason?: string): boolean {
    const active = this.getActiveTask();
    if (!active) return false;
    active.state = 'parked';
    active.parkedAt = Date.now();
    active.parkedReason = reason?.trim() || active.parkedReason;
    this.state.activeTaskId = null;
    this.commit();
    return true;
  }

  resumeTask(taskId: string): { ok: true } | { ok: false; reason: 'conflict'; current: Task } {
    return this.focusTask(taskId);
  }

  updateTaskTitle(taskId: string, title: string): void {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    task.title = trimmed;
    this.commit();
  }

  updateTaskNotes(taskId: string, notes: string): void {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.notes = notes;
    this.commit();
  }

  reorderBacklog(orderedIds: string[]): void {
    orderedIds.forEach((id, index) => {
      const task = this.state.tasks.find((t) => t.id === id);
      if (task) task.order = index;
    });
    this.commit();
  }

  /** Borrado suave: retira la(s) tarea(s) de inmediato pero permite deshacer durante UNDO_WINDOW_MS. */
  deleteTasksSoft(taskIds: string[]): string {
    const removed = this.state.tasks.filter((t) => taskIds.includes(t.id));
    if (removed.length === 0) return '';
    this.state.tasks = this.state.tasks.filter((t) => !taskIds.includes(t.id));
    if (this.state.activeTaskId && taskIds.includes(this.state.activeTaskId)) {
      this.state.activeTaskId = null;
    }
    this.commit();

    const tokenId = generateId('undo');
    const timer = setTimeout(() => {
      this.pendingDeletions.delete(tokenId);
    }, UNDO_WINDOW_MS);
    this.pendingDeletions.set(tokenId, { tokenId, tasks: removed, timer });
    return tokenId;
  }

  undoDelete(tokenId: string): boolean {
    const pending = this.pendingDeletions.get(tokenId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pendingDeletions.delete(tokenId);
    this.state.tasks.push(...pending.tasks);
    this.commit();
    return true;
  }

  toggleTheme(): void {
    this.state.preferences.theme = this.state.preferences.theme === 'dark' ? 'light' : 'dark';
    this.commit();
  }

  toggleSound(): boolean {
    this.state.preferences.soundEnabled = !this.state.preferences.soundEnabled;
    this.commit();
    return this.state.preferences.soundEnabled;
  }

  togglePreference(key: 'parkingLotExpanded' | 'victoryLogExpanded' | 'statsExpanded'): void {
    this.state.preferences[key] = !this.state.preferences[key];
    this.commit();
  }

  exportJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  importJSON(json: string): void {
    const parsed = JSON.parse(json);
    const sanitized = sanitizeState(parsed);
    this.state = sanitized;
    this.commit();
  }

  resetAll(): void {
    this.state = getDefaultState();
    this.pendingDeletions.forEach((p) => clearTimeout(p.timer));
    this.pendingDeletions.clear();
    this.commit();
  }

  get schemaVersion(): number {
    return CURRENT_VERSION;
  }
}

export const store = new Store();
