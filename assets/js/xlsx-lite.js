/* RINOVAIA — generador mínimo de Excel (.xlsx) sin dependencias.
   Arma el paquete OOXML (zip sin compresión) en el navegador, con estilos, fórmulas, celdas combinadas,
   anchos de columna y encabezado fijo.
   Uso: XLSXLite.download('archivo.xlsx', [{ name, cols:[anchos], freeze:fila, merges:['A1:F1'], rows:[[celda]] }])
   Celda: valor simple o { v, f (fórmula sin '='), s: 'title'|'sub'|'head'|'group'|'bold'|'money'|'moneyB'|'num'|'numB'|'pct'|'wrap'|'note' } */
(function () {
  'use strict';
  var STY = { '': 0, title: 1, sub: 2, head: 3, group: 4, bold: 5, money: 6, moneyB: 7, num: 8, numB: 9, pct: 10, wrap: 11, note: 12, total: 13 };

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.000"/><numFmt numFmtId="166" formatCode="0.00&quot;%&quot;"/></numFmts>' +
    '<fonts count="6">' +
      '<font><sz val="10"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="15"/><color rgb="FF0B0F17"/><name val="Calibri"/></font>' +
      '<font><sz val="10"/><color rgb="FF5A6475"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FF18202B"/><name val="Calibri"/></font>' +
      '<font><i/><sz val="9"/><color rgb="FF5A6475"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0B0F17"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF7EFD3"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE9EDF2"/></patternFill></fill></fills>' +
    '<borders count="3"><border/><border><bottom style="thin"><color rgb="FFDDE2EA"/></bottom></border>' +
      '<border><top style="medium"><color rgb="FFD4AF37"/></top></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="14">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="top"/></xf>' +               // 0
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>' +                                                // 1 title
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>' +                                                // 2 sub
      '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>' + // 3 head
      '<xf numFmtId="0" fontId="4" fillId="3" borderId="0" applyFont="1" applyFill="1"/>' +                                  // 4 group
      '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" applyFont="1" applyBorder="1"/>' +                                // 5 bold
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>' + // 6 money
      '<xf numFmtId="164" fontId="4" fillId="4" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' + // 7 moneyB
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>' + // 8 num
      '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>' +                  // 9 numB (etiqueta de subtotal)
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>' +                      // 10 pct
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>' +  // 11 wrap
      '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" applyFont="1"><alignment wrapText="1" vertical="top"/></xf>' +   // 12 note
      '<xf numFmtId="164" fontId="4" fillId="0" borderId="2" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +       // 13 total
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function x(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function col(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

  function sheetXml(sh) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
    out.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    if (sh.freeze) out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    if (sh.cols) out.push('<cols>' + sh.cols.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>');
    out.push('<sheetData>');
    sh.rows.forEach(function (row, r) {
      if (!row) return;
      out.push('<row r="' + (r + 1) + '">');
      row.forEach(function (cell, c) {
        if (cell === null || cell === undefined || cell === '') return;
        var o = (typeof cell === 'object') ? cell : { v: cell };
        var ref = col(c) + (r + 1), s = STY[o.s || ''] || 0, attr = ' r="' + ref + '"' + (s ? ' s="' + s + '"' : '');
        if (o.f) out.push('<c' + attr + '><f>' + x(o.f) + '</f>' + (typeof o.v === 'number' ? '<v>' + o.v + '</v>' : '') + '</c>');
        else if (typeof o.v === 'number' && isFinite(o.v)) out.push('<c' + attr + '><v>' + o.v + '</v></c>');
        else if (o.v === undefined || o.v === null || o.v === '') out.push('<c' + attr + '/>');
        else out.push('<c' + attr + ' t="inlineStr"><is><t xml:space="preserve">' + x(o.v) + '</t></is></c>');
      });
      out.push('</row>');
    });
    out.push('</sheetData>');
    if (sh.merges && sh.merges.length) out.push('<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
    out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
    out.push('<pageSetup orientation="' + (sh.landscape ? 'landscape' : 'portrait') + '" fitToWidth="1" fitToHeight="0" paperSize="1"/>');
    out.push('<headerFooter><oddFooter>&amp;L&amp;8RINOVAIA&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>');
    out.push('</worksheet>');
    return out.join('');
  }

  function build(sheets, meta) {
    meta = meta || {};
    var files = [];
    files.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>']);
    files.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>']);
    files.push(['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x(meta.title || 'RINOVAIA') + '</dc:title><dc:creator>RINOVAIA</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>']);
    files.push(['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + x(String(s.name).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>']);
    files.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>']);
    files.push(['xl/styles.xml', STYLES]);
    sheets.forEach(function (s, i) { files.push(['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)]); });
    return zip(files);
  }

  // Zip "store" (sin compresión): suficiente y compatible con Excel, Numbers y Google Sheets
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    var d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function download(filename, sheets, meta) {
    var blob = build(sheets, meta), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return blob;
  }

  window.XLSXLite = { build: build, download: download, col: col };
})();
