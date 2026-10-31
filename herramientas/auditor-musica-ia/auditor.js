/*
 * auditor.js — Auditor de música IA (TestConCiencia).
 * Busca en un MP3 las huellas que deja la música generada con IA: etiquetas ID3,
 * manifiesto C2PA (CBOR/JUMBF, con su firma COSE comprobada con WebCrypto),
 * cabecera Xing/LAME y textos conocidos en los bytes del archivo.
 *
 * Sin dependencias externas. Necesita metaclean-audio.js (lector de ID3v2) cargado antes.
 * window.AuditorMusica / module.exports. Todo ocurre en el navegador: no se sube nada.
 */
(function (root) {
  'use strict';

  var ID3 = (typeof module !== 'undefined' && module.exports)
    ? require('../limpiar-metadatos/metaclean-audio.js')
    : root.MetaCleanAudio;
  var cryptoObj = root.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  var subtle = cryptoObj && cryptoObj.subtle;

  // =====================================================================
  //  Utilidades
  // =====================================================================
  function ascii(b, s, n) {
    var out = '';
    for (var i = 0; i < n && s + i < b.length; i++) out += String.fromCharCode(b[s + i]);
    return out;
  }
  function u16be(b, o) { return b[o] << 8 | b[o + 1]; }
  function u32be(b, o) { return (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0; }
  function u32le(b, o) { return (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0; }
  function utf8(data) { try { return new TextDecoder('utf-8').decode(data); } catch (e) { return ''; } }
  function hex(data, max) {
    var s = '';
    var n = Math.min(data.length, max || data.length);
    for (var i = 0; i < n; i++) s += (data[i] < 16 ? '0' : '') + data[i].toString(16);
    return s + (n < data.length ? '…' : '');
  }
  function sameBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function concat(parts) {
    var n = 0;
    parts.forEach(function (p) { n += p.length; });
    var out = new Uint8Array(n), o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  function hashName(alg) {
    var a = String(alg || 'sha256').toLowerCase().replace(/[^a-z0-9]/g, '');
    return a === 'sha384' ? 'SHA-384' : a === 'sha512' ? 'SHA-512' : a === 'sha256' ? 'SHA-256' : null;
  }
  function digest(alg, data) {
    var h = hashName(alg);
    if (!h || !subtle) return Promise.resolve(null);
    return subtle.digest(h, data).then(function (r) { return new Uint8Array(r); });
  }

  // =====================================================================
  //  CBOR (RFC 8949) — decodificador completo y codificador mínimo
  // =====================================================================
  function CborTag(tag, value) { this.tag = tag; this.value = value; }
  var BREAK = {};

  function cborDecode(b, start) {
    var p = start || 0;
    function len(ai) {
      if (ai < 24) return ai;
      if (ai === 24) return b[p++];
      if (ai === 25) { var v = u16be(b, p); p += 2; return v; }
      if (ai === 26) { var w = u32be(b, p); p += 4; return w; }
      if (ai === 27) { var hi = u32be(b, p), lo = u32be(b, p + 4); p += 8; return hi * 4294967296 + lo; }
      if (ai === 31) return -1;
      throw new Error('CBOR no válido');
    }
    function item(depth) {
      if (depth > 64) throw new Error('CBOR demasiado anidado');
      if (p >= b.length) throw new Error('CBOR truncado');
      var ib = b[p++], mt = ib >> 5, ai = ib & 31, n, out, k, x;
      if (mt === 7) {
        if (ai === 20) return false;
        if (ai === 21) return true;
        if (ai === 22) return null;
        if (ai === 23) return undefined;
        if (ai === 25) { var h = u16be(b, p); p += 2; return half(h); }
        if (ai === 26) { var dv = new DataView(b.buffer, b.byteOffset + p, 4); p += 4; return dv.getFloat32(0); }
        if (ai === 27) { var dv8 = new DataView(b.buffer, b.byteOffset + p, 8); p += 8; return dv8.getFloat64(0); }
        if (ai === 31) return BREAK;
        if (ai === 24) { p++; return undefined; }
        return undefined;
      }
      n = len(ai);
      switch (mt) {
        case 0: return n;
        case 1: return -1 - n;
        case 2:
        case 3:
          if (n < 0) {
            var chunks = [];
            while ((x = item(depth + 1)) !== BREAK) chunks.push(typeof x === 'string' ? new TextEncoder().encode(x) : x);
            out = concat(chunks);
          } else {
            if (p + n > b.length) throw new Error('CBOR truncado');
            out = b.subarray(p, p + n); p += n;
          }
          return mt === 2 ? out : utf8(out);
        case 4:
          out = [];
          if (n < 0) { while ((x = item(depth + 1)) !== BREAK) out.push(x); }
          else for (k = 0; k < n; k++) out.push(item(depth + 1));
          return out;
        case 5:
          out = {};
          for (k = 0; n < 0 || k < n; k++) {
            var key = item(depth + 1);
            if (key === BREAK) break;
            out[String(key)] = item(depth + 1);
          }
          return out;
        case 6: return new CborTag(n, item(depth + 1));
      }
      throw new Error('CBOR no válido');
    }
    function half(h) {
      var e = (h >> 10) & 0x1f, m = h & 0x3ff, s = h & 0x8000 ? -1 : 1;
      if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
      if (e === 31) return m ? NaN : s * Infinity;
      return s * Math.pow(2, e - 15) * (1 + m / 1024);
    }
    var value = item(0);
    return { value: value, end: p };
  }

  function cborHead(mt, n) {
    if (n < 24) return [mt << 5 | n];
    if (n < 256) return [mt << 5 | 24, n];
    if (n < 65536) return [mt << 5 | 25, n >> 8, n & 255];
    return [mt << 5 | 26, n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  }
  // Solo lo necesario para el Sig_structure de COSE: array de textos y bytes.
  function cborEncodeArray(items) {
    var parts = [new Uint8Array(cborHead(4, items.length))];
    items.forEach(function (it) {
      var data = typeof it === 'string' ? new TextEncoder().encode(it) : it;
      parts.push(new Uint8Array(cborHead(typeof it === 'string' ? 3 : 2, data.length)), data);
    });
    return concat(parts);
  }

  // =====================================================================
  //  JUMBF (ISO 19566-5): cajas «jumb» con su descripción «jumd»
  // =====================================================================
  function readBoxes(b, from, to) {
    var boxes = [], i = from;
    while (i + 8 <= to) {
      var size = u32be(b, i), type = ascii(b, i + 4, 4), head = 8;
      if (size === 1) { size = u32be(b, i + 8) * 4294967296 + u32be(b, i + 12); head = 16; }
      else if (size === 0) size = to - i;
      if (size < head || i + size > to) break;
      boxes.push({ type: type, start: i, end: i + size, dataStart: i + head });
      i += size;
    }
    return boxes;
  }

  function parseSuperbox(b, box, depth) {
    if (depth > 16) throw new Error('JUMBF demasiado anidado');
    var kids = readBoxes(b, box.dataStart, box.end);
    if (!kids.length || kids[0].type !== 'jumd') throw new Error('caja JUMBF sin descripción');
    var d = kids[0], p = d.dataStart;
    var sb = {
      start: box.start, end: box.end, dataStart: box.dataStart,
      uuid: hex(b.subarray(p, p + 16)), type: ascii(b, p, 4).replace(/[^\x20-\x7e]/g, ''),
      label: null, children: [], content: []
    };
    var toggles = b[p + 16], q = p + 17;
    if (toggles & 2) {
      var z = q;
      while (z < d.end && b[z] !== 0) z++;
      sb.label = utf8(b.subarray(q, z));
      q = z + 1;
    }
    for (var k = 1; k < kids.length; k++) {
      if (kids[k].type === 'jumb') sb.children.push(parseSuperbox(b, kids[k], depth + 1));
      else sb.content.push({ type: kids[k].type, data: b.subarray(kids[k].dataStart, kids[k].end) });
    }
    return sb;
  }

  function child(sb, label) {
    for (var i = 0; i < sb.children.length; i++) if (sb.children[i].label === label) return sb.children[i];
    return null;
  }

  // Contenido de una aserción: CBOR, JSON o archivo incrustado.
  function assertionContent(sb) {
    for (var i = 0; i < sb.content.length; i++) {
      var c = sb.content[i];
      try {
        if (c.type === 'cbor') return { kind: 'cbor', data: cborDecode(c.data, 0).value, size: c.data.length };
        if (c.type === 'json') return { kind: 'json', data: JSON.parse(utf8(c.data)), size: c.data.length };
      } catch (e) { return { kind: 'error', error: e.message, size: c.data.length }; }
    }
    var size = 0;
    sb.content.forEach(function (c) { size += c.data.length; });
    return { kind: 'binary', size: size, types: sb.content.map(function (c) { return c.type; }) };
  }

  // =====================================================================
  //  ASN.1 DER y certificados X.509 (lo justo para leer el firmante)
  // =====================================================================
  function tlv(b, p) {
    var tag = b[p], l = b[p + 1], h = 2;
    if (l & 0x80) {
      var n = l & 0x7f;
      if (n < 1 || n > 4) throw new Error('DER no válido');
      l = 0;
      for (var i = 0; i < n; i++) l = l * 256 + b[p + 2 + i];
      h += n;
    }
    if (p + h + l > b.length) throw new Error('DER truncado');
    return { tag: tag, start: p, cs: p + h, end: p + h + l };
  }
  function kidsOf(b, t) {
    var out = [], p = t.cs;
    while (p < t.end) { var c = tlv(b, p); out.push(c); p = c.end; }
    return out;
  }
  function oid(b, t) {
    var d = b.subarray(t.cs, t.end), parts = [Math.floor(d[0] / 40), d[0] % 40], v = 0;
    for (var i = 1; i < d.length; i++) {
      v = v * 128 + (d[i] & 0x7f);
      if (!(d[i] & 0x80)) { parts.push(v); v = 0; }
    }
    return parts.join('.');
  }
  function derString(b, t) {
    var d = b.subarray(t.cs, t.end);
    if (t.tag === 0x1e) { try { return new TextDecoder('utf-16be').decode(d); } catch (e) { return ''; } }
    if (t.tag === 0x0c) return utf8(d);
    return ascii(d, 0, d.length);
  }
  function derTime(b, t) {
    var s = ascii(b, t.cs, t.end - t.cs);
    var m = /^(\d{2,4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/.exec(s);
    if (!m) return s;
    var y = m[1].length === 2 ? (+m[1] < 50 ? 2000 + +m[1] : 1900 + +m[1]) : +m[1];
    return new Date(Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  }
  var NAME_OIDS = { '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '1.2.840.113549.1.9.1': 'E' };
  function derName(b, t) {
    var out = {};
    kidsOf(b, t).forEach(function (set) {
      kidsOf(b, set).forEach(function (atv) {
        var k = kidsOf(b, atv), key = NAME_OIDS[oid(b, k[0])];
        if (key && !out[key]) out[key] = derString(b, k[1]);
      });
    });
    return out;
  }
  function parseCert(der) {
    var c = tlv(der, 0), parts = kidsOf(der, c), tbs = kidsOf(der, parts[0]), i = 0;
    if (tbs[0].tag === 0xa0) i = 1;
    var validity = kidsOf(der, tbs[i + 3]), spki = tbs[i + 5];
    var algSeq = kidsOf(der, kidsOf(der, spki)[0]);
    return {
      serial: hex(der.subarray(tbs[i].cs, tbs[i].end), 24),
      issuer: derName(der, tbs[i + 2]),
      notBefore: derTime(der, validity[0]),
      notAfter: derTime(der, validity[1]),
      subject: derName(der, tbs[i + 4]),
      spki: der.subarray(spki.start, spki.end),
      keyAlg: oid(der, algSeq[0]),
      keyParam: algSeq[1] && algSeq[1].tag === 0x06 ? oid(der, algSeq[1]) : null,
      spkiBits: kidsOf(der, spki)[1]
    };
  }
  function derEncode(tag, content) {
    var l = content.length, head;
    if (l < 128) head = [tag, l];
    else if (l < 256) head = [tag, 0x81, l];
    else if (l < 65536) head = [tag, 0x82, l >> 8, l & 255];
    else head = [tag, 0x83, l >> 16, l >> 8 & 255, l & 255];
    return concat([new Uint8Array(head), content]);
  }

  // Primer GeneralizedTime de una estructura DER, entrando en OCTET STRING que contengan DER.
  // En un sello de tiempo RFC 3161 es el genTime del TSTInfo.
  function firstGeneralizedTime(b, from, to, depth) {
    if (depth > 12) return null;
    var p = from;
    while (p < to) {
      var t;
      try { t = tlv(b, p); } catch (e) { return null; }
      if (t.end > to) return null;
      if (t.tag === 0x18) return derTime(b, t);
      if (t.tag & 0x20 || t.tag === 0x04) {
        var r = firstGeneralizedTime(b, t.cs, t.end, depth + 1);
        if (r) return r;
      }
      p = t.end;
    }
    return null;
  }

  // =====================================================================
  //  COSE_Sign1 (RFC 9052) — comprobación de la firma del claim con WebCrypto
  // =====================================================================
  var COSE_ALGS = {
    '-7': { name: 'ES256', hash: 'SHA-256', kind: 'ec' },
    '-35': { name: 'ES384', hash: 'SHA-384', kind: 'ec' },
    '-36': { name: 'ES512', hash: 'SHA-512', kind: 'ec' },
    '-37': { name: 'PS256', hash: 'SHA-256', kind: 'pss', salt: 32 },
    '-38': { name: 'PS384', hash: 'SHA-384', kind: 'pss', salt: 48 },
    '-39': { name: 'PS512', hash: 'SHA-512', kind: 'pss', salt: 64 },
    '-8': { name: 'Ed25519', kind: 'ed' }
  };
  var CURVES = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' };

  function importKey(cert, alg) {
    if (alg.kind === 'ec') {
      var curve = CURVES[cert.keyParam];
      if (cert.keyAlg !== '1.2.840.10045.2.1' || !curve) return Promise.reject(new Error('clave del certificado no compatible con ' + alg.name));
      return subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve: curve }, false, ['verify']);
    }
    if (alg.kind === 'pss') {
      var spki = cert.spki;
      if (cert.keyAlg === '1.2.840.113549.1.1.10') {
        // WebCrypto solo importa claves RSA marcadas como rsaEncryption: se reescribe el identificador.
        var algId = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
        spki = derEncode(0x30, concat([algId, cert.spkiBitsBytes]));
      } else if (cert.keyAlg !== '1.2.840.113549.1.1.1') {
        return Promise.reject(new Error('clave del certificado no compatible con ' + alg.name));
      }
      return subtle.importKey('spki', spki, { name: 'RSA-PSS', hash: alg.hash }, false, ['verify']);
    }
    return subtle.importKey('spki', cert.spki, { name: 'Ed25519' }, false, ['verify']);
  }

  function verifyCose(coseBytes, claimBytes) {
    var res = { verified: null, alg: null, certs: [], reason: null, time: null, timeSource: null };
    var v;
    try {
      v = cborDecode(coseBytes, 0).value;
      if (v instanceof CborTag) v = v.value;
      if (!Array.isArray(v) || v.length !== 4) throw new Error('no es COSE_Sign1');
    } catch (e) { res.verified = false; res.reason = 'La firma no se puede leer: ' + e.message + '.'; return Promise.resolve(res); }

    var protBytes = v[0] instanceof Uint8Array ? v[0] : new Uint8Array(0);
    var prot = {};
    try { if (protBytes.length) prot = cborDecode(protBytes, 0).value || {}; } catch (e) { /* cabecera vacía */ }
    var unprot = v[1] || {};
    var payload = v[2] instanceof Uint8Array ? v[2] : claimBytes;
    var sig = v[3];
    var alg = COSE_ALGS[String(prot['1'])];
    res.alg = alg ? alg.name : 'desconocido (' + prot['1'] + ')';

    var x5 = prot['33'] || unprot['33'] || prot.x5chain || unprot.x5chain;
    var ders = Array.isArray(x5) ? x5 : x5 ? [x5] : [];
    ders.forEach(function (der) {
      try {
        var c = parseCert(der);
        c.spkiBitsBytes = der.subarray(c.spkiBits.start, c.spkiBits.end);
        res.certs.push(c);
      } catch (e) { /* certificado ilegible */ }
    });

    // Hora de firma: sello de tiempo (sigTst / sigTst2) si existe. No se verifica.
    [unprot.sigTst2, unprot.sigTst].forEach(function (tst) {
      if (res.time || !tst || !tst.tstTokens) return;
      tst.tstTokens.forEach(function (tok) {
        if (res.time || !(tok.val instanceof Uint8Array)) return;
        var t = firstGeneralizedTime(tok.val, 0, tok.val.length, 0);
        if (t instanceof Date) { res.time = t; res.timeSource = 'sello de tiempo de una TSA (no verificado)'; }
      });
    });

    if (!subtle) { res.reason = 'Este navegador no ofrece WebCrypto: la firma no se puede comprobar.'; return Promise.resolve(res); }
    if (!alg) { res.reason = 'Algoritmo de firma no admitido.'; return Promise.resolve(res); }
    if (!res.certs.length) { res.verified = false; res.reason = 'La firma no incluye el certificado del firmante.'; return Promise.resolve(res); }
    if (!(sig instanceof Uint8Array)) { res.verified = false; res.reason = 'La firma está vacía.'; return Promise.resolve(res); }

    var tbs = cborEncodeArray(['Signature1', protBytes, new Uint8Array(0), payload]);
    var params = alg.kind === 'ec' ? { name: 'ECDSA', hash: alg.hash }
      : alg.kind === 'pss' ? { name: 'RSA-PSS', saltLength: alg.salt } : { name: 'Ed25519' };
    return importKey(res.certs[0], alg)
      .then(function (key) { return subtle.verify(params, key, sig, tbs); })
      .then(function (ok) {
        res.verified = ok;
        res.reason = ok ? 'La firma coincide con el certificado que trae el manifiesto.'
          : 'La firma NO coincide: el manifiesto se modificó después de firmarlo.';
        return res;
      }, function (e) {
        res.reason = 'No se pudo comprobar la firma en este navegador (' + (e && e.message || e) + ').';
        return res;
      });
  }

  // =====================================================================
  //  C2PA: almacén de manifiestos
  // =====================================================================
  function analyzeC2pa(store, file, storeOffset) {
    var top;
    try {
      var boxes = readBoxes(store, 0, store.length);
      if (!boxes.length || boxes[0].type !== 'jumb') throw new Error('no empieza por una caja JUMBF');
      top = parseSuperbox(store, boxes[0], 0);
      if (top.type !== 'c2pa') throw new Error('la caja JUMBF no es un almacén C2PA');
    } catch (e) {
      return Promise.resolve({ ok: false, error: e.message, manifests: [], offset: storeOffset, size: store.length });
    }

    var manifests = top.children.filter(function (m) { return m.type === 'c2ma' || m.type === 'c2um'; });
    return Promise.all(manifests.map(function (m) { return analyzeManifest(store, m, file, manifests); }))
      .then(function (list) {
        if (list.length) list[list.length - 1].active = true;
        return { ok: true, manifests: list, offset: storeOffset, size: store.length };
      });
  }

  function analyzeManifest(store, m, file, all) {
    var out = { label: m.label, update: m.type === 'c2um', claimVersion: null, claim: null, assertions: [],
      signature: null, dataHash: null, hashedUris: { ok: 0, bad: 0, missing: 0 }, problems: [] };
    var claimBox = child(m, 'c2pa.claim.v2') || child(m, 'c2pa.claim');
    var sigBox = child(m, 'c2pa.signature');
    var store_ = child(m, 'c2pa.assertions');
    if (!claimBox) { out.problems.push('El manifiesto no tiene claim.'); return Promise.resolve(out); }
    out.claimVersion = claimBox.label === 'c2pa.claim.v2' ? 2 : 1;
    var claimBytes = null;
    claimBox.content.forEach(function (c) { if (c.type === 'cbor') claimBytes = c.data; });
    try { out.claim = cborDecode(claimBytes, 0).value; } catch (e) {
      out.problems.push('El claim no se puede leer.'); return Promise.resolve(out);
    }

    var byLabel = {};
    (store_ ? store_.children : []).forEach(function (a) {
      var info = assertionContent(a);
      var item = { label: a.label, kind: info.kind, data: info.data, size: info.size, error: info.error, hash: null, box: a };
      out.assertions.push(item);
      byLabel[a.label] = item;
    });

    var c = out.claim || {};
    var refs = [].concat(c.assertions || [], c.created_assertions || [], c.gathered_assertions || []);
    var claimAlg = c.alg || 'sha256';
    var jobs = refs.map(function (ref) {
      if (!ref || typeof ref.url !== 'string') return null;
      var path = ref.url.replace(/^self#jumbf=/, '').split('/');
      var label = path[path.length - 1];
      var target = byLabel[label];
      // URL absoluta a otro manifiesto (/c2pa/urn…/c2pa.assertions/x): solo se comprueban las propias.
      if (/^\/c2pa\//.test(ref.url.replace(/^self#jumbf=/, '')) && path[2] !== m.label) return null;
      if (!target) { out.hashedUris.missing++; return null; }
      var a = target.box;
      // El hash cubre el contenido de la supercaja de la aserción (sin la cabecera de 8 bytes).
      return digest(ref.alg || claimAlg, store.subarray(a.dataStart, a.end)).then(function (h) {
        if (!h) { target.hash = null; return; }
        target.hash = sameBytes(h, ref.hash);
        if (target.hash) out.hashedUris.ok++; else out.hashedUris.bad++;
      });
    });

    var dataHashItem = byLabel['c2pa.hash.data'];
    var dataJob = dataHashItem && dataHashItem.kind === 'cbor' ? verifyDataHash(file, dataHashItem.data).then(function (r) { out.dataHash = r; }) : null;
    if (!dataHashItem) {
      out.assertions.forEach(function (a) {
        if (/^c2pa\.hash\./.test(a.label)) out.dataHash = { ok: null, reason: 'Hash de tipo ' + a.label + ': no se comprueba aquí.' };
      });
    }

    var sigJob = null;
    if (sigBox) {
      var cose = null;
      sigBox.content.forEach(function (x) { if (x.type === 'cbor') cose = x.data; });
      if (cose) sigJob = verifyCose(cose, claimBytes).then(function (r) { out.signature = r; });
    }
    if (!sigJob) out.problems.push('El manifiesto no está firmado.');

    return Promise.all(jobs.concat([dataJob, sigJob]).filter(Boolean)).then(function () {
      out.assertions.forEach(function (a) { delete a.box; });
      return out;
    });
  }

  function verifyDataHash(file, dh) {
    if (!dh || !(dh.hash instanceof Uint8Array)) return Promise.resolve({ ok: null, reason: 'El hash del audio no se puede leer.' });
    var ex = (dh.exclusions || []).map(function (e) { return { start: +e.start, length: +e.length }; })
      .filter(function (e) { return e.length > 0; })
      .sort(function (a, b) { return a.start - b.start; });
    var parts = [], p = 0;
    ex.forEach(function (e) {
      if (e.start > p) parts.push(file.subarray(p, Math.min(e.start, file.length)));
      p = Math.max(p, e.start + e.length);
    });
    if (p < file.length) parts.push(file.subarray(p));
    return digest(dh.alg || 'sha256', concat(parts)).then(function (h) {
      if (!h) return { ok: null, reason: 'Algoritmo de hash no admitido (' + dh.alg + ').' };
      return sameBytes(h, dh.hash)
        ? { ok: true, reason: 'El audio y las etiquetas cubiertas por la firma no han cambiado desde que se firmó.' }
        : { ok: false, reason: 'El archivo ha cambiado desde que se firmó (otra codificación, etiquetas editadas o recortes).' };
    });
  }

  // =====================================================================
  //  Flujo MPEG: primer frame, cabecera Xing/Info/LAME o VBRI
  // =====================================================================
  var BITRATES = {
    '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  };
  var RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };
  var MODES = ['Estéreo', 'Joint stereo', 'Doble canal', 'Mono'];

  function frameHeader(b, p) {
    if (p + 4 > b.length || b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) return null;
    var vb = (b[p + 1] >> 3) & 3, lb = (b[p + 1] >> 1) & 3;
    var bi = b[p + 2] >> 4, si = (b[p + 2] >> 2) & 3, pad = (b[p + 2] >> 1) & 1;
    if (vb === 1 || lb === 0 || bi === 0 || bi === 15 || si === 3) return null;
    var version = vb === 3 ? 1 : vb === 2 ? 2 : 2.5, layer = 4 - lb;
    var key = version === 1 ? '1-' + layer : '2-' + (layer === 1 ? 1 : 2);
    var bitrate = BITRATES[key][bi], rate = RATES[version][si];
    var spf = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
    var length = layer === 1 ? (Math.floor(12 * bitrate * 1000 / rate) + pad) * 4 : Math.floor(spf / 8 * bitrate * 1000 / rate) + pad;
    return { version: version, layer: layer, bitrate: bitrate, rate: rate, spf: spf, length: length,
      mode: (b[p + 3] >> 6) & 3, crc: !(b[p + 1] & 1) };
  }

  function audioEnd(b) {
    var end = b.length, tags = [];
    if (end >= 128 && ascii(b, end - 128, 3) === 'TAG') {
      tags.push({ kind: 'ID3v1', offset: end - 128, size: 128 });
      end -= 128;
      if (end >= 227 && ascii(b, end - 227, 4) === 'TAG+') { tags.push({ kind: 'ID3v1 extendida', offset: end - 227, size: 227 }); end -= 227; }
    }
    if (end >= 32 && ascii(b, end - 32, 8) === 'APETAGEX') {
      var total = u32le(b, end - 32 + 12) + (b[end - 32 + 23] & 0x80 ? 32 : 0);
      if (total <= end) { tags.push({ kind: 'APEv2', offset: end - total, size: total }); end -= total; }
    }
    return { end: end, tags: tags };
  }

  function mpegInfo(b, from, end) {
    var limit = Math.min(end - 4, from + 1048576), p, h = null;
    for (p = from; p < limit; p++) {
      if (b[p] !== 0xff) continue;
      h = frameHeader(b, p);
      if (!h) continue;
      var nxt = p + h.length;
      if (nxt + 4 > end || frameHeader(b, nxt)) break;
      h = null;
    }
    if (!h) return null;
    var info = { offset: p, gap: p - from, version: h.version, layer: h.layer, rate: h.rate, channels: h.mode === 3 ? 1 : 2,
      mode: MODES[h.mode], bitrate: h.bitrate, vbr: false, frames: null, duration: null, estimated: false,
      header: null, encoder: null };
    var side = h.version === 1 ? (h.mode === 3 ? 17 : 32) : (h.mode === 3 ? 9 : 17);
    var xo = p + 4 + side, tag = ascii(b, xo, 4), bytes = null;
    if (h.layer === 3 && (tag === 'Xing' || tag === 'Info')) {
      var flags = u32be(b, xo + 4), q = xo + 8;
      info.header = tag;
      info.vbr = tag === 'Xing';
      if (flags & 1) { info.frames = u32be(b, q); q += 4; }
      if (flags & 2) { bytes = u32be(b, q); q += 4; }
      if (flags & 4) q += 100;
      if (flags & 8) q += 4;
      var enc = ascii(b, q, 9).replace(/[^\x20-\x7e]/g, '').trim();
      if (/^[A-Za-z]{3,}/.test(enc)) info.encoder = enc;
    } else if (ascii(b, p + 36, 4) === 'VBRI') {
      info.header = 'VBRI';
      info.vbr = true;
      bytes = u32be(b, p + 36 + 10);
      info.frames = u32be(b, p + 36 + 14);
    }
    if (info.frames) {
      info.duration = info.frames * h.spf / h.rate;
      var audioBytes = bytes || (end - p);
      if (info.vbr && info.duration > 0) info.bitrate = Math.round(audioBytes * 8 / info.duration / 1000);
    } else {
      info.duration = (end - p) * 8 / (h.bitrate * 1000);
      info.estimated = true;
    }
    return info;
  }

  // =====================================================================
  //  Marcos ID3: decodificación completa para mostrarlos
  // =====================================================================
  var V22 = { TT1: 'TIT1', TT2: 'TIT2', TT3: 'TIT3', TP1: 'TPE1', TP2: 'TPE2', TP3: 'TPE3', TP4: 'TPE4', TAL: 'TALB',
    TCO: 'TCON', TYE: 'TYER', TRK: 'TRCK', TPA: 'TPOS', TCM: 'TCOM', TXT: 'TEXT', TEN: 'TENC', TSS: 'TSSE',
    TCR: 'TCOP', TPB: 'TPUB', TBP: 'TBPM', TLA: 'TLAN', TLE: 'TLEN', TRC: 'TSRC', TXX: 'TXXX', WXX: 'WXXX',
    COM: 'COMM', ULT: 'USLT', PIC: 'APIC', GEO: 'GEOB', UFI: 'UFID', POP: 'POPM', CNT: 'PCNT', TDA: 'TDAT', TIM: 'TIME' };
  var NAMES = {
    TIT1: 'Grupo', TIT2: 'Título', TIT3: 'Subtítulo', TPE1: 'Artista', TPE2: 'Artista del álbum', TPE3: 'Director',
    TPE4: 'Remezcla', TALB: 'Álbum', TCON: 'Género', TYER: 'Año', TDRC: 'Fecha de grabación', TDRL: 'Fecha de publicación',
    TDEN: 'Fecha de codificación', TDTG: 'Fecha de etiquetado', TDAT: 'Fecha', TIME: 'Hora', TRCK: 'Pista', TPOS: 'Disco',
    TCOM: 'Compositor', TEXT: 'Letrista', TENC: 'Codificado por', TSSE: 'Software de codificación', TCOP: 'Copyright',
    TPUB: 'Editorial', TBPM: 'BPM', TKEY: 'Tonalidad', TLAN: 'Idioma', TLEN: 'Duración (ms)', TSRC: 'ISRC',
    TMED: 'Soporte', TMOO: 'Ambiente', TOWN: 'Propietario', TPRO: 'Aviso de producción', TOPE: 'Artista original',
    TOAL: 'Álbum original', TSOA: 'Orden: álbum', TSOP: 'Orden: artista', TSOT: 'Orden: título', TCMP: 'Compilación',
    TXXX: 'Texto personalizado', WXXX: 'Enlace personalizado', WOAR: 'Web del artista', WOAS: 'Web de la fuente',
    WOAF: 'Web del archivo', WCOM: 'Web comercial', WCOP: 'Web del copyright', WPUB: 'Web de la editorial',
    WORS: 'Web de la emisora', WPAY: 'Web de pago', COMM: 'Comentario', USLT: 'Letra', SYLT: 'Letra sincronizada',
    APIC: 'Portada', GEOB: 'Objeto encapsulado', PRIV: 'Datos privados', UFID: 'Identificador único',
    POPM: 'Valoración', PCNT: 'Contador de reproducciones', MCDI: 'Índice del CD', CHAP: 'Capítulo', CTOC: 'Índice de capítulos'
  };
  var PIC_TYPES = ['Otra', 'Icono 32×32', 'Otro icono', 'Portada', 'Contraportada', 'Folleto', 'Disco', 'Solista',
    'Artista', 'Director', 'Banda', 'Compositor', 'Letrista', 'Lugar de grabación', 'Grabando', 'Actuando',
    'Fotograma', 'Pez de colores', 'Ilustración', 'Logo del artista', 'Logo del editor'];

  function readTerm(d, p, enc) {
    var wide = enc === 1 || enc === 2, i = p;
    if (wide) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) i += 2; }
    else { while (i < d.length && d[i] !== 0) i++; }
    var text = enc === -1 ? ascii(d, p, i - p) : ID3.decodeId3Text(enc, d.subarray(p, i));
    return { text: text, next: Math.min(d.length, i + (wide ? 2 : 1)) };
  }
  function printable(d, max) {
    var s = '';
    for (var i = 0; i < Math.min(d.length, max); i++) s += d[i] >= 0x20 && d[i] < 0x7f ? String.fromCharCode(d[i]) : '·';
    return s + (d.length > max ? '…' : '');
  }

  function isC2paData(mime, data) {
    return /c2pa/i.test(mime || '') || (data.length > 16 && ascii(data, 4, 4) === 'jumb' && ascii(data, 12, 4) === 'jumd');
  }

  function decodeFrame(f) {
    var id = V22[f.id] || f.id, d = f.data;
    var out = { id: f.id, key: id, name: NAMES[id] || (id[0] === 'T' ? 'Texto' : id[0] === 'W' ? 'Enlace' : 'Marco'),
      offset: f.offset, size: f.size, values: [], desc: null, lang: null, binary: null, c2pa: null, lyrics: null, note: null };
    if (f.encrypted) { out.note = 'Marco cifrado: no se puede leer.'; out.binary = { size: d.length }; return out; }
    if (f.compressed && !f.inflated) { out.note = 'Marco comprimido que no se pudo descomprimir.'; out.binary = { size: d.length }; return out; }
    if (!d.length) return out;
    var enc = d[0], r;
    if (id === 'TXXX' || id === 'WXXX') {
      r = readTerm(d, 1, enc);
      out.desc = r.text;
      out.values = id === 'WXXX' ? [ascii(d, r.next, d.length - r.next).replace(/\0+$/, '')]
        : ID3.decodeId3Text(enc, d.subarray(r.next)).split('\0');
    } else if (id[0] === 'T') {
      out.values = ID3.decodeId3Text(enc, d.subarray(1)).split('\0');
    } else if (id[0] === 'W') {
      out.values = [ascii(d, 0, d.length).replace(/\0+$/, '')];
    } else if (id === 'COMM' || id === 'USLT') {
      out.lang = ascii(d, 1, 3).replace(/[^\x20-\x7e]/g, '');
      r = readTerm(d, 4, enc);
      out.desc = r.text;
      var text = ID3.decodeId3Text(enc, d.subarray(r.next));
      out.values = [text];
      if (id === 'USLT') out.lyrics = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
    } else if (id === 'APIC') {
      var p = 1, mime;
      if (f.id === 'PIC') { mime = 'image/' + ascii(d, 1, 3).toLowerCase(); p = 4; }
      else { r = readTerm(d, 1, -1); mime = r.text; p = r.next; }
      var type = d[p];
      r = readTerm(d, p + 1, enc);
      out.desc = r.text;
      out.binary = { size: d.length - r.next, mime: mime, picType: PIC_TYPES[type] || 'Tipo ' + type };
    } else if (id === 'GEOB') {
      r = readTerm(d, 1, -1);
      var gmime = r.text;
      r = readTerm(d, r.next, enc);
      var fname = r.text;
      r = readTerm(d, r.next, enc);
      out.desc = r.text;
      var obj = d.subarray(r.next);
      out.binary = { size: obj.length, mime: gmime, filename: fname };
      if (isC2paData(gmime, obj)) out.c2pa = obj;
    } else if (id === 'PRIV' || id === 'UFID') {
      r = readTerm(d, 0, -1);
      out.desc = r.text;
      var rest = d.subarray(r.next);
      out.values = [printable(rest, 64)];
      out.binary = { size: rest.length };
    } else if (id === 'POPM') {
      r = readTerm(d, 0, -1);
      out.values = [r.text + ' · ' + (d[r.next] || 0) + '/255'];
    } else {
      out.binary = { size: d.length };
      out.values = [printable(d, 48)];
    }
    out.values = out.values.map(function (v) { return v.replace(/\0+$/, ''); }).filter(function (v, i, a) { return v !== '' || a.length === 1; });
    return out;
  }

  function inflate(data) {
    if (typeof DecompressionStream === 'undefined') return Promise.resolve(null);
    try {
      var ds = new DecompressionStream('deflate');
      var stream = new Blob([data]).stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function readId3v1(b, off) {
    function f(s, n) { return ascii(b, s, n).replace(/\0[\s\S]*$/, '').trim(); }
    var out = [['Título', f(off + 3, 30)], ['Artista', f(off + 33, 30)], ['Álbum', f(off + 63, 30)], ['Año', f(off + 93, 4)]];
    var com = b[off + 125] === 0 && b[off + 126] ? f(off + 97, 28) : f(off + 97, 30);
    out.push(['Comentario', com]);
    return out.filter(function (x) { return x[1]; });
  }
  function readApe(b, off, size) {
    var out = [], footer = off + size - 32, n = u32le(b, footer + 16);
    var p = footer - (u32le(b, footer + 12) - 32);
    for (var k = 0; k < n && p + 8 < footer; k++) {
      var len = u32le(b, p), fl = u32le(b, p + 4), z = p + 8;
      while (z < footer && b[z] !== 0) z++;
      var key = ascii(b, p + 8, z - p - 8), val = b.subarray(z + 1, Math.min(z + 1 + len, footer));
      out.push([key, ((fl >> 1) & 3) === 0 ? utf8(val).split('\0').join(' · ') : '‹' + val.length + ' bytes›']);
      p = z + 1 + len;
    }
    return out;
  }

  // =====================================================================
  //  Firmas conocidas
  //  Solo de Suno: para otros servicios hacen falta archivos de muestra reales.
  // =====================================================================
  var SIGNATURES = [
    { re: /suno\.com\/song\/[0-9a-f-]{36}/gi, kind: 'ia', title: 'Enlace a una canción de Suno', service: 'Suno' },
    { re: /made with suno/gi, kind: 'ia', title: 'Texto «made with suno»', service: 'Suno' },
    { re: /Suno C2PA Root CA/g, kind: 'ia', title: 'Certificado raíz de Suno para C2PA', service: 'Suno' },
    { re: /com\.suno\.[a-z0-9._-]+/gi, kind: 'ia', title: 'Identificador de Suno', service: 'Suno' },
    { re: /chirp-[a-z0-9][a-z0-9.-]*/gi, kind: 'ia', title: 'Nombre de un modelo de Suno («chirp»)', service: 'Suno' },
    { re: /Suno,? Inc\b\.?/g, kind: 'ia', title: 'Empresa Suno, Inc.', service: 'Suno' },
    { re: /Lavf\d+(?:\.\d+)*/g, kind: 'contexto', title: 'Marca de FFmpeg (Lavf)', ffmpeg: true },
    { re: /Lavc\d+(?:\.\d+)*/g, kind: 'contexto', title: 'Marca de FFmpeg (Lavc)', ffmpeg: true }
  ];
  function matchSignatures(text) {
    var hits = [];
    if (!text) return hits;
    SIGNATURES.forEach(function (s) {
      s.re.lastIndex = 0;
      var m;
      while ((m = s.re.exec(text))) hits.push({ sig: s, value: m[0], index: m.index });
    });
    return hits;
  }

  var SOURCE_TYPES = {
    trainedAlgorithmicMedia: { kind: 'ia', text: 'Creado con un modelo de IA entrenado (IA generativa)' },
    compositeWithTrainedAlgorithmicMedia: { kind: 'ia', text: 'Mezcla que incluye contenido generado con IA' },
    algorithmicMedia: { kind: 'contexto', text: 'Creado por un algoritmo sin datos de entrenamiento (sintético, no IA generativa)' },
    compositeSynthetic: { kind: 'contexto', text: 'Composición con elementos sintéticos' },
    digitalCapture: { kind: 'contexto', text: 'Grabación digital del mundo real' },
    humanEdits: { kind: 'contexto', text: 'Editado por una persona' },
    minorHumanEdits: { kind: 'contexto', text: 'Retoques menores de una persona' },
    composite: { kind: 'contexto', text: 'Composición de varios elementos' },
    digitalCreation: { kind: 'contexto', text: 'Creación digital' },
    dataDrivenMedia: { kind: 'contexto', text: 'Generado a partir de datos' },
    virtualRecording: { kind: 'contexto', text: 'Grabación virtual' }
  };
  function sourceType(uri) {
    var code = String(uri).split(/[\/#]/).pop();
    var known = SOURCE_TYPES[code];
    return { code: code, kind: known ? known.kind : 'contexto', text: known ? known.text : 'Tipo de origen «' + code + '»' };
  }

  // Recorre un valor CBOR/JSON y llama a fn(clave, valor) en cada texto.
  function walkStrings(v, fn, key, depth) {
    if ((depth || 0) > 40) return;
    if (typeof v === 'string') fn(key, v);
    else if (v instanceof CborTag) walkStrings(v.value, fn, key, (depth || 0) + 1);
    else if (Array.isArray(v)) v.forEach(function (x) { walkStrings(x, fn, key, (depth || 0) + 1); });
    else if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
      Object.keys(v).forEach(function (k) { walkStrings(v[k], fn, k, (depth || 0) + 1); });
    }
  }

  function plain(v) {
    while (v instanceof CborTag) v = v.value;
    return v;
  }

  function agentName(a) {
    a = plain(a);
    if (!a) return null;
    if (typeof a === 'string') return a;
    return [a.name, a.version].filter(Boolean).join(' ') || null;
  }

  // Resumen legible de un manifiesto.
  function summarizeManifest(m) {
    var c = m.claim || {}, s = { generator: [], title: plain(c['dc:title'] || c.title) || null, format: plain(c['dc:format'] || c.format) || null,
      instanceId: plain(c.instanceID || c.instance_id) || null, actions: [], sourceTypes: [], signer: null, issuer: null };
    if (typeof c.claim_generator === 'string') s.generator.push(c.claim_generator);
    var cgi = c.claim_generator_info;
    (Array.isArray(cgi) ? cgi : cgi ? [cgi] : []).forEach(function (g) { var n = agentName(g); if (n) s.generator.push(n); });
    m.assertions.forEach(function (a) {
      if (/^c2pa\.actions/.test(a.label) && a.data && Array.isArray(a.data.actions)) {
        a.data.actions.forEach(function (act) {
          var params = act.parameters || {};
          s.actions.push({ action: plain(act.action), agent: agentName(act.softwareAgent) || agentName(params.softwareAgent),
            when: plain(act.when) || null, sourceType: plain(act.digitalSourceType || params.digitalSourceType) || null,
            description: plain(act.description || params.description) || null });
        });
      }
      walkStrings(a.data, function (k, v) {
        if (k === 'digitalSourceType' && s.sourceTypes.indexOf(v) < 0) s.sourceTypes.push(v);
      });
    });
    var sig = m.signature;
    if (sig && sig.certs.length) {
      var leaf = sig.certs[0];
      s.signer = [leaf.subject.O, leaf.subject.CN].filter(Boolean).join(' · ') || null;
      var top = sig.certs[sig.certs.length - 1];
      s.issuer = [top.issuer.O, top.issuer.CN].filter(Boolean).join(' · ') || null;
    }
    return s;
  }

  // =====================================================================
  //  Auditoría completa
  // =====================================================================
  function audit(bytes) {
    var report = { size: bytes.length, id3: null, frames: [], endTags: [], mpeg: null, c2pa: [], scan: [],
      evidence: [], warnings: [] };

    var id3 = ID3.readId3v2(bytes);
    report.id3 = id3.tags.map(function (t) { return { offset: t.offset, size: t.size, version: t.version, warnings: t.warnings }; });

    var rawFrames = [];
    id3.tags.forEach(function (t) { t.frames.forEach(function (f) { rawFrames.push(f); }); });

    return Promise.all(rawFrames.map(function (f) {
      if (!f.compressed) return null;
      return inflate(f.data).then(function (d) { if (d) { f.data = d; f.inflated = true; } });
    })).then(function () {
      report.frames = rawFrames.map(decodeFrame);

      var ae = audioEnd(bytes);
      report.endTags = ae.tags.map(function (t) {
        t.fields = t.kind === 'ID3v1' ? readId3v1(bytes, t.offset) : t.kind === 'APEv2' ? readApe(bytes, t.offset, t.size) : [];
        return t;
      });
      report.mpeg = mpegInfo(bytes, id3.end, ae.end);

      // C2PA en marcos GEOB…
      var stores = [];
      report.frames.forEach(function (f) {
        if (f.c2pa) stores.push({ data: f.c2pa, where: 'marco ' + f.id + ' de ID3', offset: offsetIn(bytes, f.c2pa, f.offset) });
      });
      // …o suelto fuera de las etiquetas (por ejemplo, tras borrar el índice ID3).
      if (!stores.length) {
        var from = 0;
        for (var guard = 0; guard < 8; guard++) {
          var at = indexOfAscii(bytes, 'jumb', from);
          if (at < 0) break;
          var start = at - 4;
          if (start >= 0 && ascii(bytes, start + 12, 4) === 'jumd' && ascii(bytes, start + 16, 4) === 'c2pa') {
            var sz = u32be(bytes, start);
            stores.push({ data: bytes.subarray(start, Math.min(bytes.length, start + sz)), where: 'bytes sueltos fuera de las etiquetas', offset: start });
            break;
          }
          from = at + 4;
        }
      }
      return Promise.all(stores.map(function (st) {
        return analyzeC2pa(st.data, bytes, st.offset).then(function (r) { r.where = st.where; return r; });
      }));
    }).then(function (c2pa) {
      report.c2pa = c2pa;
      report.scan = rawScan(bytes, id3, report);
      buildEvidence(report);
      return report;
    });
  }

  // Posición absoluta de una vista dentro del archivo (si es una copia, se usa la aproximada).
  function offsetIn(file, view, fallback) {
    return view.buffer === file.buffer ? view.byteOffset - file.byteOffset : fallback;
  }

  // Posición de un texto ASCII en los bytes, o -1.
  function indexOfAscii(b, s, from) {
    var needle = s, c0 = needle.charCodeAt(0);
    outer: for (var i = from; i <= b.length - needle.length; i++) {
      if (b[i] !== c0) continue;
      for (var k = 1; k < needle.length; k++) if (b[i + k] !== needle.charCodeAt(k)) continue outer;
      return i;
    }
    return -1;
  }

  // Escanea el archivo ENTERO (no solo el principio y el final) buscando firmas en texto.
  // Se saltan los bloques C2PA ya leídos como CBOR: en bruto, sus bytes de longitud
  // se mezclarían con los textos (p. ej. «chirp-v4qdigitalSourceType»).
  function rawScan(bytes, id3, report) {
    var text;
    try { text = new TextDecoder('latin1').decode(bytes); }
    catch (e) { text = ascii(bytes, 0, bytes.length); }
    var skip = report.c2pa.filter(function (c) { return c.ok; }).map(function (c) { return [c.offset, c.offset + c.size]; });
    var hits = matchSignatures(text).filter(function (h) {
      return !skip.some(function (r) { return h.index >= r[0] && h.index < r[1]; });
    }), seen = {}, out = [];
    hits.forEach(function (h) {
      var k = h.value.toLowerCase();
      if (seen[k]) { seen[k].count++; return; }
      seen[k] = { title: h.sig.title, kind: h.sig.kind, value: h.value, offset: h.index, count: 1, where: locate(h.index, id3, report) };
      out.push(seen[k]);
    });
    return out;
  }

  function locate(off, id3, report) {
    for (var t = 0; t < id3.tags.length; t++) {
      var tag = id3.tags[t];
      if (off >= tag.offset && off < tag.offset + tag.size) {
        for (var i = 0; i < tag.frames.length; i++) {
          var f = tag.frames[i];
          if (off >= f.offset && off < f.offset + 10 + f.size) return 'etiqueta ID3, marco ' + f.id;
        }
        return 'etiqueta ID3 (fuera de los marcos)';
      }
    }
    for (var e = 0; e < report.endTags.length; e++) {
      var et = report.endTags[e];
      if (off >= et.offset && off < et.offset + et.size) return 'etiqueta ' + et.kind;
    }
    if (report.mpeg && off >= report.mpeg.offset) {
      if (off < report.mpeg.offset + 512) return 'primer frame de audio (cabecera Xing/LAME)';
      return 'zona de audio';
    }
    return 'bytes sin etiqueta antes del audio';
  }

  function buildEvidence(report) {
    var ev = [], idx = {};
    function add(kind, title, value, source, note) {
      var key = kind + '|' + title + '|' + String(value).toLowerCase();
      if (idx[key]) { if (idx[key].sources.indexOf(source) < 0) idx[key].sources.push(source); return; }
      idx[key] = { kind: kind, title: title, value: value, sources: [source], note: note || null };
      ev.push(idx[key]);
    }
    function sigs(text, source) {
      matchSignatures(text).forEach(function (h) {
        add(h.sig.kind, h.sig.title, h.value, source, h.sig.ffmpeg ? 'FFMPEG' : null);
      });
    }

    // 1) C2PA, leído como CBOR/JUMBF
    report.c2pa.forEach(function (store) {
      store.manifests.forEach(function (m) {
        var src = 'C2PA' + (m.active ? '' : ' (manifiesto anterior)');
        m.summary = summarizeManifest(m);
        m.summary.sourceTypes.forEach(function (u) {
          var st = sourceType(u);
          add(st.kind, 'Tipo de origen declarado en C2PA', st.text + ' (' + st.code + ')', src);
        });
        m.summary.actions.forEach(function (a) {
          if (a.agent) add('contexto', 'Programa que lo creó o editó (C2PA)', a.agent, src);
        });
        m.summary.generator.forEach(function (g) { add('contexto', 'Generador del manifiesto C2PA', g, src); });
        if (m.summary.signer) add('contexto', 'Firmante del manifiesto C2PA', m.summary.signer, src);
        m.assertions.forEach(function (a) {
          if (!/^(c2pa|stds|cawg)\./.test(a.label)) sigs(a.label, src + ', aserción');
          walkStrings(a.data, function (k, v) { sigs(v, src + ', aserción ' + a.label); });
        });
        walkStrings(m.claim, function (k, v) { sigs(v, src + ', claim'); });
        if (m.signature) m.signature.certs.forEach(function (c) {
          [c.subject, c.issuer].forEach(function (n) { Object.keys(n).forEach(function (k) { sigs(n[k], src + ', certificado'); }); });
        });
      });
    });

    // 2) Etiquetas ID3 decodificadas (incluye texto UTF-16 que el escaneo en bruto no ve)
    report.frames.forEach(function (f) {
      var src = 'etiqueta ' + f.id + (f.desc ? ' («' + f.desc + '»)' : '');
      [f.desc].concat(f.values).forEach(function (v) { sigs(v, src); });
    });
    report.endTags.forEach(function (t) { t.fields.forEach(function (x) { sigs(x[1], 'etiqueta ' + t.kind); }); });

    // 3) Codificador de la cabecera LAME/Xing
    if (report.mpeg && report.mpeg.encoder) sigs(report.mpeg.encoder, 'cabecera Xing/LAME del primer frame');

    // 4) Escaneo en bruto
    report.scan.forEach(function (h) { add(h.kind, h.title, h.value, 'bytes del archivo (' + h.where + ')', /^Lav[fc]/.test(h.value) ? 'FFMPEG' : null); });

    // Problemas de integridad del C2PA
    report.c2pa.forEach(function (store) {
      if (!store.ok) report.warnings.push('Hay un bloque C2PA, pero no se puede leer: ' + store.error + '.');
      store.manifests.forEach(function (m) {
        if (!m.active) return;
        if (m.signature && m.signature.verified === false) report.warnings.push('La firma del manifiesto C2PA no es válida: sus datos pueden estar alterados.');
        if (m.dataHash && m.dataHash.ok === false) report.warnings.push('El audio no coincide con el hash firmado en C2PA: el archivo se modificó después de firmarlo.');
        if (m.hashedUris.bad) report.warnings.push(m.hashedUris.bad + ' aserción(es) C2PA no coinciden con su hash firmado.');
      });
    });

    var order = { ia: 0, contexto: 1 };
    ev.sort(function (a, b) { return order[a.kind] - order[b.kind]; });
    report.evidence = ev;
    report.aiCount = ev.filter(function (e) { return e.kind === 'ia'; }).length;
  }

  var api = { audit: audit, cborDecode: cborDecode, CborTag: CborTag, plain: plain, parseCert: parseCert, mpegInfo: mpegInfo, sourceType: sourceType };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AuditorMusica = api;
})(typeof self !== 'undefined' ? self : this);
