# TabWIP

Extension de Chrome (Manifest V3) que aplica al navegador el mismo modelo ergonomico de **Foco Unico (WIP=1)** documentado para gestion de tareas en TDAH Inatento, pero a nivel de pestanas: mientras trabajas en una, el resto vive en un **Parking Lot** colapsado usando la API nativa `chrome.tabGroups` (no hay overlay ni CSS inyectado: es el propio navegador el que reduce el grupo a una pestana "enana" con solo color y titulo).

Proyecto independiente de ModelTasker TDAH. No comparte codigo, almacenamiento ni dominio con el (ese gestiona tareas de una lista; este gestiona pestanas de un navegador), aunque se inspira en su filosofia de cero friccion y cero dependencias pesadas, y en la evidencia resumida abajo.

## Por que (resumen, no sustituye la investigacion completa)

Con muchas pestanas abiertas simultaneamente ocurre, a nivel de navegador, el mismo fenomeno que la investigacion del proyecto hermano documenta para tableros Kanban saturados:

- **Competencia sesgada por distractores visuales** (Desimone & Duncan, 1995) y **teoria de carga perceptual** (Lavie, 2005; Forster & Lavie, 2014 en TDAH): cada pestana visible compite por atencion aunque no la estes usando. Nivel de evidencia: 3 (principio ergonomico extrapolado) / 2 para el dato especifico en TDAH.
- **Ley de Hick** (Hick, 1952): el tiempo de decision crece con `log2(n+1)` opciones visibles; treinta pestanas abiertas imponen una latencia de escaneo que un Foco Unico (`n=1`) reduce al minimo. Nivel 3.
- **Costo de cambio de contexto e interrupciones** (Monsell, 2003; Mark, Gudith & Klocke, 2008): cada salto de pestana tiene un costo de reconfiguracion ejecutiva medible. Nivel 3.
- **Cierre dopaminergico** como contrapeso al deficit motivacional documentado en TDAH (Volkow et al., 2009, 2011 — nivel 1/2): una senal de cierre inmediata y visible al completar, sin rachas punitivas si un dia no hay victorias.

Para el detalle completo, los niveles de certeza epistemica (1 a 4) y las citas verificadas por DOI/PMID, ver `W:\Proyectos\ModelTaskerTDAH\INVESTIGACION_TDAH_INATENTO.md` y `W:\Proyectos\ModelTaskerTDAH\AUDITORIA_EVIDENCIA_FUENTES.md`. Ninguna de esas fuentes fue un ensayo clinico de "TabWIP": la aplicacion a pestanas de navegador es una extrapolacion de diseño (nivel 3), no un hallazgo clinico sobre esta herramienta.

## Que hace

1. **Activar Foco** (boton del popup o atajo de teclado, por defecto `Ctrl+Shift+F` / `Cmd+Shift+F` en Mac): todas las demas pestanas, de todas las ventanas, se agrupan en **🅿️ Parking Lot** (naranja) y el grupo se colapsa. La pestana activa queda sola y fuera de cualquier grupo.
2. **WIP=1 automatico**: si cambias de pestana mientras el Foco esta activo (`chrome.tabs.onActivated`), la que pierde el foco se aparca sola y se colapsa el grupo; la nueva pestana activa se libera de cualquier grupo. No hay modal de confirmacion: mover una pestana no es destructivo, a diferencia de aparcar una tarea con datos en el proyecto hermano.
3. **Pestanas nuevas sin interrupcion**: abrir una pestana nueva (`chrome.tabs.onCreated`) mientras el Foco esta activo nunca la agrupa automaticamente, para no romper flujos como abrir un enlace en segundo plano.
4. **✅ Completar (cierre dopaminergico)**: desde el popup (o el atajo `Ctrl+Shift+X`/`Cmd+Shift+X`) registra titulo y URL de la pestana activa en un Victory Log local, dispara una notificacion breve y cierra la pestana. Contadores de victorias hoy/semana/total, sin rachas punitivas.
5. **Salir de Foco**: expande y desagrupa el Parking Lot; ninguna pestana se cierra ni se pierde.
6. **Preferencias** (`chrome://extensions` -> Detalles -> Opciones de la extension, o el enlace "Preferencias" del popup): sonido suave opcional al completar (Web Audio, desactivado por defecto), tema claro/oscuro/sistema, y un boton para borrar el Victory Log local.

## Arquitectura

Sin bundler, a proposito: TypeScript compilado por `tsc` a JS con modulos ES nativos. El manifest carga `src/background.js` como `"type": "module"`, y `popup.html`/`options.html` usan `<script type="module" src="popup.js">`. Nada de Vite/webpack/esbuild.

```
manifest.json
src/
  types.ts        tipos compartidos: FocusState, Action, Snapshot, mensajes runtime
  policy.ts        LOGICA PURA: dado un estado + evento, decide que acciones tomar. Cero chrome.*
  background.ts    service worker: unico lugar que llama a chrome.tabs / chrome.tabGroups
  storage.ts       wrapper sobre chrome.storage.local (Victory Log, stats, preferencias)
  popup.html/ts     UI del popup
  options.html/ts   preferencias
tests/
  policy.test.ts   19 tests de policy.ts con vitest, sin mocks de chrome.*
icons/             PNGs solidos de un solo color (16/48/128px), sin diseño
```

La separacion `policy.ts` (puro) / `background.ts` (efectos) es la decision de diseño central: permite testear con vitest, sin un navegador real, las cuatro reglas de reagrupamiento (activar foco, conflicto WIP=1, pestana nueva, salir de foco).

## Como cargarla (sin empaquetar)

1. `npm install && npm run build` (compila `src/**/*.ts` a `.js` junto a cada archivo; el repo ya incluye los `.js` compilados, pero si editas el `.ts` hay que recompilar).
2. Abre `chrome://extensions`.
3. Activa **Modo de desarrollador** (interruptor arriba a la derecha).
4. Click en **Cargar descomprimida** y selecciona la carpeta `W:\Proyectos\TabWIP` (la que contiene `manifest.json`, no `src/`).
5. Fija el icono de TabWIP en la barra de herramientas (icono de puzzle -> pin) para tener el popup a un click.
6. Opcional: revisa/ajusta el atajo de teclado en `chrome://extensions/shortcuts`.

## Desarrollo

```
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run sobre tests/policy.test.ts
npm run build        # tsc: compila a .js junto a cada .ts en src/
npm run watch        # tsc --watch, para iterar mientras recargas la extension
```

Tras cada cambio en `src/*.ts`, hay que `npm run build` (o tener `npm run watch` corriendo) y luego pulsar el icono de recarga (↻) de la extension en `chrome://extensions`.

## Limitaciones conocidas

- **Los grupos de pestanas de Chrome son por ventana.** Cuando "Activar Foco" junta pestanas de varias ventanas en un solo `🅿️ Parking Lot`, Chrome las mueve a la ventana donde se creo el grupo. Es un comportamiento nativo del navegador, no un bug de la extension: el resultado practico (todo excepto la pestana activa queda fuera de la vista) es el buscado, pero puede sorprender si trabajas deliberadamente con varias ventanas lado a lado.
- **La pestana en foco queda fuera de cualquier grupo** (no se usa un grupo "🎯 Foco" de un solo elemento) para evitar crear/destruir un grupo extra en cada cambio de pestana. Es la alternativa mas simple de las dos que permite el diseño original.
- **"Hoy" es una ventana de 24 horas**, no medianoche del calendario, para evitar logica de zonas horarias. "Semana" son los ultimos 7 dias.
- **Completar la ultima pestana de una ventana** abre una pestana en blanco antes de cerrar la original, para que la ventana (o el navegador, si era la ultima ventana) no se cierre como efecto secundario inesperado.
- Si el Service Worker se reinicia (MV3 los descarga tras inactividad) mientras el Parking Lot esta colapsado, el estado persiste en `chrome.storage.local` y se recupera en el siguiente evento; no hay perdida de pestanas, solo una relectura de estado.
- No hay build empaquetado (`.zip`/Chrome Web Store): es deliberadamente un proyecto local, cargado como "descomprimida".

## Permisos solicitados y por que

- `tabs`: leer/mover/cerrar pestanas (WIP=1, cierre dopaminergico).
- `tabGroups`: crear, colapsar, expandir y disolver el Parking Lot.
- `storage`: Victory Log, estadisticas y preferencias en `chrome.storage.local`.
- `notifications`: aviso breve al completar una pestana.

No se solicita `<all_urls>` ni ningun host permission: la extension nunca lee el contenido de las paginas visitadas, solo metadatos de la pestana (titulo, URL, id de grupo) expuestos por `chrome.tabs`.
