# PROGRESO DEL PROYECTO — PARA RETOMAR EN UNA SESIÓN NUEVA

Este documento existe para que una sesión de Claude Code sin memoria de las conversaciones anteriores pueda continuar sin perder contexto. Está escrito en pasado porque describe lo ya hecho, no un plan.

## Qué existe y dónde

### 1. Investigación y auditoría (entregables originales y extendidos)
- `INVESTIGACION_TDAH_INATENTO.md` — monografía completa: neurobiología del TDAH-I, ergonomía cognitiva, autopsia de GTD/Kanban/Pomodoro, fundamentación del Modelo de Mínima Fricción (WIP=1 + JIT + Parking Lot + Cierre Dopaminérgico). 28 fuentes primarias originales con DOI/PMID.
- `AUDITORIA_EVIDENCIA_FUENTES.md` — auditoría adversaria de esas 28 fuentes originales, clasificadas en 4 niveles de certeza (1=consenso robusto, 2=empírico con datos limitados, 3=extrapolación teórica, 4=no concluyente/hipótesis abierta).
- `INVESTIGACION_EXTENDIDA_CLUSTERS.md` — investigación extendida y auditoría adversaria de los 9 clusters temáticos del pool de 12 apps (adherencia farmacológica, finanzas ejecutivas, memoria prospectiva, aversión comunicacional, sobrecarga de email, sueño/cronobiología, ciclo de vergüenza y reenganche, tareas domésticas compartidas y *body doubling*). Incorpora 28 nuevas fuentes primarias forenses (DOIs/PMIDs comprobados al 100%).
- `scripts/verify_extended_sources.py` — script Python reproducible que verifica las 28 fuentes extendidas en tiempo real contra las APIs de Crossref y NCBI Entrez (PubMed). Ejecución: `python scripts/verify_extended_sources.py` (28/28 validadas).
- `MANUAL_OPERATIVO_TDAH.md` — guía de usuario de ModelTasker TDAH (las 5 reglas de interacción, atajos de teclado, protocolo de reseteo sin culpa). Tiene una sección 7 añadida que documenta las funciones de gestión ampliadas de la v2 (ver abajo).
- `legacy_v1/` — la primera versión de ModelTasker (un solo `index.html` monolítico) y sus tests originales (`adversarial_stress_suite.js`, `challenger_final_verification.js`), archivados, no borrados. Esos tests apuntan a la estructura DOM de la v1 y quedaron obsoletos frente a la v2 — si se quieren conservar como suite de pruebas, habría que reescribirlos contra la v2, no se hizo.

### 2. ModelTasker TDAH v2 (app de tareas)
- Fuente modular en `app/` — TypeScript + Vite, sin framework pesado. Ver `app/README.md` para la estructura exacta.
- `npm run build` compila a `dist/index.html` (un único archivo, sin dependencias externas, pensado para abrirse directamente con doble clic). `npm run release` hace el build y copia ese archivo a la raíz del repo como `index.html` — ese es el entregable real que el usuario abre.
- Persistencia en `localStorage` bajo la clave `modeltasker_tdah_state_v2`, con migración automática desde la clave v1 legada y auto-reparación ante JSON corrupto.
- Alcance funcional elegido explícitamente por el usuario: **"Núcleo + Gestión esencial"** — además de las 5 Reglas del manual (captura pura, WIP=1, micro-paso JIT, Parking Lot, cierre dopaminérgico), tiene: edición inline de título, nota opcional colapsada, búsqueda en el Backlog, papelera con deshacer de 10s, reordenar por arrastre, antigüedad visible ("hace X días"), panel de estadísticas sin rachas punitivas, y purga rápida multi-selección. El usuario rechazó explícitamente el nivel superior ("+ Contexto ligero" con etiquetas) y el nivel inferior ("solo arreglar arquitectura sin nuevas funciones").
- 15 tests unitarios en `app/src/state/store.test.ts` (vitest) cubriendo captura, conflicto de WIP=1, micro-pasos, cierre dopaminérgico, papelera/deshacer y persistencia. Pasan.
- Se generó y validó `mock-data.json` (raíz del repo y en `dist/`) con datos de ejemplo cubriendo todas las combinaciones de estado, para que el usuario pudiera apreciar la versión "llena" de la app importándolo vía el botón "📂 Importar". Es descartable — no es parte del producto, es solo para demo.
- **Estado real de uso:** el usuario dijo explícitamente que le daría "una oportunidad estos días" antes de decidir qué sigue. En la próxima sesión, antes de proponer construir algo nuevo sobre ModelTasker, conviene preguntar cómo le fue con el uso real — no asumir que ya lo adoptó ni que hay que seguir añadiendo funciones a ciegas.

### 3. TabWIP (extensión de Chrome, proyecto independiente)
- `W:\Proyectos\TabWIP\` — extensión Manifest V3 que aplica el mismo modelo WIP=1/Parking Lot/Cierre Dopaminérgico a pestañas del navegador, usando la API nativa `chrome.tabGroups` (agrupa y colapsa visualmente las pestañas no enfocadas en un grupo "🅿️ Parking Lot" en vez de simularlo con CSS).
- Decisión de diseño no obvia: **sin bundler**. Se usa `tsc` plano compilando a módulos ES nativos, porque Manifest V3 soporta `"type": "module"` en el service worker y en `<script type="module">` de las páginas HTML — esto evita la fragilidad de un bundler (Vite/CRX, esbuild) para un agente que trabaja sin supervisión constante.
- Separación de arquitectura clave: `src/policy.ts` contiene toda la lógica de decisión como funciones puras (sin llamar a `chrome.*`), y `src/background.ts` es el único lugar que ejecuta efectos reales sobre `chrome.tabs`/`chrome.tabGroups`. Esto permite testear la lógica de reagrupamiento con vitest sin necesitar un navegador real.
- 19/19 tests pasando en `tests/policy.test.ts`. `tsc --noEmit` sin errores.
- **Pendiente de verificación manual por el usuario:** la carga real en `chrome://extensions` no se pudo automatizar. El puente de automatización `claude-in-chrome` rechaza explícitamente cualquier interacción con URLs `chrome://` por una restricción de seguridad deliberada (no es un bug del proyecto). El usuario debe, manualmente: abrir `chrome://extensions`, activar "Modo de desarrollador", "Cargar descomprimida" → seleccionar `W:\Proyectos\TabWIP`, fijar el icono en la barra, revisar el atajo de teclado en `chrome://extensions/shortcuts` (`Ctrl+Shift+F` foco, `Ctrl+Shift+X` completar), y confirmar visualmente que aparece el grupo "🅿️ Parking Lot" colapsado al activar el modo Foco con varias pestañas abiertas.

### 4. Backlog de ideas futuras
- `POOL_APLICACIONES_FUTURAS.md` — 12 aplicaciones posibles derivadas de la investigación, organizadas en torno a 5 ejes temáticos y respaldadas por los 9 clusters de investigación documentados en `INVESTIGACION_EXTENDIDA_CLUSTERS.md`. La tabla síntesis y la nota de especulación han sido actualizadas con los niveles epistémicos de certeza (N1-2 para medicación y finanzas, N2-3 para email, calendario, llamadas y compras, N4 para body doubling, tareas domésticas compartidas y rutinas nocturnas).
- Ninguna de las 12 ideas se ha empezado a construir todavía. Es un backlog ordenado por solidez científica, listo para selección.

## Qué decidir en la próxima sesión

1. Preguntar al usuario cómo le fue usando ModelTasker TDAH estos días, antes de proponer nada nuevo.
2. Si el usuario quiere retomar TabWIP: pedirle confirmación de la carga manual en `chrome://extensions` y funcionamiento visual del grupo "🅿️ Parking Lot".
3. Si el usuario desea iniciar la construcción de alguna de las aplicaciones de `POOL_APLICACIONES_FUTURAS.md`:
   - El camino más seguro con respaldo clínico N1-2 es **#6 Dosis Ahora** o **#3 Cuentas YA**.
   - Si se prefiere una herramienta personal con respaldo cognitivo N2-3: **#2 Ahora/No-Ahora**, **#1 InboxJIT** o **#8 Guion de 20 Segundos**.
   - Si se aborda alguna del grupo N4 (**#10 Presencia Silenciosa**, **#5 3 Tazas compartida** o **#7 Cierre del Día**), mantener estricta fidelidad a las cláusulas de cautela y no promocionarlas como intervenciones médicas.
4. No se inicializó git en ningún proyecto (`ModelTaskerTDAH` ni `TabWIP`). Si en algún momento se empieza a versionar, decidirlo explícitamente con el usuario primero.
