# Backlog de TestConCiencia

Ideas pendientes para el sitio. Este archivo no se publica (está en `exclude` de `_config.yml`).

## Auditor de música IA (idea, sin empezar)

Herramienta para cargar un MP3 y mostrar las huellas que delatan que se generó con IA:
datos técnicos del audio, todas las etiquetas ID3 y el manifiesto C2PA que algunos
servicios (por ejemplo, Suno) guardan en un marco `GEOB`.

**Punto de partida:** el script de referencia `_backlog/auditor-musica-ia/auditar_mp3.py`
(Python + mutagen). Hace tres cosas:

1. Lee duración, bitrate, frecuencia de muestreo, canales y codificador.
2. Lista las etiquetas ID3 sin volcar binarios: portada `APIC` resumida, letra `USLT` en
   vista previa y bloques `GEOB`.
3. Busca en el manifiesto C2PA y en los primeros/últimos 128 KB textos como el proveedor,
   el modelo (`chirp-…`), UUID, fecha, `com.suno.…`, el tipo de origen IPTC y
   `suno.com/song/…`.

**Cómo llevarlo al sitio (100 % en el navegador, como el resto):**

- Leer ID3v2 en JavaScript sin dependencias. `limpiar-metadatos/metaclean-audio.js` ya
  recorre los marcos ID3v2, así que se puede reutilizar su lector.
- Para C2PA, valorar la biblioteca oficial de la Content Authenticity Initiative
  (`c2pa-js`, WebAssembly) para **verificar la firma** del manifiesto, en vez de solo buscar
  textos con expresiones regulares. Revisar su licencia antes de incluirla en el sitio y
  añadirla a `/licencias/`.
- Mostrar el resultado como «evidencias encontradas / no encontradas», nunca como
  «hecho por humanos».

**Advertencias que la herramienta debe dejar claras:**

- **No encontrar huellas no prueba que sea humano.** Cualquier recodificación o limpieza de
  etiquetas las borra.
- **`Lavf…` no indica IA por sí solo.** Es la marca de FFmpeg, que usan muchísimos programas
  normales de audio. Solo debe contar como dato de contexto, nunca como prueba.
- Las expresiones del script son específicas de Suno. Para otros servicios (Udio, etc.)
  hacen falta archivos de muestra reales antes de añadir patrones.

**Sobre el segundo script (`limpiar_mp3.py`):** no hace falta como herramienta nueva.
«Limpiar metadatos» ya elimina ID3v2 completo (con `GEOB`/C2PA, `APIC` y `USLT`), ID3v1 y
APEv2 sin recodificar el audio. No conviene presentar en el sitio una función para
«borrar la huella de IA»: contradice al auditor, y plataformas como Spotify, YouTube o las
distribuidoras piden declarar el contenido generado con IA.
