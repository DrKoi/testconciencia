# Backlog de TestConCiencia

Ideas pendientes para el sitio. Este archivo no se publica (está en `exclude` de `_config.yml`).

## Auditor de música IA (hecho)

Publicado en `herramientas/auditor-musica-ia/`. Partió del script de referencia
`_backlog/auditor-musica-ia/auditar_mp3.py`, que se conserva como histórico.

**Decisiones:**

- **ID3:** reutiliza el lector de `limpiar-metadatos/metaclean-audio.js`, que ahora exporta
  `readId3v2()` (2.2, 2.3 y 2.4, cabecera extendida, desincronización, marcos comprimidos y
  tamaños no «synchsafe» en 2.4). Se muestran todos los valores de cada marco y la descripción
  de `TXXX`/`WXXX`/`COMM`.
- **C2PA:** se lee el CBOR/JUMBF de verdad (sin expresiones regulares sobre el binario) y se
  comprueban con WebCrypto la firma COSE (ES256/384/512, PS256/384/512, Ed25519), los hashes de
  las aserciones y el hash del audio (`c2pa.hash.data`). **No** se contrasta el certificado con
  la lista de confianza de C2PA; la página lo dice.
- **`c2pa-js`:** valorada. Licencia MIT (© Adobe), pero `@contentauth/c2pa-web` pesa ~9 MB de
  WebAssembly, es un módulo ES con dependencias que exige un paso de compilación que el sitio no
  tiene, y la versión antigua (`c2pa`) está obsoleta. No se incluye, así que no hay nada nuevo
  que acreditar en `/licencias/`. Reconsiderar si se quiere validar contra la lista de confianza.
- **Escaneo en bruto:** recorre el archivo entero (se acabaron las ventanas de 128 KB y sus
  solapes) y se salta los bloques C2PA ya leídos, para no mezclar bytes de longitud de CBOR con
  los textos. El codificador sale de la cabecera Xing/LAME del primer frame.
- **Resultado:** «huellas de IA encontradas / no encontradas», nunca «hecho por humanos».
  `Lavf`/`Lavc` solo cuentan como contexto.

**Pendiente:** los patrones de texto son solo de Suno. Para Udio y otros servicios hacen falta
archivos de muestra reales antes de añadirlos (tabla `SIGNATURES` de `auditor.js`).
