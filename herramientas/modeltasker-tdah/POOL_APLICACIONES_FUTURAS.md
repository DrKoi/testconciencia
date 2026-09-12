# POOL DE APLICACIONES FUTURAS DERIVADAS DE LA INVESTIGACIÓN TDAH-I

**Propósito:** backlog de ideas exploratorio, no una monografía nueva. Cada ficha identifica el mecanismo neuro-ergonómico concreto (citado en `INVESTIGACION_TDAH_INATENTO.md` y auditado en `AUDITORIA_EVIDENCIA_FUENTES.md`), el dominio del *point of performance* donde actuaría, una estimación de complejidad relativa a los dos proyectos ya construidos, y si hace falta investigación nueva antes de poder afirmar algo sobre ella con el mismo rigor que el resto del corpus.

**Ya construidos (no incluidos en el pool):**
- **ModelTasker TDAH** (`app/` → `index.html`) — WIP=1 + JIT + Parking Lot + Victory Log aplicado a tareas generales.
- **TabWIP** (`W:\Proyectos\TabWIP\`) — el mismo modelo aplicado a pestañas del navegador vía `chrome.tabGroups`.

---

## Tabla síntesis (12 aplicaciones) — Estatus de Evidencia tras Auditoría de Clusters

> [!NOTE]
> La investigación complementaria de las 12 aplicaciones ha sido formalmente agrupada, investigada y auditada en 9 clusters temáticos en [`INVESTIGACION_EXTENDIDA_CLUSTERS.md`](file:///w:/Proyectos/ModelTaskerTDAH/INVESTIGACION_EXTENDIDA_CLUSTERS.md), con 28 fuentes primarias verificadas contra Crossref y PubMed.

| # | Nombre/concepto | Dominio (*point of performance*) | Mecanismo neuro-ergonómico central | Complejidad | Cluster de Investigación y Estatus Epistémico |
|---|---|---|---|---|---|
| 1 | **InboxJIT** | Email | Ley de Hick (n opciones) + parálisis taxonómica de GTD (Sweller, 1988; Cowan, 2001) | Media (OAuth + API del proveedor de correo) | **Cluster 5 (Ansiedad de Bandeja):** Resuelto a **Nivel 2-3** (Whittaker 1996; Dabbish 2006; Kushlev 2015). Procesamiento secuencial WIP=1 sin contadores de deuda. |
| 2 | **Ahora / No-Ahora** | Calendario y recordatorios | Ceguera temporal y dicotomía "Now / Not Now" (Barkley, 1997, 2012) | Media-alta (notificaciones a nivel de SO/móvil, API de calendario) | **Cluster 3 (Memoria Prospectiva):** Resuelto a **Nivel 2-3** (Altgassen 2014; Fuermaier 2013; Altgassen 2019). Disociación clave: *time-based* colapsa, *event-based* se preserva. |
| 3 | **Cuentas YA** | Finanzas personales (pago de facturas) | Descuento hiperbólico (Jackson & MacKillop, 2016) aplicado a obligaciones financieras | Ligera (sin integración bancaria real; solo captura + enlaces) | **Cluster 2 (Función Financiera):** Resuelto a **Nivel 1-2** (Bangma 2019; Pelham 2020). Demora y morosidad compensadas con captura y botón único de pago inmediato. |
| 4 | **Página 84** | Estudio académico | Conversión de macro-meta a micro-paso JIT (Gawrilow & Gollwitzer, 2008) + Teoría de Carga Cognitiva (Sweller, 1988) | Media | **Sin investigación adicional:** Mecanismo cubierto en R1 (Nivel 1-3). Solo si se añade SRS algorítmico requeriría nueva literatura. |
| 5 | **3 Tazas** | Hogar / tareas domésticas compartidas | Carga perceptual (Lavie, 2005) aplicada a desorden físico real | Media (alta si es compartida multiusuario) | **Cluster 8 (Co-responsabilidad Doméstica):** Resuelto a **Nivel 2 (Clínico) / Nivel 4 (Software)** (Eakin 2004; Canu 2014; Bruner 2015). Riesgo tóxico de dinámica "padre-hijo": solo viable con visibilidad pasiva anónima. |
| 6 | **Dosis Ahora** | Medicación / salud | Barkley: "point of performance" en toma de medicación; manual §6.4 (ventana de lucidez farmacológica) | Media (alcance sensible: solo recordatorio y registro, nunca consejo médico) | **Cluster 1 (Adherencia Farmacológica):** Resuelto a **Nivel 1-2** (Gajria 2014; Khan 2021; Fried 2020). El dominio más sólido del pool; olvidos mitigados por avisos sincrónicos. |
| 7 | **Cierre del Día** | Sueño / rutina nocturna | Extiende "Cierre Dopaminérgico sin Culpa" (manual, Regla 5) a la rutina de ir a dormir | Ligera (notificaciones locales + checklist simple) | **Cluster 6 (Sueño y Procrastinación):** Resuelto a **Nivel 1-2 (Biológico) / Nivel 4 (App)** (Coogan 2017; Kooij 2013; Kroese 2014; Kamphorst 2018). Prótesis de transición, no terapia médica de insomnio. |
| 8 | **Guion de 20 Segundos** | Llamadas telefónicas / comunicación aversiva | Colapso del EVC (Shenhav et al., 2013) ante costo de improvisación social | Ligera (módulo o standalone de mínima interfaz) | **Cluster 4 (Aversión Comunicacional):** Resuelto a **Nivel 2-3** (Reinsch 1990; Koyuncu 2015; Kandeğer 2026). Andamio cerrado que elimina el costo de improvisación verbal. |
| 9 | **Ruta Única** | Compras / mandados (espacio físico de retail) | Generaliza sobrecarga perceptual (Lavie, 2005; Micoulaud-Franchi, 2015) al local comercial | Media (geolocalización / lista lineal ordenada) | **Cluster 2 (Compra Impulsiva):** Resuelto a **Nivel 2-3** (Black 2012; Pelham 2020). Orden lineal estricto de pasillos (WIP=1 físico) suprimiendo la inundación perceptual del marketing. |
| 10 | **Presencia Silenciosa** | Accountability social / *body doubling* | Facilitación social (Zajonc, 1965) y reducción de aversión al esfuerzo por co-presencia | Media-alta (presencia en tiempo real o compartida) | **Cluster 9 (Body Doubling):** Resuelto a **Nivel 4 (Hipótesis Abierta / Especulativo)** (Zajonc 1965; Bond 1983; Schuenke 2025). Cero RCTs clínicos. Requiere diseño estrictamente no evaluativo. |
| 11 | **Escritorio en Foco** | Sistema operativo / gestión de ventanas (superset de TabWIP) | Competencia Sesgada (Desimone & Duncan, 1995) y Carga Perceptual (Lavie, 2005) a nivel del SO | Alta (requiere hooks de SO nativos: Win32/X11/Cocoa) | **Sin investigación adicional:** Mecanismo ya cubierto por la evidencia de TabWIP (Nivel 2-3). El riesgo es de ingeniería de bajo nivel de SO, no de evidencia científica. |
| 12 | **Notificador de Reenganche sin Culpa** | Capa transversal (ModelTasker, TabWIP, InboxJIT, etc.) | Operacionaliza el Protocolo de Reseteo sin Culpa (manual §4) y extingue la vergüenza aprendida | Media (servicio background consultando estado local) | **Cluster 7 (Ciclo Vergüenza-Reenganche):** Resuelto a **Nivel 1-2 (Clínico) / Nivel 3-4 (Ergonomía)** (Safren 2010; Beaton 2022; Strohmeier 2016). Sustenta el Eje D transversal. |

---

## Ejes temáticos de extensión

No son aplicaciones puntuales sino ejes bajo los cuales se puede organizar cualquier futura idea del pool (o ideas nuevas que no están aquí todavía).

### A. Prótesis en el punto de rendimiento, replicada por dominio (Barkley, 1997/2012)
El eje que explica casi todo el pool: cada app mueve el "punto de rendimiento" a un dominio distinto (bandeja de entrada, calendario, mesita de noche, pasillo del supermercado, mostrador de la farmacia). Aplica a **#1, #2, #3, #6, #7, #9**. La pregunta de diseño repetida en cada una es la misma: *¿dónde exactamente ocurre la acción, y cómo coloca el sistema la micro-acción ahí mismo, no en una lista aparte?*

### B. Reducción de carga perceptual a distintas escalas espaciales (Lavie, 2005; Desimone & Duncan, 1995)
Un eje de escala creciente: pestaña individual (TabWIP) → todas las ventanas del sistema operativo (**#11**) → desorden de un espacio físico compartido (**#5**) → campo visual de un entorno de retail (**#9**). El mecanismo neuro-ergonómico es idéntico en los cuatro; lo que cambia es la superficie de intervención y, con ella, la dificultad de ingeniería (de una extensión de navegador a hooks de SO).

### C. Cierre dopaminérgico como micro-librería reutilizable
Un eje técnico, no de dominio: el patrón "tachado + destello + contador de victorias sin rachas punitivas" (Regla 5 del manual) ya se implementó dos veces de forma independiente (ModelTasker y TabWIP). En vez de reimplementarlo en cada app nueva del pool (**#1, #3, #4, #6, #7, #8**), convendría extraerlo como un módulo compartido (p. ej. una librería TS pequeña sin dependencias) que cualquier app del pool pueda importar — consistente con la filosofía de "cero fricción, cero dependencias pesadas" de los dos proyectos ya construidos.

### D. Reenganche sin culpa como patrón de producto (manual, §4)
El Protocolo de Reseteo sin Culpa no debería vivir solo dentro de ModelTasker: es un patrón aplicable a cualquier herramienta con riesgo de abandono por vergüenza tras una ausencia. **#12** lo propone como servicio transversal; pero incluso sin construir #12, cualquier app nueva del pool debería heredar la misma regla de diseño: nunca mostrar "deuda acumulada" como fracaso, siempre ofrecer una ruta de purga de 1 clic.

### E. Co-regulación social sin vergüenza
El eje menos fundamentado del pool (solo **#10**, y parcialmente **#5** en su variante compartida). A diferencia de los ejes A-D, que se apoyan en mecanismos ya auditados a Nivel 1-3, este eje parte de una práctica popular (*body doubling*) sin respaldo citado en la auditoría existente. Cualquier app bajo este eje debería empezar por una investigación y auditoría nueva — no por el código — antes de hacer cualquier afirmación de eficacia.

---

## Nota honesta sobre el nivel de especulación y estado post-auditoría

La auditoría forense extendida en [`INVESTIGACION_EXTENDIDA_CLUSTERS.md`](file:///w:/Proyectos/ModelTaskerTDAH/INVESTIGACION_EXTENDIDA_CLUSTERS.md) formalizó la delimitación epistémica de estas ideas a través de 28 nuevas fuentes verificadas (DOIs/PMIDs comprobados):

1. **Respaldadas con evidencia clínica sólida (Nivel 1-2):** **#6 Dosis Ahora** y **#3 Cuentas YA** cuentan con literatura empírica directa sobre las fallas específicas en el *point of performance* (Gajria 2014; Khan 2021; Bangma 2019; Pelham 2020). Su desarrollo puede proceder con alta confianza científica.
2. **Prótesis cognitivas deducidas legítimas (Nivel 2-3):** **#2 Ahora/No-Ahora**, **#1 InboxJIT**, **#8 Guion de 20 Segundos** y **#9 Ruta Única** se sustentan en leyes cognitivas comprobadas (disociación de memoria prospectiva de Altgassen 2014, tensión por email de Kushlev 2015, aprensión telefónica de Reinsch 1990 y sobrecarga de retail). Su afirmación debe ser honesta: son *prótesis ergonómicas deducidas de la neuropsicología*, no terapias médicas.
3. **Frontera de precaución e hipótesis abierta (Nivel 4):** **#10 Presencia Silenciosa (*Body Doubling*)**, **#5 3 Tazas (Variante Compartida)** y **#7 Cierre del Día (Rutina de Sueño)** carecen de Ensayos Clínicos Controlados Aleatorizados (RCTs). El *body doubling* digital permanece como una práctica popular sin validación clínica (Schuenke 2025 es un estudio preliminar de laboratorio), la gestión doméstica compartida acarrea el riesgo tóxico de digitalizar dinámicas "padre-hijo" de reproche conyugal (Eakin 2004), y el insomnio en TDAH es una alteración cronobiológica primaria que requiere supervisión médica (Coogan 2017). Ninguna de estas tres apps debe comercializarse como "médicamente comprobada".
4. **Exentas de investigación adicional por estar ya cubiertas:** **#11 Escritorio en Foco** (riesgo de ingeniería de hooks de SO, no de evidencia) y **#4 Página 84** (cubierta en R1, salvo que se implemente repetición espaciada algorítmica).
