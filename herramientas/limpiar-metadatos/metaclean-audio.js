/*
 * metaclean-audio.js — eliminación de metadatos en audio (MP3, FLAC, M4A/AAC).
 * Sin dependencias. window.MetaCleanAudio / module.exports.
 * No recodifica el audio: recorta las etiquetas y copia las muestras tal cual.
 * Expone también readId3v2(), el lector de marcos ID3 que reutiliza el Auditor de música IA.
 */
(function (root) {
  'use strict';

  function ascii(b, s, n) {
    var out = '';
    for (var i = 0; i < n && s + i < b.length; i++) out += String.fromCharCode(b[s + i]);
    return out;
  }
  function shorten(s) { return s.length > 40 ? s.slice(0, 38) + '…' : s; }
  function u32be(b, o) { return (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0; }
  function leU32(b, o) { return (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0; }
  function copy(b) { return b.slice(0); }
  function td(enc, data) { try { return new TextDecoder(enc).decode(data); } catch (e) { return ''; } }

  // Texto de un marco ID3: byte de codificación + datos.
  //   0 = ISO-8859-1, 1 = UTF-16 con BOM, 2 = UTF-16BE sin BOM, 3 = UTF-8
  function decodeId3Text(enc, data) {
    var s;
    if (enc === 1 || enc === 2) {
      var le = enc === 1;
      if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) { le = true; data = data.subarray(2); }
      else if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) { le = false; data = data.subarray(2); }
      s = td(le ? 'utf-16le' : 'utf-16be', data);
    } else if (enc === 3) s = td('utf-8', data);
    else { s = ''; for (var i = 0; i < data.length; i++) s += String.fromCharCode(data[i]); }
    return s.replace(/\0+$/, '');
  }

  function decodeFrameText(b, start, end) {
    return decodeId3Text(b[start], b.subarray(start + 1, end)).trim();
  }

  // =====================================================================
  //  MP3 — ID3v2 (inicio), ID3v1 y APEv2 (final)
  // =====================================================================
  function synchsafe(b, o) {
    return (b[o] & 0x7f) * 0x200000 + (b[o + 1] & 0x7f) * 0x4000 + (b[o + 2] & 0x7f) * 0x80 + (b[o + 3] & 0x7f);
  }

  function cleanMp3(bytes) {
    var found = [];
    var start = 0;
    var end = bytes.length;

    while (ascii(bytes, start, 3) === 'ID3' && start + 10 <= bytes.length) {
      var major = bytes[start + 3];
      var flags = bytes[start + 5];
      var size = 10 + synchsafe(bytes, start + 6);
      if (flags & 0x10) size += 10;
      describeId3v2(bytes, start + 10, Math.min(start + size, bytes.length), major, found);
      start += size;
      if (start >= bytes.length) { start = bytes.length; break; }
    }

    if (end - start >= 128 && ascii(bytes, end - 128, 3) === 'TAG') {
      found.push('🏷️ ID3v1');
      end -= 128;
      if (end - start >= 227 && ascii(bytes, end - 227, 4) === 'TAG+') end -= 227;
    }

    if (end - start >= 32 && ascii(bytes, end - 32, 8) === 'APETAGEX') {
      var apeTotal = leU32(bytes, end - 32 + 12) + 32;
      if (apeTotal <= end - start) { found.push('🏷️ APEv2'); end -= apeTotal; }
    }

    if (start === 0 && end === bytes.length) return { bytes: copy(bytes), found: found };
    return { bytes: bytes.slice(start, end), found: found };
  }

  function describeId3v2(b, from, to, major, found) {
    var picture = false, title = null, artist = null;
    var frames = readId3Frames(b, from, to, major, b[from - 5]).frames;
    frames.forEach(function (f) {
      if (f.id === 'APIC' || f.id === 'PIC') picture = true;
      else if (f.id === 'TIT2' || f.id === 'TT2') title = decodeFrameText(f.data, 0, f.data.length);
      else if (f.id === 'TPE1' || f.id === 'TP1') artist = decodeFrameText(f.data, 0, f.data.length);
    });
    if (title || artist) found.push('🎵 ' + shorten([artist, title].filter(Boolean).join(' — ')));
    if (picture) found.push('🖼️ Carátula');
    if (frames.length && !title && !artist && !picture) found.push('🏷️ Etiquetas ID3v2');
  }

  // ---------------------------------------------------------------------
  //  Lector de ID3v2 (2.2, 2.3 y 2.4) que recorre los marcos uno a uno.
  //  También lo usa el Auditor de música IA.
  // ---------------------------------------------------------------------

  // Deshace la «desincronización» de ID3: cada FF 00 vuelve a ser FF.
  function unsync(data) {
    var out = new Uint8Array(data.length), w = 0;
    for (var i = 0; i < data.length; i++) {
      out[w++] = data[i];
      if (data[i] === 0xff && data[i + 1] === 0x00) i++;
    }
    return out.subarray(0, w);
  }

  function validId(id, len) { return new RegExp('^[A-Z0-9]{' + len + '}$').test(id); }

  // Recorre los marcos de una etiqueta. `from`/`to` delimitan el cuerpo (tras la cabecera de 10 bytes).
  // Devuelve { frames: [{ id, offset, size, data, flags, compressed, encrypted }], warnings: [] }.
  function readId3Frames(b, from, to, major, tagFlags) {
    var warnings = [];
    var frames = [];
    var body = b.subarray(from, to);
    var base = from;               // posición en el archivo del inicio de `body` (aproximada si hay desincronización)
    if ((tagFlags & 0x80) && major < 4) { body = unsync(body); warnings.push('Etiqueta con desincronización (deshecha al leer).'); }

    var i = 0;
    if (tagFlags & 0x40 && major >= 3) {   // cabecera extendida
      var ext = major === 4 ? synchsafe(body, 0) : u32be(body, 0) + 4;
      if (ext > 0 && ext < body.length) i = ext;
    }

    var idLen = major === 2 ? 3 : 4;
    var headLen = major === 2 ? 6 : 10;
    function sizeAt(p, safe) {
      if (major === 2) return body[p + 3] << 16 | body[p + 4] << 8 | body[p + 5];
      return safe ? synchsafe(body, p + 4) : u32be(body, p + 4);
    }
    function looksLikeNext(p) { return p === body.length || p + headLen > body.length || body[p] === 0 || validId(ascii(body, p, idLen), idLen); }

    while (i + headLen <= body.length) {
      var id = ascii(body, i, idLen);
      if (!validId(id, idLen)) break;            // relleno (ceros) o basura
      var fsize = sizeAt(i, major === 4);
      // Algunos programas escriben tamaños sin «synchsafe» en ID3v2.4.
      if (major === 4 && !looksLikeNext(i + headLen + fsize)) {
        var alt = sizeAt(i, false);
        if (looksLikeNext(i + headLen + alt)) fsize = alt;
      }
      if (i + headLen + fsize > body.length) { warnings.push('El marco ' + id + ' se sale de la etiqueta; se detiene la lectura.'); break; }
      var fl = major === 2 ? 0 : (body[i + 8] << 8 | body[i + 9]);
      var data = body.subarray(i + headLen, i + headLen + fsize);
      var f = { id: id, offset: base + i, size: fsize, flags: fl, compressed: false, encrypted: false };
      if (major === 3) {
        if (fl & 0x0080) { f.compressed = true; data = data.subarray(4); }
        if (fl & 0x0040) { f.encrypted = true; data = data.subarray(1); }
        if (fl & 0x0020) data = data.subarray(1);
      } else if (major === 4) {
        if (fl & 0x0040) data = data.subarray(1);
        if (fl & 0x0008) f.compressed = true;
        if (fl & 0x0004) { f.encrypted = true; data = data.subarray(1); }
        if (fl & 0x0001) data = data.subarray(4);
        if ((fl & 0x0002) || (tagFlags & 0x80)) data = unsync(data);
      }
      f.data = data;
      frames.push(f);
      i += headLen + fsize;
    }
    return { frames: frames, warnings: warnings };
  }

  // Lee todas las etiquetas ID3v2 seguidas del principio del archivo.
  // Devuelve { tags: [{ offset, size, version, flags, frames, warnings }], end }.
  function readId3v2(bytes) {
    var tags = [];
    var start = 0;
    while (start + 10 <= bytes.length && ascii(bytes, start, 3) === 'ID3') {
      var major = bytes[start + 3];
      var flags = bytes[start + 5];
      var size = 10 + synchsafe(bytes, start + 6);
      if (flags & 0x10) size += 10;
      var to = Math.min(start + 10 + synchsafe(bytes, start + 6), bytes.length);
      var r = major >= 2 && major <= 4 ? readId3Frames(bytes, start + 10, to, major, flags)
        : { frames: [], warnings: ['Versión ID3v2.' + major + ' desconocida.'] };
      tags.push({ offset: start, size: size, version: '2.' + major + '.' + bytes[start + 4], flags: flags,
        frames: r.frames, warnings: r.warnings });
      start += size;
    }
    return { tags: tags, end: Math.min(start, bytes.length) };
  }

  // =====================================================================
  //  FLAC — bloques APPLICATION (2), VORBIS_COMMENT (4) y PICTURE (6)
  // =====================================================================
  function cleanFlac(bytes) {
    var found = [];
    var p = 0;
    if (ascii(bytes, 0, 3) === 'ID3') p = 10 + synchsafe(bytes, 6);
    if (ascii(bytes, p, 4) !== 'fLaC') throw new Error('no es un FLAC válido');

    var kept = [];
    var i = p + 4;
    var last = false;
    while (i + 4 <= bytes.length && !last) {
      var header = bytes[i];
      last = !!(header & 0x80);
      var type = header & 0x7f;
      var len = (bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
      var blockEnd = i + 4 + len;
      if (blockEnd > bytes.length) break;
      if (type === 4) describeVorbis(bytes, i + 4, blockEnd, found);
      else if (type === 6) found.push('🖼️ Carátula');
      else if (type === 2) found.push('🏷️ Bloque APPLICATION');
      else kept.push(bytes.subarray(i, blockEnd));
      i = blockEnd;
    }
    var audio = bytes.subarray(i);

    var total = p + 4;
    kept.forEach(function (bl) { total += bl.length; });
    total += audio.length;
    var out = new Uint8Array(total);
    out.set(bytes.subarray(0, p + 4), 0);
    var off = p + 4;
    kept.forEach(function (bl, idx) {
      out.set(bl, off);
      out[off] = idx === kept.length - 1 ? (bl[0] | 0x80) : (bl[0] & 0x7f);
      off += bl.length;
    });
    out.set(audio, off);
    return { bytes: out, found: found };
  }

  function describeVorbis(b, from, to, found) {
    try {
      var vlen = leU32(b, from);
      var pos = from + 4 + vlen;
      var n = leU32(b, pos); pos += 4;
      var title = null, artist = null;
      for (var k = 0; k < n && pos + 4 <= to; k++) {
        var clen = leU32(b, pos); pos += 4;
        var kv = td('utf-8', b.subarray(pos, pos + clen)); pos += clen;
        var eq = kv.indexOf('=');
        if (eq < 0) continue;
        var key = kv.slice(0, eq).toUpperCase();
        if (key === 'TITLE') title = kv.slice(eq + 1);
        else if (key === 'ARTIST') artist = kv.slice(eq + 1);
      }
      if (title || artist) found.push('🎵 ' + shorten([artist, title].filter(Boolean).join(' — ')));
      else found.push('🏷️ Comentarios Vorbis');
    } catch (e) { found.push('🏷️ Comentarios Vorbis'); }
  }

  // =====================================================================
  //  M4A / MP4 / MOV (ISO-BMFF) — quitar udta y meta de dentro de moov
  // =====================================================================
  var CONTAINERS = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, edts: 1, mvex: 1, udta: 1 };

  function readAtoms(b, from, to) {
    var atoms = [];
    var i = from;
    while (i + 8 <= to) {
      var size = u32be(b, i);
      var type = ascii(b, i + 4, 4);
      var headerSize = 8;
      if (size === 1) { size = u32be(b, i + 8) * 4294967296 + u32be(b, i + 12); headerSize = 16; }
      else if (size === 0) { size = to - i; }
      if (size < headerSize || i + size > to) break;
      atoms.push({ type: type, start: i, end: i + size, size: size, headerSize: headerSize });
      i += size;
    }
    return atoms;
  }

  function cleanM4a(bytes) { return cleanIsoBmff(bytes); }

  function cleanIsoBmff(bytes) {
    var found = [];
    var removals = [];               // [start,end) originales, a eliminar
    var sizeAdjust = {};             // atomStart -> bytes a restar del tamaño
    var stcoBoxes = [];              // {dataStart, is64}

    var top = readAtoms(bytes, 0, bytes.length);
    var moov = null;
    for (var t = 0; t < top.length; t++) if (top[t].type === 'moov') moov = top[t];
    if (!moov) throw new Error('no es un MP4/M4A válido (sin moov)');

    walk(moov, []);

    function walk(atom, ancestors) {
      var inMoov = atom.type === 'moov' || ancestors.some(function (a) { return a.type === 'moov'; });
      if (inMoov && (atom.type === 'udta' || atom.type === 'meta')) {
        describeUserData(bytes, atom, found);
        removals.push([atom.start, atom.end]);
        ancestors.forEach(function (a) {
          sizeAdjust[a.start] = (sizeAdjust[a.start] || 0) + atom.size;
        });
        return;
      }
      if (atom.type === 'stco' || atom.type === 'co64') {
        stcoBoxes.push({ dataStart: atom.start + atom.headerSize, is64: atom.type === 'co64' });
        return;
      }
      if (CONTAINERS[atom.type] || atom.type === 'moov') {
        var kids = readAtoms(bytes, atom.start + atom.headerSize, atom.end);
        var next = ancestors.concat([atom]);
        for (var k = 0; k < kids.length; k++) walk(kids[k], next);
      }
    }

    if (removals.length === 0) return { bytes: copy(bytes), found: found };

    removals.sort(function (a, b) { return a[0] - b[0]; });
    var removedTotal = removals.reduce(function (s, r) { return s + (r[1] - r[0]); }, 0);

    function removedBefore(oldPos) {
      var s = 0;
      for (var i = 0; i < removals.length; i++) {
        if (removals[i][0] >= oldPos) break;
        s += Math.min(removals[i][1], oldPos) - removals[i][0];
      }
      return s;
    }

    // 1) compactar
    var out = new Uint8Array(bytes.length - removedTotal);
    var w = 0, rp = 0;
    for (var ri = 0; ri < removals.length; ri++) {
      out.set(bytes.subarray(rp, removals[ri][0]), w);
      w += removals[ri][0] - rp;
      rp = removals[ri][1];
    }
    out.set(bytes.subarray(rp), w);

    // 2) corregir tamaños de contenedores afectados
    Object.keys(sizeAdjust).forEach(function (key) {
      var origStart = +key;
      var atom = atomAt(bytes, origStart);
      var np = origStart - removedBefore(origStart);
      var newSize = atom.size - sizeAdjust[key];
      if (atom.headerSize === 16) writeU64(out, np + 8, newSize);
      else writeU32(out, np, newSize);
    });

    // 3) corregir tablas de offsets de chunk
    stcoBoxes.forEach(function (box) {
      var base = box.dataStart - removedBefore(box.dataStart);
      var entryCount = u32be(out, base + 4);
      var p = base + 8;
      for (var e = 0; e < entryCount && p + (box.is64 ? 8 : 4) <= out.length; e++) {
        if (box.is64) {
          var v = u32be(out, p) * 4294967296 + u32be(out, p + 4);
          writeU64(out, p, v - removedBefore(v));
          p += 8;
        } else {
          var v32 = u32be(out, p);
          writeU32(out, p, v32 - removedBefore(v32));
          p += 4;
        }
      }
    });

    return { bytes: out, found: found };
  }

  function atomAt(b, start) {
    var size = u32be(b, start);
    var headerSize = 8;
    if (size === 1) { size = u32be(b, start + 8) * 4294967296 + u32be(b, start + 12); headerSize = 16; }
    return { size: size, headerSize: headerSize };
  }

  function describeUserData(b, atom, found) {
    var end = Math.min(atom.end, atom.start + 65536);
    var text = ascii(b, atom.start, end - atom.start);
    var flagged = false;

    // ©xyz (ISO 6709) o loci (coordenadas en punto fijo)
    var xyz = /[\xa9©]xyz.{0,4}([+\-]\d+\.?\d*[+\-]\d+\.?\d*)/.exec(text);
    if (xyz) {
      found.push('📍 Ubicación GPS: ' + xyz[1]); flagged = true;
    } else {
      var li = text.indexOf('loci');
      if (li >= 0) {
        var p = atom.start + li + 4 + 4 + 2;        // marca + version/flags + idioma
        while (p < end && b[p] !== 0) p++;           // saltar nombre (terminado en NUL)
        p++;                                         // NUL
        p++;                                         // rol
        if (p + 8 <= end) {
          var lon = int32(b, p) / 65536, lat = int32(b, p + 4) / 65536;
          if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) {
            found.push('📍 Ubicación GPS: ' + lat.toFixed(4) + ', ' + lon.toFixed(4));
            flagged = true;
          } else { found.push('📍 Ubicación GPS'); flagged = true; }
        } else { found.push('📍 Ubicación GPS'); flagged = true; }
      }
    }

    if (/apID|ownr|purd|\bcnID|xid /.test(text)) { found.push('🔑 Cuenta / compra (Apple ID)'); flagged = true; }
    if (/[\xa9©](nam|ART|alb|wrt|day)/.test(text)) { found.push('🎵 Título / artista / álbum'); flagged = true; }
    if (/[\xa9©]too|HandBrake|Lavf|encoder/.test(text)) { found.push('🛠️ Software'); flagged = true; }
    if (/[\xa9©]cmt|desc|ldes/.test(text)) { found.push('💬 Comentario / descripción'); flagged = true; }
    if (!flagged) found.push('🏷️ Datos de usuario (' + atom.type + ')');
  }

  function int32(b, o) { var v = u32be(b, o); return v >= 0x80000000 ? v - 0x100000000 : v; }

  function writeU32(b, o, v) { v = Math.round(v) >>> 0; b[o] = v >>> 24; b[o + 1] = v >>> 16; b[o + 2] = v >>> 8; b[o + 3] = v; }
  function writeU64(b, o, v) {
    v = Math.round(v);
    writeU32(b, o, Math.floor(v / 4294967296));
    writeU32(b, o + 4, v >>> 0);
  }

  var api = {
    cleanMp3: cleanMp3, cleanFlac: cleanFlac, cleanM4a: cleanM4a, cleanIsoBmff: cleanIsoBmff,
    readId3v2: readId3v2, readId3Frames: readId3Frames, decodeId3Text: decodeId3Text, synchsafe: synchsafe
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetaCleanAudio = api;
})(typeof self !== 'undefined' ? self : this);
