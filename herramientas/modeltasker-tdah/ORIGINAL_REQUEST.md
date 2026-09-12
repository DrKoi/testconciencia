# Original User Request

## Initial Request — 2026-09-11T14:20:48Z

Investigación científica exhaustiva sobre la neurodivergencia TDAH Inatento (TDAH-I) y ergonomía cognitiva de flujos de trabajo, acompañada de una matriz formal de auditoría de fuentes primarias (PMID/DOI) con clasificación de certeza en 4 niveles de rigor, y la implementación de una aplicación web local interactiva de mínima fricción basada en el modelo "Foco Único (WIP=1) + Micro-Acción Just-In-Time + Parking Lot Colapsable + Backlog Unificado con Cierre Dopaminérgico".

Working directory: w:/Proyectos/ModelTaskerTDAH
Integrity mode: development

## Requirements

### R1. Monografía de Investigación Académica Exhaustiva
Desarrollar un documento académico exhaustivo (`INVESTIGACION_TDAH_INATENTO.md`) que integre la neurobiología del TDAH Inatento (disfunción ejecutiva, desregulación dopaminérgica/arousal, memoria de trabajo, Red por Defecto vs. Red de Control Ejecutivo, ceguera temporal y descuento hiperbólico), ergonomía cognitiva (Teoría de Carga Cognitiva de Sweller, psicología del esfuerzo, fatiga por sobrecarga visual y déficit de filtrado sensorial), análisis empírico de fallas en metodologías tradicionales (Kanban clásico, GTD, Pomodoro), y la fundamentación teórica del modelo de mínima fricción adaptado a la inatención y el riesgo de abandono.

### R2. Matriz de Auditoría Adversaria y Verificación de Fuentes
Generar un informe de auditoría independiente (`AUDITORIA_EVIDENCIA_FUENTES.md`) que audite rigurosamente cada afirmación científica del documento R1 contra sus fuentes primarias originales (verificando DOIs/PMIDs reales). Cada afirmación debe ser clasificada de manera explícita en:
- **Nivel 1 (Consenso Robusto / Evidencia Primaria Sólida)**
- **Nivel 2 (Evidencia Empírica / Clínica Plausible con Datos Limitados)**: explicitando notas de *"faltan datos para dar seguridad plena pero los datos empíricos apuntan a..."*
- **Nivel 3 (Extrapolación Teórica / Principio Ergonómico Derivado)**
- **Nivel 4 (No Concluyente / Faltan Datos / Hipótesis Abierta)**

### R3. Aplicación Web Local Ergonómica de Mínima Fricción
Construir una aplicación web interactiva autónoma (`index.html`) sin dependencias externas pesadas ni servidores requeridos. Debe implementar funcionalmente:
- Captura inmediata de tareas en crudo sin campos obligatorios ni fricción inicial de desglose.
- Modo Foco en Proceso con límite estricto de una tarea activa (WIP=1) que solicite únicamente la siguiente micro-acción inmediata (<5 min) Just-In-Time.
- Parking Lot colapsable/atenuado para tareas pausadas o bloqueadas, accesible en 1 clic para no perder permanencia del objeto sin saturar el campo visual.
- Mecánica de tachado visual y feedback dopaminérgico al completar micro-pasos y tareas, con historial de victorias.
- Persistencia local de datos en el navegador (`localStorage`).

### R4. Guía Operativa de Usuario
Crear un manual operativo conciso (`MANUAL_OPERATIVO_TDAH.md`) con las reglas de interacción para operar el sistema en el día a día sin recaer en la sobre-ingeniería ni en el abandono.

---

## Acceptance Criteria

### Rigor Académico y Auditoría
- [ ] El documento R1 cubre todos los módulos acordados (Neurobiología, Ergonomía Cognitiva, Autopsia de Sistemas Clásicos, Fundamentos del Modelo).
- [ ] Todas las citas bibliográficas y afirmaciones en R2 cuentan con DOI o PMID verificables.
- [ ] Ninguna afirmación con datos empíricos preliminares se presenta como verdad dogmática; se documenta con su correspondiente nivel y nota de cautela.

### Funcionalidad y Ergonomía del Software
- [ ] La aplicación web `index.html` es completamente autónoma y se ejecuta directamente abriendo el archivo en cualquier navegador moderno.
- [ ] Captura de tareas rápida en un solo paso mediante `Enter`.
- [ ] La transición a WIP limita estrictamente a 1 tarea en foco simultánea y despliega el prompt del siguiente micro-paso.
- [ ] El Parking Lot puede contraerse/expandirse en 1 clic y mantiene baja prominencia visual cuando está activo.
- [ ] Completar micro-pasos o tareas genera tachado visual y alimenta el registro de tareas finalizadas.
- [ ] La totalidad de las tareas, estados y notas se recupera intacta tras recargar la página.
