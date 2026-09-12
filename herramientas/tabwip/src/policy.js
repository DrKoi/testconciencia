/**
 * Logica PURA de reagrupamiento. Cero llamadas a `chrome.*`: recibe datos planos
 * (tabs abiertas, estado de foco) y devuelve QUE acciones tomar, nunca las ejecuta.
 * Esto es lo que permite testear con vitest, sin un navegador real, las cuatro
 * reglas centrales de TabWIP (activar foco, WIP=1 al cambiar de pestana, pestanas
 * nuevas sin interrupcion, y salida de foco).
 */
import { INITIAL_FOCUS_STATE, NEW_PARKING_GROUP, } from './types.js';
const NO_ACTIONS = [];
function resolveParkingTarget(state) {
    return state.parkingGroupId ?? NEW_PARKING_GROUP;
}
/**
 * Activa el Modo Foco a partir de la pestana actualmente activa. Todas las demas
 * pestanas (de todas las ventanas) se mueven al Parking Lot y el grupo se colapsa.
 * Si ya existe un parkingGroupId (re-activacion tras una salida previa sin recrear
 * el grupo), se reutiliza en lugar de pedir uno nuevo.
 */
export function planActivateFocus(allTabIds, activeTabId, state) {
    const otherTabIds = allTabIds.filter((id) => id !== activeTabId);
    const parkingTarget = resolveParkingTarget(state);
    const actions = [];
    if (otherTabIds.length > 0) {
        actions.push({ type: 'MOVE_TO_PARKING', tabIds: otherTabIds, groupId: parkingTarget });
        actions.push({ type: 'COLLAPSE_PARKING', groupId: parkingTarget });
    }
    else if (state.parkingGroupId !== null) {
        actions.push({ type: 'COLLAPSE_PARKING', groupId: state.parkingGroupId });
    }
    return {
        actions,
        nextState: {
            focusModeOn: true,
            focusedTabId: activeTabId,
            parkingGroupId: state.parkingGroupId,
        },
    };
}
/**
 * Resuelve el conflicto de WIP=1: el usuario activo manualmente otra pestana
 * mientras el Modo Foco estaba activo. Sin preguntar (mover pestanas no es
 * destructivo): la que pierde el foco se aparca, la nueva queda sola.
 */
export function planTabActivated(state, newActiveTabId) {
    if (!state.focusModeOn) {
        return { actions: NO_ACTIONS, nextState: state };
    }
    if (newActiveTabId === state.focusedTabId) {
        return { actions: NO_ACTIONS, nextState: state };
    }
    const actions = [];
    const previousFocusedTabId = state.focusedTabId;
    if (previousFocusedTabId !== null) {
        const parkingTarget = resolveParkingTarget(state);
        actions.push({ type: 'MOVE_TO_PARKING', tabIds: [previousFocusedTabId], groupId: parkingTarget });
        actions.push({ type: 'COLLAPSE_PARKING', groupId: parkingTarget });
    }
    actions.push({ type: 'RELEASE_TAB_FROM_GROUP', tabId: newActiveTabId });
    return {
        actions,
        nextState: { ...state, focusedTabId: newActiveTabId },
    };
}
/**
 * Una pestana nueva NUNCA se agrupa automaticamente al crearse, foco activo o no.
 * Esto evita interrumpir flujos como abrir un enlace en segundo plano. Si el
 * usuario la activa deliberadamente despues, `planTabActivated` aplicara WIP=1.
 */
export function planTabCreated(state, _newTabId) {
    return { actions: NO_ACTIONS, nextState: state };
}
/**
 * Si la pestana que se cierra es la que tenia el foco, hay que soltar la
 * referencia: de lo contrario, la siguiente activacion intentaria aparcar una
 * pestana que ya no existe.
 */
export function planTabClosed(state, closedTabId) {
    if (state.focusedTabId !== closedTabId) {
        return { actions: NO_ACTIONS, nextState: state };
    }
    return { actions: NO_ACTIONS, nextState: { ...state, focusedTabId: null } };
}
/**
 * Sale del Modo Foco: expande y desagrupa el Parking Lot, devolviendo el control
 * normal del navegador sin cerrar ni perder ninguna pestana.
 */
export function planDeactivateFocus(state) {
    if (!state.focusModeOn) {
        return { actions: NO_ACTIONS, nextState: state };
    }
    const actions = [];
    if (state.parkingGroupId !== null) {
        actions.push({ type: 'EXPAND_PARKING', groupId: state.parkingGroupId });
        actions.push({ type: 'DISSOLVE_PARKING', groupId: state.parkingGroupId });
    }
    return { actions, nextState: { ...INITIAL_FOCUS_STATE } };
}
/**
 * `background.ts` llama a esto tras ejecutar un `MOVE_TO_PARKING` cuyo destino era
 * `NEW_PARKING_GROUP`, una vez que `chrome.tabs.group` devuelve el id real.
 */
export function withParkingGroupId(state, groupId) {
    return { ...state, parkingGroupId: groupId };
}
