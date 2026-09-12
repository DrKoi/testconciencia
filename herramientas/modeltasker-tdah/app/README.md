# ModelTasker TDAH — proyecto fuente

Implementación modular (TypeScript + Vite, sin framework pesado) del modelo
**Foco Único (WIP=1) + Micro-Acción Just-In-Time + Parking Lot + Cierre
Dopaminérgico** descrito en `../INVESTIGACION_TDAH_INATENTO.md` y
`../MANUAL_OPERATIVO_TDAH.md`.

El build final es un único `index.html` autónomo (CSS y JS inlineados, cero
dependencias externas, cero servidor) que se copia a la raíz del repositorio.
Así se conserva el requisito original: abrir el archivo directamente en el
navegador.

## Estructura

```
src/
  types.ts              Modelo de datos (Task, MicroStep, Preferences...)
  state/
    schema.ts            Estado por defecto, saneo y migración de esquema
    store.ts             Única fuente de verdad: acciones + persistencia
    store.test.ts         Tests del núcleo de negocio (vitest)
  lib/                   Utilidades sin estado de UI (dom, toast, modal, sonido, tiempo, id)
  ui/                    Un módulo por sección de la interfaz (capture, focusCard,
                         backlog, parkingLot, victoryLog, statsPanel, shortcuts...)
  main.ts                 Composición: conecta store -> render, wiring de eventos
```

## Comandos

```bash
npm install         # una sola vez
npm run dev         # servidor de desarrollo con recarga en caliente
npm test            # tests del store (vitest)
npm run build       # compila a ../dist/index.html (un solo archivo)
npm run release     # build + copia ../dist/index.html -> ../index.html
```

## Persistencia

Todo el estado vive en `localStorage` bajo la clave
`modeltasker_tdah_state_v2`. Si se detecta la clave legada
`modeltasker_tdah_state_v1` (de la primera versión de archivo único), se
migra automáticamente. Ante JSON corrupto, el sistema respalda la clave
dañada con timestamp y se autorepara a un estado limpio sin perder la sesión.
