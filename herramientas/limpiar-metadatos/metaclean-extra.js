/*
 * metaclean-extra.js — formatos menores: RTF, SVG, GIF.
 * Sin dependencias. window.MetaCleanExtra / module.exports.
 */
(function (root) {
  'use strict';

  function shorten(s) { return s.length > 40 ? s.slice(0, 38) + '…' : s; }
  function latin1(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
  function toLatin1(str) { var b = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff; return b; }

  // ---- RTF: grupos {\info ...}, {\*\generator ...}, {\*\revtbl ...} ----
  function cleanRtf(bytes) {
    var s = latin1(bytes);
    if (s.slice(0, 5) !== '{\\rtf') throw new Error('no es un RTF válido');
    var found = [];
    var groups = ['\\info', '\\*\\generator', '\\*\\revtbl', '\\*\\passwordhash', '\\*\\latentstyles'];
    groups.forEach(function (marker) {
      var idx;
      while ((idx = s.indexOf('{' + marker)) >= 0) {
        var endIdx = matchBrace(s, idx);
        if (endIdx < 0) break;
        if (marker === '\\info') describeRtfInfo(s.slice(idx, endIdx + 1), found);
        else if (marker === '\\*\\generator') found.push('🛠️ Generador');
        else if (marker === '\\*\\revtbl') found.push('🔁 Tabla de revisiones');
        else if (marker === '\\*\\passwordhash') found.push('🔑 Hash de contraseña');
        s = s.slice(0, idx) + s.slice(endIdx + 1);
      }
    });
    return { bytes: toLatin1(s), found: found };
  }

  function matchBrace(s, start) {
    var depth = 0;
    for (var i = start; i < s.length; i++) {
      var c = s[i];
      if (c === '\\') { i++; continue; }        // saltar carácter escapado
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  function describeRtfInfo(chunk, found) {
    var fields = { title: '📄 Título', author: '✍️ Autor', operator: '✍️ Editado por',
      company: '🏢 Empresa', manager: '👤 Responsable', keywords: '🏷️ Palabras clave' };
    Object.keys(fields).forEach(function (k) {
      var m = new RegExp('\\{\\\\' + k + ' ([^}]*)\\}').exec(chunk);
      if (m && m[1].trim()) found.push(fields[k] + ': ' + shorten(m[1].trim()));
    });
    if (/\\(creatim|revtim|printim)/.test(chunk)) found.push('🕐 Fechas del documento');
    if (!found.length) found.push('🏷️ Bloque \\info');
  }

  // ---- SVG: <metadata>, comentarios, atributos inkscape:/sodipodi: -----
  function cleanSvg(bytes) {
    var s = new TextDecoder('utf-8').decode(bytes);
    if (s.indexOf('<svg') < 0) throw new Error('no es un SVG válido');
    var found = [];

    if (/<metadata[\s>]/.test(s)) {
      if (/dc:|rdf:|cc:/.test(s)) found.push('🏷️ Metadatos RDF/Dublin Core');
      else found.push('🏷️ Bloque <metadata>');
    }
    if (/\binkscape:|\bsodipodi:/.test(s)) found.push('🛠️ Datos de editor (Inkscape)');
    if (/<!--/.test(s)) found.push('💬 Comentarios');

    s = s.replace(/<metadata[\s\S]*?<\/metadata>/g, '');
    s = s.replace(/<metadata[^>]*\/>/g, '');
    s = s.replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/g, '');
    s = s.replace(/<sodipodi:namedview[^>]*\/>/g, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    // atributos con prefijo de editor
    s = s.replace(/\s(?:inkscape|sodipodi):[\w-]+\s*=\s*"[^"]*"/g, '');
    s = s.replace(/\s(?:inkscape|sodipodi):[\w-]+\s*=\s*'[^']*'/g, '');
    // declaraciones de namespace ya sin uso
    s = s.replace(/\sxmlns:(?:inkscape|sodipodi|dc|cc|rdf)\s*=\s*"[^"]*"/g, '');
    s = s.replace(/\n{3,}/g, '\n\n');

    return { bytes: new TextEncoder().encode(s), found: found };
  }

  // ---- GIF: extensiones de comentario (0xFE), texto (0x01) y XMP -------
  function cleanGif(bytes) {
    var sig = latin1(bytes.subarray(0, 6));
    if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('no es un GIF válido');
    var found = [];
    var out = [];
    var i = 0;

    function push(a, b) { for (var k = a; k < b; k++) out.push(bytes[k]); }
    function skipSubBlocks(p) {
      while (p < bytes.length) {
        var len = bytes[p];
        p += 1 + len;
        if (len === 0) break;
      }
      return p;
    }
    function copySubBlocks(p) {
      while (p < bytes.length) {
        var len = bytes[p];
        push(p, p + 1 + len);
        p += 1 + len;
        if (len === 0) break;
      }
      return p;
    }

    // cabecera + descriptor de pantalla lógica
    push(0, 13);
    var packed = bytes[10];
    i = 13;
    if (packed & 0x80) { // tabla global de color
      var gct = 3 * (1 << ((packed & 0x07) + 1));
      push(i, i + gct);
      i += gct;
    }

    while (i < bytes.length) {
      var b = bytes[i];
      if (b === 0x3B) { out.push(0x3B); break; }           // trailer
      if (b === 0x2C) {                                     // descriptor de imagen
        var start = i;
        push(i, i + 10);
        var ip = bytes[i + 9];
        i += 10;
        if (ip & 0x80) { var lct = 3 * (1 << ((ip & 0x07) + 1)); push(i, i + lct); i += lct; }
        out.push(bytes[i]); i += 1;                         // LZW min code size
        i = copySubBlocks(i);
        continue;
      }
      if (b === 0x21) {                                     // extensión
        var label = bytes[i + 1];
        if (label === 0xFE) { found.push('💬 Comentario'); i = skipSubBlocks(i + 2); continue; }
        if (label === 0x01) { found.push('💬 Texto incrustado'); i = skipSubBlocks(i + 15); continue; }
        if (label === 0xFF) {
          var appId = latin1(bytes.subarray(i + 3, i + 3 + 11));
          if (/XMP|Adobe/i.test(appId)) { found.push('🏷️ XMP'); i = skipSubBlocks(i + 14); continue; }
          // NETSCAPE (bucle) y otras: conservar
          push(i, i + 14);
          i = copySubBlocks(i + 14);
          continue;
        }
        // 0xF9 control gráfico u otras: conservar
        push(i, i + 2);
        i = copySubBlocks(i + 2);
        continue;
      }
      // byte inesperado: abortar copiando el resto
      push(i, bytes.length);
      break;
    }

    return { bytes: new Uint8Array(out), found: found };
  }

  var api = { cleanRtf: cleanRtf, cleanSvg: cleanSvg, cleanGif: cleanGif };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetaCleanExtra = api;
})(typeof self !== 'undefined' ? self : this);
