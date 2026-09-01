/*
 * metaclean-audio.js — eliminación de metadatos en audio (MP3, FLAC, M4A/AAC).
 * Sin dependencias. window.MetaCleanAudio / module.exports.
 * No recodifica el audio: recorta las etiquetas y copia las muestras tal cual.
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

  function decodeFrameText(b, start, end) {
    var enc = b[start];
    var data = b.subarray(start + 1, end);
    var s;
    if (enc === 1 || enc === 2) s = td('utf-16', data);
    else if (enc === 3) s = td('utf-8', data);
    else { s = ''; for (var i = 0; i < data.length; i++) s += String.fromCharCode(data[i]); }
    return s.replace(/\0+$/, '').trim();
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
    var picture = false, title = null, artist = null, count = 0;
    var i = from;
    while (i + 10 <= to) {
      var id = ascii(b, i, 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      var fsize = major === 4 ? synchsafe(b, i + 4) : u32be(b, i + 4);
      var body = i + 10;
      if (fsize <= 0 || body + fsize > to) break;
      if (id === 'APIC') picture = true;
      else if (id === 'TIT2') title = decodeFrameText(b, body, body + fsize);
      else if (id === 'TPE1') artist = decodeFrameText(b, body, body + fsize);
      count++;
      i = body + fsize;
    }
    if (title || artist) found.push('🎵 ' + shorten([artist, title].filter(Boolean).join(' — ')));
    if (picture) found.push('🖼️ Carátula');
    if (count && !title && !artist && !picture) found.push('🏷️ Etiquetas ID3v2');
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

  var api = { cleanMp3: cleanMp3, cleanFlac: cleanFlac, cleanM4a: cleanM4a, cleanIsoBmff: cleanIsoBmff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetaCleanAudio = api;
})(typeof self !== 'undefined' ? self : this);
