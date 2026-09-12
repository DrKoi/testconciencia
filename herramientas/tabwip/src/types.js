/**
 * Tipos compartidos. `policy.ts` depende SOLO de este archivo (datos planos),
 * nunca de `chrome.*`, para poder testear la logica de reagrupamiento sin navegador.
 */
/** Sentinela: el destino "Parking Lot" aun no tiene un groupId real de Chrome asignado. */
export const NEW_PARKING_GROUP = 'NEW_PARKING_GROUP';
export const PARKING_GROUP_TITLE = '🅿️ Parking Lot';
/** Chrome no tiene "amber" en su paleta de grupos; "orange" es el tono nativo mas cercano. */
export const PARKING_GROUP_COLOR = 'orange';
export const INITIAL_FOCUS_STATE = {
    focusModeOn: false,
    focusedTabId: null,
    parkingGroupId: null,
};
export const DEFAULT_PREFERENCES = {
    soundOnComplete: false,
    theme: 'system',
};
