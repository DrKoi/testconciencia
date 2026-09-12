import { describe, expect, it } from 'vitest';
import {
  planActivateFocus,
  planDeactivateFocus,
  planTabActivated,
  planTabClosed,
  planTabCreated,
  withParkingGroupId,
} from '../src/policy';
import { Action, FocusState, INITIAL_FOCUS_STATE, NEW_PARKING_GROUP } from '../src/types';

function moveAction(actions: Action[]): (Action & { type: 'MOVE_TO_PARKING' }) | undefined {
  return actions.find((a): a is Action & { type: 'MOVE_TO_PARKING' } => a.type === 'MOVE_TO_PARKING');
}

describe('planActivateFocus', () => {
  it('con 3 pestanas abiertas, las otras 2 se mueven al Parking Lot y se colapsa', () => {
    const { actions, nextState } = planActivateFocus([1, 2, 3], 1, INITIAL_FOCUS_STATE);

    const move = moveAction(actions);
    expect(move).toBeDefined();
    expect(move!.tabIds.sort()).toEqual([2, 3]);
    expect(move!.groupId).toBe(NEW_PARKING_GROUP);

    expect(actions.some((a) => a.type === 'COLLAPSE_PARKING')).toBe(true);
    expect(nextState.focusModeOn).toBe(true);
    expect(nextState.focusedTabId).toBe(1);
  });

  it('reutiliza el parkingGroupId existente en lugar de pedir uno nuevo', () => {
    const state: FocusState = { focusModeOn: false, focusedTabId: null, parkingGroupId: 42 };
    const { actions } = planActivateFocus([1, 2, 3], 1, state);

    const move = moveAction(actions);
    expect(move!.groupId).toBe(42);
  });

  it('si la pestana activa es la unica abierta, no hay nada que aparcar', () => {
    const { actions, nextState } = planActivateFocus([1], 1, INITIAL_FOCUS_STATE);
    expect(actions).toHaveLength(0);
    expect(nextState.focusModeOn).toBe(true);
    expect(nextState.focusedTabId).toBe(1);
  });

  it('si ya existia un Parking Lot vacio, aun asi se colapsa al re-activar con una sola pestana', () => {
    const state: FocusState = { focusModeOn: false, focusedTabId: null, parkingGroupId: 7 };
    const { actions } = planActivateFocus([1], 1, state);
    expect(actions).toEqual([{ type: 'COLLAPSE_PARKING', groupId: 7 }]);
  });
});

describe('planTabActivated (conflicto WIP=1)', () => {
  it('cambiar de pestana activa estando en foco aparca la anterior y libera la nueva', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: 99 };
    const { actions, nextState } = planTabActivated(state, 5);

    expect(actions).toEqual([
      { type: 'MOVE_TO_PARKING', tabIds: [1], groupId: 99 },
      { type: 'COLLAPSE_PARKING', groupId: 99 },
      { type: 'RELEASE_TAB_FROM_GROUP', tabId: 5 },
    ]);
    expect(nextState.focusedTabId).toBe(5);
    expect(nextState.focusModeOn).toBe(true);
  });

  it('si el Parking Lot todavia no existe, usa el sentinel NEW_PARKING_GROUP', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: null };
    const { actions } = planTabActivated(state, 5);
    expect(actions[0]).toEqual({ type: 'MOVE_TO_PARKING', tabIds: [1], groupId: NEW_PARKING_GROUP });
  });

  it('no hace nada si el Modo Foco esta apagado', () => {
    const { actions, nextState } = planTabActivated(INITIAL_FOCUS_STATE, 5);
    expect(actions).toHaveLength(0);
    expect(nextState).toBe(INITIAL_FOCUS_STATE);
  });

  it('no hace nada si se reactiva la misma pestana que ya tenia el foco', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: 99 };
    const { actions, nextState } = planTabActivated(state, 1);
    expect(actions).toHaveLength(0);
    expect(nextState).toBe(state);
  });

  it('si no habia ninguna pestana enfocada previamente, solo libera la nueva', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: null, parkingGroupId: 99 };
    const { actions } = planTabActivated(state, 5);
    expect(actions).toEqual([{ type: 'RELEASE_TAB_FROM_GROUP', tabId: 5 }]);
  });
});

describe('planTabCreated', () => {
  it('una pestana nueva no se agrupa automaticamente mientras el foco esta activo', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: 99 };
    const { actions, nextState } = planTabCreated(state, 123);
    expect(actions).toHaveLength(0);
    expect(nextState).toBe(state);
  });

  it('tampoco hace nada si el foco esta apagado', () => {
    const { actions, nextState } = planTabCreated(INITIAL_FOCUS_STATE, 123);
    expect(actions).toHaveLength(0);
    expect(nextState).toBe(INITIAL_FOCUS_STATE);
  });
});

describe('planTabClosed', () => {
  it('libera focusedTabId cuando se cierra justo esa pestana', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: 99 };
    const { nextState } = planTabClosed(state, 1);
    expect(nextState.focusedTabId).toBeNull();
    expect(nextState.focusModeOn).toBe(true);
  });

  it('no toca el estado si se cierra una pestana distinta a la enfocada', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: 99 };
    const { nextState } = planTabClosed(state, 2);
    expect(nextState).toBe(state);
  });

  it('evita que una activacion posterior intente aparcar una pestana fantasma', () => {
    const afterClose = planTabClosed({ focusModeOn: true, focusedTabId: 1, parkingGroupId: 99 }, 1).nextState;
    const { actions } = planTabActivated(afterClose, 7);
    expect(actions).toEqual([{ type: 'RELEASE_TAB_FROM_GROUP', tabId: 7 }]);
  });
});

describe('planDeactivateFocus', () => {
  it('salir de foco expande y desagrupa el Parking Lot, y resetea el estado', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: 99 };
    const { actions, nextState } = planDeactivateFocus(state);

    expect(actions).toEqual([
      { type: 'EXPAND_PARKING', groupId: 99 },
      { type: 'DISSOLVE_PARKING', groupId: 99 },
    ]);
    expect(nextState).toEqual(INITIAL_FOCUS_STATE);
  });

  it('no genera acciones si nunca se llego a crear el Parking Lot', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: null };
    const { actions, nextState } = planDeactivateFocus(state);
    expect(actions).toHaveLength(0);
    expect(nextState).toEqual(INITIAL_FOCUS_STATE);
  });

  it('es un no-op si el foco ya estaba apagado', () => {
    const { actions, nextState } = planDeactivateFocus(INITIAL_FOCUS_STATE);
    expect(actions).toHaveLength(0);
    expect(nextState).toBe(INITIAL_FOCUS_STATE);
  });
});

describe('withParkingGroupId', () => {
  it('registra el groupId real devuelto por chrome.tabs.group sin tocar el resto del estado', () => {
    const state: FocusState = { focusModeOn: true, focusedTabId: 1, parkingGroupId: null };
    const next = withParkingGroupId(state, 55);
    expect(next).toEqual({ focusModeOn: true, focusedTabId: 1, parkingGroupId: 55 });
    expect(state.parkingGroupId).toBeNull();
  });
});

describe('flujo integrado: activar -> cambiar -> completar -> salir', () => {
  it('recorre el ciclo completo manteniendo WIP=1 en todo momento', () => {
    let state = INITIAL_FOCUS_STATE;

    const activation = planActivateFocus([1, 2, 3], 1, state);
    state = withParkingGroupId(activation.nextState, 900);
    expect(state).toEqual({ focusModeOn: true, focusedTabId: 1, parkingGroupId: 900 });

    const switched = planTabActivated(state, 2);
    expect(switched.actions).toEqual([
      { type: 'MOVE_TO_PARKING', tabIds: [1], groupId: 900 },
      { type: 'COLLAPSE_PARKING', groupId: 900 },
      { type: 'RELEASE_TAB_FROM_GROUP', tabId: 2 },
    ]);
    state = switched.nextState;
    expect(state.focusedTabId).toBe(2);

    const closed = planTabClosed(state, 2);
    state = closed.nextState;
    expect(state.focusedTabId).toBeNull();

    const deactivated = planDeactivateFocus(state);
    expect(deactivated.actions).toEqual([
      { type: 'EXPAND_PARKING', groupId: 900 },
      { type: 'DISSOLVE_PARKING', groupId: 900 },
    ]);
    expect(deactivated.nextState).toEqual(INITIAL_FOCUS_STATE);
  });
});
