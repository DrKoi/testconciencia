/*
 * metaclean-office.js — metadatos de documentos ofimáticos.
 * OOXML (docx/xlsx/pptx) y ODF (odt/ods/odp). Necesita fflate (window.fflate).
 * Descomprime el ZIP, reemplaza las partes de propiedades por versiones vacías
 * y vuelve a comprimir. El contenido del documento no se toca.
 */
(function (root) {
  'use strict';

  var CORE_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
    ' xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>';
  var APP_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"' +
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
  var CUSTOM_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"' +
    ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
  var ODF_META =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xlink="http://www.w3.org/1999/xlink"' +
    ' office:version="1.3"><office:meta/></office:document-meta>';

  function ff() {
    var f = root.fflate || (typeof fflate !== 'undefined' ? fflate : null);
    if (!f) throw new Error('fflate no está cargado');
    return f;
  }
  function shorten(s) { return s.length > 40 ? s.slice(0, 38) + '…' : s; }
  function tag(xml, name) {
    var m = new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>').exec(xml);
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
  }
  function pushIf(found, v, label) { if (v) found.push(label + shorten(v)); }

  function isOffice(bytes) {
    return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B &&
      (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
  }

  function cleanOffice(bytes) {
    var fflate = ff();
    var files = fflate.unzipSync(bytes);
    var names = Object.keys(files);
    var isOdf = names.indexOf('mimetype') >= 0 &&
      fflate.strFromU8(files['mimetype']).indexOf('opendocument') >= 0;

    var found = [];
    var out = {};

    if (isOdf) {
      var meta = files['meta.xml'] ? fflate.strFromU8(files['meta.xml']) : '';
      pushIf(found, tag(meta, 'meta:initial-creator'), '✍️ Autor original: ');
      pushIf(found, tag(meta, 'dc:creator'), '✍️ Última modificación por: ');
      pushIf(found, tag(meta, 'dc:title'), '📄 Título: ');
      pushIf(found, tag(meta, 'meta:creation-date'), '🕐 Creado: ');
      pushIf(found, tag(meta, 'meta:editing-cycles'), '🔁 Ediciones: ');
      pushIf(found, tag(meta, 'meta:editing-duration'), '⏱️ Tiempo de edición: ');
      pushIf(found, tag(meta, 'meta:generator'), '🛠️ Generador: ');
      if (/<meta:user-defined/.test(meta)) found.push('🏷️ Propiedades personalizadas');

      var odfThumb = names.some(function (n) { return /^Thumbnails\//.test(n); });
      names.forEach(function (n) {
        if (n === 'meta.xml') { out[n] = strU8(ODF_META); return; }
        if (/^Thumbnails\//.test(n)) return;                 // quitar miniatura
        if (n === 'META-INF/manifest.xml' && odfThumb) {
          out[n] = strU8(fflate.strFromU8(files[n]).replace(
            /<manifest:file-entry[^>]*Thumbnails\/[^>]*\/>/g, ''));
          return;
        }
        out[n] = files[n];
      });
      if (!out['meta.xml']) out['meta.xml'] = strU8(ODF_META);
      return zipOdf(fflate, out, found);
    }

    // OOXML
    var core = files['docProps/core.xml'] ? fflate.strFromU8(files['docProps/core.xml']) : '';
    var app = files['docProps/app.xml'] ? fflate.strFromU8(files['docProps/app.xml']) : '';
    pushIf(found, tag(core, 'dc:creator'), '✍️ Autor: ');
    pushIf(found, tag(core, 'cp:lastModifiedBy'), '✍️ Última modificación por: ');
    pushIf(found, tag(core, 'dc:title'), '📄 Título: ');
    pushIf(found, tag(core, 'dcterms:created'), '🕐 Creado: ');
    pushIf(found, tag(core, 'cp:revision'), '🔁 Revisión: ');
    pushIf(found, tag(app, 'Company'), '🏢 Empresa: ');
    pushIf(found, tag(app, 'Manager'), '👤 Responsable: ');
    pushIf(found, tag(app, 'Template'), '📎 Plantilla: ');
    pushIf(found, tag(app, 'TotalTime'), '⏱️ Tiempo de edición (min): ');
    if (files['docProps/custom.xml']) found.push('🏷️ Propiedades personalizadas');
    if (hasThumb(names)) found.push('🖼️ Miniatura del documento');

    var ooxmlThumb = hasThumb(names);
    names.forEach(function (n) {
      if (n === 'docProps/core.xml') { out[n] = strU8(CORE_XML); return; }
      if (n === 'docProps/app.xml') { out[n] = strU8(APP_XML); return; }
      if (n === 'docProps/custom.xml') { out[n] = strU8(CUSTOM_XML); return; }
      if (/^docProps\/thumbnail\./i.test(n)) return;         // quitar miniatura
      if (ooxmlThumb && n === '[Content_Types].xml') {
        out[n] = strU8(fflate.strFromU8(files[n])
          .replace(/<Override[^>]*docProps\/thumbnail[^>]*\/>/gi, '')
          .replace(/<Default[^>]*Extension="(jpeg|emf|wmf)"[^>]*ContentType="image\/[^"]*"[^>]*\/>/gi, function (m) {
            return /thumbnail/i.test(m) ? '' : m;
          }));
        return;
      }
      if (ooxmlThumb && /_rels\/\.rels$/.test(n)) {
        out[n] = strU8(fflate.strFromU8(files[n])
          .replace(/<Relationship[^>]*(?:thumbnail|\/metadata\/thumbnail)[^>]*\/>/gi, ''));
        return;
      }
      out[n] = files[n];
    });
    if (files['docProps/core.xml'] === undefined) out['docProps/core.xml'] = strU8(CORE_XML);

    var zipped = fflate.zipSync(out, { level: 6 });
    return { bytes: zipped, found: found };

    function strU8(s) { return fflate.strToU8(s); }
  }

  function hasThumb(names) {
    return names.some(function (n) { return /^docProps\/thumbnail\./i.test(n); });
  }

  function zipOdf(fflate, out, found) {
    // 'mimetype' debe ir primero y sin comprimir
    var ordered = {};
    if (out['mimetype']) ordered['mimetype'] = [out['mimetype'], { level: 0 }];
    Object.keys(out).forEach(function (n) {
      if (n !== 'mimetype') ordered[n] = [out[n], { level: 6 }];
    });
    return { bytes: fflate.zipSync(ordered), found: found };
  }

  var api = { cleanOffice: cleanOffice, isOffice: isOffice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetaCleanOffice = api;
})(typeof self !== 'undefined' ? self : this);
