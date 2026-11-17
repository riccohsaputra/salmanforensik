/* Tes integrasi engine.js di realm Node (shim DOMParser dari jsdom).
 * Catatan: menjalankan JSZip di realm jsdom menggantung pada async() —
 * artefak harness, bukan aplikasi (di browser semua satu realm).
 * Jalankan dari folder tests: node engine-tests.mjs */
import { JSDOM } from "jsdom";
import fs from "fs";
import vm from "vm";

process.chdir(new URL(".", import.meta.url).pathname);
const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.DOMParser = dom.window.DOMParser;
const load = (p) => vm.runInThisContext(fs.readFileSync(p, "utf8"), { filename: p });
load("../vendor/jszip.min.js");
import { createRequire } from "module";
global.exifr = createRequire(import.meta.url)("../vendor/exifr.umd.js");
load("../assets/core.js");
load("../assets/sig.js");
load("../assets/engine.js");

const E = globalThis.SFEngine, C = globalThis.SFCore;
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✕ GAGAL: " + name + (extra ? " — " + extra : "")); } };
const buf = (f) => { const b = fs.readFileSync("corpus/" + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

console.log("PDF asli:");
const pdfOk = await E.analyzePdf(buf("pdf-asli.pdf"), "pdf-asli.pdf");
t("timestamp info+xmp terbaca (>=3)", pdfOk.timestamps.length >= 3, "dapat " + pdfOk.timestamps.length);
t("font Helvetica terdeteksi", pdfOk.fonts.includes("Helvetica"));
t("lineage ID dari trailer terbaca", !!pdfOk.lineageId);
t("tidak ada temuan kritis", !pdfOk.findings.some(f => f.severity === "critical"), JSON.stringify(pdfOk.findings.map(f => f.ruleId)));

console.log("PDF moddate mundur:");
const pdfBad = await E.analyzePdf(buf("pdf-moddate-mundur.pdf"), "pdf-moddate-mundur.pdf");
const ageBad = C.evaluateAgeRules(pdfBad.timestamps, { examDate: new Date(), claimDate: null, techHits: [], embeddedYounger: false });
t("U-01 terdeteksi dari gabungan bukti waktu", ageBad.some(f => f.ruleId === "U-01" && f.severity === "critical"), JSON.stringify(ageBad.map(f => f.ruleId)));

console.log("DOCX bersih:");
const docxOk = await E.analyzeDocx(buf("bersih.docx"));
t("core created/modified terbaca", docxOk.timestamps.some(x => x.source === "ooxml.core.created") && docxOk.timestamps.some(x => x.source === "ooxml.core.modified"));
t("teks dokumen terekstrak", /Surat Keterangan/.test(docxOk.text), docxOk.text.slice(0, 80));

console.log("DOCX moddate mundur:");
const docxBad = await E.analyzeDocx(buf("docx-moddate-mundur.docx"));
const ageDocx = C.evaluateAgeRules(docxBad.timestamps, { examDate: new Date(), claimDate: null, techHits: [], embeddedYounger: false });
t("U-01 terdeteksi pada DOCX", ageDocx.some(f => f.ruleId === "U-01"), JSON.stringify(ageDocx.map(f => f.ruleId)));

console.log("XLSX nilai ditimpa:");
const xlsxBad = await E.analyzeXlsx(buf("xlsx-nilai-ditimpa.xlsx"));
t("tidak ada bukti waktu null pada XLSX (regresi crash 'role')", xlsxBad.timestamps.every(x => x && x.date), JSON.stringify(xlsxBad.timestamps.map(x => x && x.source)));
t("core created/modified XLSX terbaca meski format ISO cacat", xlsxBad.timestamps.some(x => x.source === "ooxml.core.created") && xlsxBad.timestamps.some(x => x.source === "ooxml.core.modified"));
t("XL-02 mismatch formula vs nilai = kritis", xlsxBad.findings.some(f => f.ruleId === "XL-02" && f.severity === "critical"),
  JSON.stringify(xlsxBad.findings.map(f => f.ruleId + ":" + f.severity)));

console.log("JPEG EXIF:");
const img = await E.analyzeImage(buf("foto-exif.jpg"), "jpeg");
t("EXIF DateTimeOriginal terbaca", img.timestamps.some(x => x.source === "exif.dateTimeOriginal"), JSON.stringify(img.timestamps.map(x => x.source)));
t("model/software EXIF terbaca", !!(img.meta.exif && (img.meta.exif.model || img.meta.exif.software)), JSON.stringify(img.meta.exif));
t("dimensi JPEG terbaca", img.meta.dimensions === "800×600", img.meta.dimensions);

async function makeOdfZip(mimetype, metaXml, contentXml) {
  const zip = new global.JSZip();
  zip.file("mimetype", mimetype, { compression: "STORE" });
  if (metaXml) zip.file("meta.xml", metaXml);
  if (contentXml) zip.file("content.xml", contentXml);
  return await zip.generateAsync({ type: "arraybuffer" });
}

console.log("ODT (Writer):");
const odtMetaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <office:meta>
    <meta:generator>LibreOffice/7.3.7.2$Linux_X86_64</meta:generator>
    <meta:initial-creator>Ricco</meta:initial-creator>
    <dc:creator>Abu Salman</dc:creator>
    <meta:creation-date>2023-05-01T10:00:00Z</meta:creation-date>
    <dc:date>2023-05-02T12:00:00Z</dc:date>
    <meta:editing-cycles>3</meta:editing-cycles>
    <meta:editing-duration>PT1H20M</meta:editing-duration>
  </office:meta>
</office:document-meta>`;
const odtContentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body>
    <office:text>
      <text:h text:outline-level="1">Surat Keterangan</text:h>
      <text:p>Dokumen ini diterbitkan untuk keperluan verifikasi keabsahan.</text:p>
    </office:text>
  </office:body>
</office:document-content>`;
const odtBuf = await makeOdfZip("application/vnd.oasis.opendocument.text", odtMetaXml, odtContentXml);
const odtOk = await E.analyzeOdt(odtBuf);
t("meta creation-date terbaca sebagai timestamp", odtOk.timestamps.some(x => x.source === "odf.meta.creationDate" && x.date));
t("teks content.xml terekstrak", /Surat Keterangan/.test(odtOk.text));
t("OD-01 muncul untuk editing-cycles 3", odtOk.findings.some(f => f.ruleId === "OD-01" && f.severity === "info"));

console.log("ODS (Calc):");
const odsContentOk = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body>
    <office:spreadsheet>
      <table:table table:name="Lembar1">
        <table:table-row>
          <table:table-cell office:value-type="float" office:value="100"><text:p>100</text:p></table:table-cell>
          <table:table-cell office:value-type="float" office:value="200"><text:p>200</text:p></table:table-cell>
          <table:table-cell table:formula="of:=[.A1]+[.B1]" office:value-type="float" office:value="300"><text:p>300</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    </office:spreadsheet>
  </office:body>
</office:document-content>`;
const odsOkBuf = await makeOdfZip("application/vnd.oasis.opendocument.spreadsheet", odtMetaXml, odsContentOk);
const odsOk = await E.analyzeOds(odsOkBuf);
t("sel rumus cocok tidak memunculkan OD-03", !odsOk.findings.some(f => f.ruleId === "OD-03"));

const odsContentBad = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body>
    <office:spreadsheet>
      <table:table table:name="Lembar1">
        <table:table-row>
          <table:table-cell office:value-type="float" office:value="100"><text:p>100</text:p></table:table-cell>
          <table:table-cell office:value-type="float" office:value="200"><text:p>200</text:p></table:table-cell>
          <table:table-cell table:formula="of:=[.A1]+[.B1]" office:value-type="float" office:value="999"><text:p>999</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    </office:spreadsheet>
  </office:body>
</office:document-content>`;
const odsBadBuf = await makeOdfZip("application/vnd.oasis.opendocument.spreadsheet", odtMetaXml, odsContentBad);
const odsBad = await E.analyzeOds(odsBadBuf);
t("OD-03 muncul untuk sel rumus tidak cocok", odsBad.findings.some(f => f.ruleId === "OD-03" && f.severity === "suspicious"));

console.log(`\nHasil engine: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
