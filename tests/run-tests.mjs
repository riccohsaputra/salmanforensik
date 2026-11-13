/* Tes logika murni SalmanForensik (assets/core.js) — jalankan: node tests/run-tests.mjs */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const C = require("../assets/core.js");

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✕ GAGAL: " + name); } }

console.log("Deteksi tipe:");
t("PDF dari magic bytes", C.detectType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])) === "pdf");
t("JPEG dari magic bytes", C.detectType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) === "jpeg");
t("PNG dari magic bytes", C.detectType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) === "png");
t("ZIP dari magic bytes", C.detectType(new Uint8Array([0x50, 0x4b, 0x03, 0x04])) === "zip");
t("Tidak dikenal", C.detectType(new Uint8Array([1, 2, 3, 4])) === "unknown");

console.log("Parsing tanggal:");
const d1 = C.parsePdfDate("D:20250314091244+07'00'");
t("PDF date +07:00 -> UTC 02:12:44", d1 && d1.toISOString() === "2025-03-14T02:12:44.000Z");
const d2 = C.parsePdfDate("D:20240101000000Z");
t("PDF date Z", d2 && d2.toISOString() === "2024-01-01T00:00:00.000Z");
const d3 = C.parseAnyDate("2025:03:14 09:12:44");
t("EXIF date terbaca", d3 && d3.getFullYear() === 2025 && d3.getMonth() === 2);
t("Tanggal rusak -> null", C.parseAnyDate("bukan tanggal") === null);

console.log("Aturan umur:");
const exam = new Date("2026-11-13T00:00:00Z");
const f1 = C.evaluateAgeRules([
  { role: "creation", date: new Date("2025-05-01T00:00:00Z") },
  { role: "modification", date: new Date("2024-01-01T00:00:00Z") }
], { examDate: exam, claimDate: null, techHits: [], embeddedYounger: false });
t("U-01 modifikasi sebelum pembuatan = kritis", f1.some(f => f.ruleId === "U-01" && f.severity === "critical"));

const f2 = C.evaluateAgeRules([
  { role: "creation", date: new Date("2020-01-01T00:00:00Z") }
], { examDate: exam, claimDate: new Date("2010-06-01T00:00:00Z"), techHits: [{ label: "Microsoft Word 2019", year: 2018 }], embeddedYounger: false });
t("U-05 tidak menembak bila klaim 2010 < rilis? (2010<2018 => harus menembak)", f2.some(f => f.ruleId === "U-05"));

const f3 = C.evaluateAgeRules([
  { role: "creation", date: new Date("2020-01-01T00:00:00Z") }
], { examDate: exam, claimDate: new Date("2022-06-01T00:00:00Z"), techHits: [{ label: "Microsoft Word 2019", year: 2018 }], embeddedYounger: false });
t("U-05 diam bila klaim setelah tahun rilis teknologi", !f3.some(f => f.ruleId === "U-05"));

const f4 = C.evaluateAgeRules([
  { role: "other", date: new Date("2027-01-01T00:00:00Z") }
], { examDate: exam, claimDate: null, techHits: [], embeddedYounger: false });
t("U-07 tanggal masa depan terdeteksi", f4.some(f => f.ruleId === "U-07"));

console.log("Kesimpulan:");
t("Tanpa temuan + cakupan penuh = tidak ditemukan indikasi",
  C.conclude([], 1, true).key === "none");
t("Ada kritis = indikasi kuat",
  C.conclude([{ severity: "critical" }], 1, true).key === "strong");
t("Satu mencurigakan = indikasi lemah",
  C.conclude([{ severity: "suspicious" }], 1, true).key === "weak");
t("Modul umur gagal = bukti tidak cukup",
  C.conclude([], 1, false).key === "insufficient");

console.log("Rujukan:");
const r = C.referralFor("strong", "tanah", "sengketa");
t("Rujukan tanah menyebut BPN", r.join(" ").includes("BPN"));
t("Rujukan indikasi kuat menyebut jalur kepolisian", r.join(" ").includes("kepolisian"));
t("Rujukan selalu memuat petunjuk menjaga bukti", r.join(" ").includes("Jaga bukti"));

console.log("Anakronisme teknologi:");
const hits = C.techAnachronisms(["Diproduksi oleh Microsoft® Word 2019", "Font Calibri"]);
t("Word 2019 terdeteksi (2018)", hits.some(h => h.year === 2018));
t("Calibri terdeteksi (2007)", hits.some(h => h.year === 2007));

console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
