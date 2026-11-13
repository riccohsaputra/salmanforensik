/* Tes integrasi engine.js di realm Node (shim DOMParser dari jsdom).
 * Catatan: menjalankan JSZip di realm jsdom menggantung pada async() —
 * artefak harness, bukan aplikasi (di browser semua satu realm).
 * Jalankan dari folder tests: node engine-tests.mjs */
import { JSDOM } from "jsdom";
import fs from "fs";
import vm from "vm";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.DOMParser = dom.window.DOMParser;
const load = (p) => vm.runInThisContext(fs.readFileSync(p, "utf8"), { filename: p });
load("../vendor/jszip.min.js");
import { createRequire } from "module";
global.exifr = createRequire(import.meta.url)("../vendor/exifr.umd.js");
load("../assets/core.js");
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
t("XL-02 mismatch formula vs nilai = kritis", xlsxBad.findings.some(f => f.ruleId === "XL-02" && f.severity === "critical"),
  JSON.stringify(xlsxBad.findings.map(f => f.ruleId + ":" + f.severity)));

console.log("JPEG EXIF:");
const img = await E.analyzeImage(buf("foto-exif.jpg"), "jpeg");
t("EXIF DateTimeOriginal terbaca", img.timestamps.some(x => x.source === "exif.dateTimeOriginal"), JSON.stringify(img.timestamps.map(x => x.source)));
t("model/software EXIF terbaca", !!(img.meta.exif && (img.meta.exif.model || img.meta.exif.software)), JSON.stringify(img.meta.exif));
t("dimensi JPEG terbaca", img.meta.dimensions === "800×600", img.meta.dimensions);

console.log(`\nHasil engine: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
