import re
import sys
from pathlib import Path
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, GEOB

def auditar_mp3(ruta_archivo: str):
    ruta = Path(ruta_archivo)
    if not ruta.exists():
        print(f"[!] El archivo no existe: {ruta}")
        return

    print("=" * 65)
    print(f" REPORTE FORENSE DE AUDIO: {ruta.name}")
    print("=" * 65)

    try:
        audio = MP3(ruta)
    except Exception as e:
        print(f"[!] Error leyendo el contenedor MP3: {e}")
        return

    # 1. Propiedades técnicas del flujo de audio
    info = audio.info
    print("\n[1] DATOS TÉCNICOS DEL STREAM")
    print(f"  • Duración    : {info.length:.2f} segundos")
    print(f"  • Bitrate     : {info.bitrate // 1000} kbps")
    print(f"  • Sample Rate : {info.sample_rate} Hz")
    print(f"  • Canales     : {info.channels}")
    print(f"  • Modo/Encoder: {getattr(info, 'encoder_info', 'No especificado')} ({getattr(info, 'bitrate_mode', 'N/A')})")

    # 2. Etiquetas ID3 y objetos incrustados
    print("\n[2] ETIQUETAS ID3 ENCONTRADAS")
    if not audio.tags:
        print("  • El archivo no posee cabecera ID3 estructurada.")
    else:
        for clave, frame in audio.tags.items():
            # Evitamos imprimir los bytes crudos de la foto de portada
            if isinstance(frame, APIC):
                print(f"  • [APIC] Portada incrustada: {frame.mime} ({len(frame.data)} bytes) - Desc: '{frame.desc}'")
            # Detectamos bloques binarios encapsulados (como C2PA)
            elif isinstance(frame, GEOB):
                print(f"  • [GEOB] Objeto binario oculto: MIME='{frame.mime}' | Desc='{frame.desc}' ({len(frame.data)} bytes)")
                analizar_bloque_c2pa(frame.data)
            else:
                valor = str(frame.text[0]) if hasattr(frame, 'text') and frame.text else str(frame)
                # Si es letra larga (USLT), la resumimos un poco o mostramos limpia
                if clave.startswith("USLT"):
                    lineas = valor.strip().splitlines()
                    preview = " / ".join(lineas[:4]) + ("..." if len(lineas) > 4 else "")
                    print(f"  • [{clave}] Letra incrustada ({len(lineas)} líneas): {preview}")
                else:
                    print(f"  • [{clave}] {valor}")

    # 3. Escaneo profundo en crudo (por si borraron el índice ID3 pero quedaron bytes huérfanos)
    print("\n[3] ESCANEO DE HUELLAS EN CRUDO (HEX/ASCII)")
    escanear_firmas_crudas(ruta)
    print("=" * 65)

def analizar_bloque_c2pa(datos_binarios: bytes):
    """Extrae cadenas clave legibles desde el contenedor CBOR/JUMBF de C2PA."""
    texto = datos_binarios.decode('ascii', errors='ignore')
    print("    └── [!] Desglose de Manifiesto C2PA detectado:")

    patrones = {
        "Proveedor"       : r"providerName[a-zA-Z0-9\s,\.]+",
        "Motor / Modelo"  : r"chirp-[a-z0-9\-]+",
        "ID de Contenido" : r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "Fecha Creación"  : r"202\d-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?",
        "Huella Audio"    : r"com\.suno\.[a-z0-9\.]+",
        "Tipo Origen"     : r"http://cv\.iptc\.org/newscodes/digitalsourcetype/[a-zA-Z]+"
    }

    for etiqueta, regex in patrones.items():
        coincidencias = list(dict.fromkeys(re.findall(regex, texto)))
        if coincidencias:
            print(f"        • {etiqueta:15}: {', '.join(coincidencias)}")

def escanear_firmas_crudas(ruta: Path):
    """Busca rastros de Suno o Lavf en los primeros y últimos 128 KB del archivo."""
    tamano = ruta.stat().st_size
    with open(ruta, "rb") as f:
        inicio = f.read(min(131072, tamano))
        if tamano > 131072:
            f.seek(max(0, tamano - 131072))
            final = f.read(131072)
        else:
            final = b""

    muestra = (inicio + final).decode('ascii', errors='ignore')
    hallazgos = re.findall(
        r"(suno\.com/song/[a-f0-9\-]+|made with suno[^`\x00-\x1f]+|Lavf[0-9\.]+|Suno C2PA Root CA)",
        muestra,
        re.IGNORECASE
    )
    unicos = list(dict.fromkeys(hallazgos))
    if unicos:
        for h in unicos:
            print(f"  • Rastro detectado: {h.strip()}")
    else:
        print("  • No se encontraron firmas de texto adicionales en las cabeceras.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python auditar_mp3.py <ruta_al_archivo.mp3>")
    else:
        auditar_mp3(sys.argv[1])
