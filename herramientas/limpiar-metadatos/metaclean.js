/*
 * metaclean.js — eliminación quirúrgica de metadatos en imágenes.
 * Sin dependencias. Usable desde el navegador (window.MetaClean) y desde Node (module.exports).
 * No recomprime los píxeles: solo borra los bloques de metadatos y copia el resto tal cual.
 */
(function (root) {
  'use strict';

  function asciiAt(bytes, start, n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      var idx = start + i;
      if (idx >= bytes.length) break;
      s += String.fromCharCode(bytes[idx]);
    }
    return s;
  }

  function shorten(s) { return s.length > 42 ? s.slice(0, 40) + '…' : s; }

  function readUntilNul(bytes, start, max) {
    var s = '';
    for (var i = 0; i < max; i++) {
      var c = bytes[start + i];
      if (c === 0 || c === undefined) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }

  // TIFF/EXIF mínimo: solo los campos que importan para privacidad.
  // tiffStart = desplazamiento del encabezado TIFF dentro de `data`
  //   (6 para el payload APP1 de JPEG tras "Exif\0\0"; 0 para eXIf de PNG / EXIF de WebP).
  function parseExif(data, tiffStart) {
    var res = {};
    try {
      if (data.length < tiffStart + 8) return res;
      var b0 = data[tiffStart], b1 = data[tiffStart + 1];
      var le;
      if (b0 === 0x49 && b1 === 0x49) le = true;
      else if (b0 === 0x4D && b1 === 0x4D) le = false;
      else return res;

      function u16(o) {
        return le ? (data[o] | data[o + 1] << 8) : (data[o] << 8 | data[o + 1]);
      }
      function u32(o) {
        return (le
          ? (data[o] | data[o + 1] << 8 | data[o + 2] << 16 | data[o + 3] << 24)
          : (data[o] << 24 | data[o + 1] << 16 | data[o + 2] << 8 | data[o + 3])) >>> 0;
      }
      function readIFD(base) {
        var entries = {};
        if (base + 2 > data.length) return entries;
        var n = u16(base);
        for (var i = 0; i < n; i++) {
          var e = base + 2 + i * 12;
          if (e + 12 > data.length) break;
          entries[u16(e)] = { count: u32(e + 4), valOff: e + 8 };
        }
        return entries;
      }
      function ascii(ent) {
        if (!ent) return null;
        var size = ent.count;
        var start = size <= 4 ? ent.valOff : tiffStart + u32(ent.valOff);
        var s = '';
        for (var i = 0; i < size; i++) {
          if (start + i >= data.length) break;
          var c = data[start + i];
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        return s.trim() || null;
      }
      function rat3(ent) {
        var start = tiffStart + u32(ent.valOff);
        var out = [];
        for (var i = 0; i < 3; i++) {
          var num = u32(start + i * 8), den = u32(start + i * 8 + 4);
          out.push(den ? num / den : 0);
        }
        return out;
      }

      var ifd0 = tiffStart + u32(tiffStart + 4);
      var e0 = readIFD(ifd0);
      res.make = ascii(e0[0x010F]);
      res.model = ascii(e0[0x0110]);
      res.software = ascii(e0[0x0131]);
      res.dateTime = ascii(e0[0x0132]);
      res.artist = ascii(e0[0x013B]);
      res.copyright = ascii(e0[0x8298]);

      if (e0[0x8769]) {
        var ee = readIFD(tiffStart + u32(e0[0x8769].valOff));
        res.dateOriginal = ascii(ee[0x9003]);
        res.owner = ascii(ee[0xA430]);
        res.lens = ascii(ee[0xA434]);
        res.uniqueId = ascii(ee[0xA420]);
      }
      if (e0[0x8825]) {
        var g = readIFD(tiffStart + u32(e0[0x8825].valOff));
        if (g[0x0002] && g[0x0004]) {
          var lat = rat3(g[0x0002]), lon = rat3(g[0x0004]);
          var latDec = lat[0] + lat[1] / 60 + lat[2] / 3600;
          var lonDec = lon[0] + lon[1] / 60 + lon[2] / 3600;
          if (/S/i.test(ascii(g[0x0001]) || '')) latDec = -latDec;
          if (/W/i.test(ascii(g[0x0003]) || '')) lonDec = -lonDec;
          if (isFinite(latDec) && isFinite(lonDec) && (latDec || lonDec)) res.gps = { lat: latDec, lon: lonDec };
        }
      }
    } catch (e) {}
    return res;
  }

  function exifChips(exif) {
    var found = [];
    if (!exif) return found;
    if (exif.gps) found.push('📍 Ubicación GPS: ' + exif.gps.lat.toFixed(5) + ', ' + exif.gps.lon.toFixed(5));
    if (exif.make || exif.model) found.push('📷 ' + shorten(((exif.make || '') + ' ' + (exif.model || '')).trim()));
    if (exif.lens) found.push('🔭 ' + shorten(exif.lens));
    if (exif.software) found.push('🛠️ ' + shorten(exif.software));
    if (exif.dateOriginal || exif.dateTime) found.push('🕐 ' + (exif.dateOriginal || exif.dateTime));
    if (exif.artist || exif.owner) found.push('✍️ ' + shorten(exif.artist || exif.owner));
    if (exif.copyright) found.push('© ' + shorten(exif.copyright));
    if (exif.uniqueId) found.push('🔑 ID de imagen');
    return found;
  }

  // ---- JPEG -------------------------------------------------------------
  function cleanJpeg(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw new Error('no es un JPEG válido');
    var out = [0xFF, 0xD8];
    var found = [];
    var i = 2;
    var len = bytes.length;
    while (i < len - 1) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      var marker = bytes[i + 1];
      if (marker === 0xFF) { i++; continue; }
      if (marker === 0xD9) { out.push(0xFF, 0xD9); break; }
      if (marker === 0xDA) { for (var k = i; k < len; k++) out.push(bytes[k]); break; }
      if (marker >= 0xD0 && marker <= 0xD7) { out.push(0xFF, marker); i += 2; continue; }
      var segLen = (bytes[i + 2] << 8) | bytes[i + 3];
      var segEnd = i + 2 + segLen;
      if (segEnd > len) segEnd = len;
      var drop = false;
      if (marker === 0xE1) {
        var tag = asciiAt(bytes, i + 4, 6);
        if (tag.indexOf('Exif') === 0) {
          drop = true;
          pushAll(found, exifChips(parseExif(bytes.subarray(i + 4, segEnd), 6)));
          if (!found.length) found.push('🏷️ EXIF');
        } else if (/ns\.adobe\.com|xmpmeta|xpacket/.test(asciiAt(bytes, i + 4, 40))) {
          drop = true; found.push('🏷️ XMP');
        } else { drop = true; found.push('🏷️ APP1'); }
      } else if (marker === 0xED) { drop = true; found.push('🏷️ IPTC / Photoshop'); }
      else if (marker === 0xFE) {
        drop = true;
        var c = asciiAt(bytes, i + 4, Math.min(segLen - 2, 60)).replace(/[^\x20-\x7e]/g, ' ').trim();
        found.push(c ? '💬 Comentario: ' + shorten(c) : '💬 Comentario');
      }
      if (!drop) { for (var j = i; j < segEnd; j++) out.push(bytes[j]); }
      i = segEnd;
    }
    return { bytes: new Uint8Array(out), found: found };
  }

  // ---- PNG -------------------------------------------------------------
  var PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  function cleanPng(bytes) {
    for (var s = 0; s < 8; s++) if (bytes[s] !== PNG_SIG[s]) throw new Error('no es un PNG válido');
    var strip = { tEXt: 1, zTXt: 1, iTXt: 1, eXIf: 1, tIME: 1, dSIG: 1 };
    var out = [];
    for (var s2 = 0; s2 < 8; s2++) out.push(bytes[s2]);
    var found = [];
    var texts = [];
    var i = 8;
    var len = bytes.length;
    while (i + 8 <= len) {
      var clen = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
      var type = asciiAt(bytes, i + 4, 4);
      var chunkEnd = i + 12 + clen;
      if (chunkEnd > len) break;
      if (strip[type]) {
        if (type === 'eXIf') {
          pushAll(found, exifChips(parseExif(bytes.subarray(i + 8, i + 8 + clen), 0)));
        } else if (type === 'tIME') {
          found.push('🕐 Fecha de modificación');
        } else {
          var kw = readUntilNul(bytes, i + 8, Math.min(clen, 79));
          if (kw) texts.push(kw);
        }
      } else {
        for (var j = i; j < chunkEnd; j++) out.push(bytes[j]);
      }
      if (type === 'IEND') break;
      i = chunkEnd;
    }
    if (texts.length) found.push('🏷️ Texto: ' + shorten(texts.join(', ')));
    return { bytes: new Uint8Array(out), found: found };
  }

  // ---- WebP ----------------------------------------------------------
  function cleanWebp(bytes) {
    if (asciiAt(bytes, 0, 4) !== 'RIFF' || asciiAt(bytes, 8, 4) !== 'WEBP') {
      throw new Error('no es un WebP válido');
    }
    var found = [];
    var kept = [];
    var vp8xIdx = -1;
    var i = 12;
    var len = bytes.length;
    while (i + 8 <= len) {
      var fourcc = asciiAt(bytes, i, 4);
      var size = (bytes[i + 4] | bytes[i + 5] << 8 | bytes[i + 6] << 16 | bytes[i + 7] << 24) >>> 0;
      var dataEnd = i + 8 + size;
      var padded = dataEnd + (size & 1);
      if (padded > len) padded = len;
      if (fourcc === 'EXIF') {
        pushAll(found, exifChips(parseExif(bytes.subarray(i + 8, dataEnd), 0)));
        if (!found.length) found.push('🏷️ EXIF');
      } else if (fourcc === 'XMP ') {
        found.push('🏷️ XMP');
      } else {
        if (fourcc === 'VP8X') vp8xIdx = kept.length;
        kept.push(bytes.subarray(i, padded));
      }
      i = padded;
    }
    var bodyLen = 4;
    kept.forEach(function (c) { bodyLen += c.length; });
    var res = new Uint8Array(8 + bodyLen);
    res[0] = 0x52; res[1] = 0x49; res[2] = 0x46; res[3] = 0x46;
    res[4] = bodyLen & 0xFF; res[5] = (bodyLen >>> 8) & 0xFF;
    res[6] = (bodyLen >>> 16) & 0xFF; res[7] = (bodyLen >>> 24) & 0xFF;
    res[8] = 0x57; res[9] = 0x45; res[10] = 0x42; res[11] = 0x50;
    var off = 12;
    kept.forEach(function (c, idx) {
      var copy = c.slice(0);
      if (idx === vp8xIdx && copy.length >= 9) copy[8] = copy[8] & ~0x0C;
      res.set(copy, off);
      off += copy.length;
    });
    return { bytes: res, found: found };
  }

  function pushAll(arr, more) { for (var i = 0; i < more.length; i++) arr.push(more[i]); }

  var api = {
    cleanJpeg: cleanJpeg,
    cleanPng: cleanPng,
    cleanWebp: cleanWebp,
    parseExif: parseExif,
    exifChips: exifChips
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetaClean = api;
})(typeof self !== 'undefined' ? self : this);
