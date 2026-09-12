import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store, UNDO_WINDOW_MS } from './store';
import { STORAGE_KEY } from './schema';

beforeEach(() => {
  localStorage.clear();
});

describe('captureTask', () => {
  it('agrega una tarea cruda al backlog sin pedir metadata', () => {
    const store = new Store();
    const task = store.captureTask('Enviar presupuesto a Martín');
    expect(task).not.toBeNull();
    expect(store.getBacklogTasks()).toHaveLength(1);
    expect(store.getBacklogTasks()[0].title).toBe('Enviar presupuesto a Martín');
  });

  it('ignora texto vacío o solo espacios', () => {
    const store = new Store();
    expect(store.captureTask('   ')).toBeNull();
    expect(store.getBacklogTasks()).toHaveLength(0);
  });

  it('las tareas nuevas aparecen primero (orden descendente de captura)', () => {
    const store = new Store();
    store.captureTask('Primera');
    store.captureTask('Segunda');
    expect(store.getBacklogTasks().map((t) => t.title)).toEqual(['Segunda', 'Primera']);
  });
});

describe('WIP=1 enforcement', () => {
  it('permite enfocar una tarea cuando no hay ninguna activa', () => {
    const store = new Store();
    const task = store.captureTask('Tarea A')!;
    const result = store.focusTask(task.id);
    expect(result.ok).toBe(true);
    expect(store.getActiveTask()?.id).toBe(task.id);
  });

  it('rechaza enfocar una segunda tarea mientras hay una activa', () => {
    const store = new Store();
    const a = store.captureTask('Tarea A')!;
    const b = store.captureTask('Tarea B')!;
    store.focusTask(a.id);
    const result = store.focusTask(b.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.current.id).toBe(a.id);
    expect(store.getActiveTask()?.id).toBe(a.id);
  });

  it('swapFocus aparca la activa y enfoca la nueva atomicamente', () => {
    const store = new Store();
    const a = store.captureTask('Tarea A')!;
    const b = store.captureTask('Tarea B')!;
    store.focusTask(a.id);
    store.swapFocus(a.id, b.id);
    expect(store.getActiveTask()?.id).toBe(b.id);
    expect(store.getParkedTasks().map((t) => t.id)).toContain(a.id);
  });
});

describe('Micro-pasos Just-In-Time', () => {
  it('no permite añadir micro-paso sin tarea activa', () => {
    const store = new Store();
    store.captureTask('Tarea A');
    expect(store.addMicrostep('Abrir archivo')).toBe(false);
  });

  it('añade y completa un micro-paso, incrementando las estadisticas', () => {
    const store = new Store();
    const a = store.captureTask('Tarea A')!;
    store.focusTask(a.id);
    store.addMicrostep('Abrir archivo');
    const before = store.getStats().totalMicroStepsCompleted;
    expect(store.completeMicrostep()).toBe(true);
    expect(store.getStats().totalMicroStepsCompleted).toBe(before + 1);
  });
});

describe('Cierre dopaminergico', () => {
  it('completeActiveTask mueve la tarea a victorias y libera el WIP', () => {
    const store = new Store();
    const a = store.captureTask('Tarea A')!;
    store.focusTask(a.id);
    expect(store.completeActiveTask()).toBe(true);
    expect(store.getActiveTask()).toBeNull();
    expect(store.getCompletedTasks().map((t) => t.id)).toContain(a.id);
    expect(store.getStats().totalVictories).toBe(1);
  });

  it('parkActiveTask preserva la permanencia del objeto en el Parking Lot', () => {
    const store = new Store();
    const a = store.captureTask('Tarea A')!;
    store.focusTask(a.id);
    store.parkActiveTask('Esperando respuesta de un colega');
    expect(store.getActiveTask()).toBeNull();
    const parked = store.getParkedTasks();
    expect(parked).toHaveLength(1);
    expect(parked[0].parkedReason).toBe('Esperando respuesta de un colega');
  });
});

describe('Papelera con deshacer', () => {
  it('retira la tarea de inmediato pero permite deshacer dentro de la ventana', () => {
    vi.useFakeTimers();
    const store = new Store();
    const a = store.captureTask('Tarea A')!;
    const tokenId = store.deleteTasksSoft([a.id]);
    expect(store.getBacklogTasks()).toHaveLength(0);
    expect(store.undoDelete(tokenId)).toBe(true);
    expect(store.getBacklogTasks()).toHaveLength(1);
    vi.useRealTimers();
  });

  it('tras la ventana de deshacer, la eliminacion queda firme', () => {
    vi.useFakeTimers();
    const store = new Store();
    const a = store.captureTask('Tarea A')!;
    const tokenId = store.deleteTasksSoft([a.id]);
    vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    expect(store.undoDelete(tokenId)).toBe(false);
    expect(store.getBacklogTasks()).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe('Persistencia en localStorage', () => {
  it('recupera el estado completo tras recargar (nueva instancia de Store)', () => {
    const store1 = new Store();
    const a = store1.captureTask('Tarea persistente')!;
    store1.focusTask(a.id);
    store1.addMicrostep('Paso uno');

    const store2 = new Store();
    const active = store2.getActiveTask();
    expect(active?.title).toBe('Tarea persistente');
    expect(active?.microSteps[0]?.text).toBe('Paso uno');
  });

  it('se autorepara ante JSON corrupto sin perder la sesion', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const store = new Store();
    expect(store.getBacklogTasks()).toHaveLength(0);
    expect(() => store.captureTask('Nueva tarea tras corrupcion')).not.toThrow();
  });
});

describe('resetAll', () => {
  it('restablece el sistema a tabula rasa', () => {
    const store = new Store();
    store.captureTask('Tarea A');
    store.resetAll();
    expect(store.getBacklogTasks()).toHaveLength(0);
    expect(store.getStats().totalVictories).toBe(0);
  });
});
