# Brief Fase 3 — Dukungan Format LibreOffice (ODT & ODS)

Baca dulu `AGENTS.md` di root proyek; patuhi invarian (UI Bahasa Indonesia, kata
kesimpulan terkunci, perubahan bedah, tes Node tetap hijau). Jangan sentuh
sig.js, ocr.js, core.js selain pemetaan ekstensi bila memang ada di sana
(cek dulu; laporkan bila tidak perlu).

## Tujuan
Tambahkan dukungan format OpenDocument: **.odt** (LibreOffice Writer) dan
**.ods** (LibreOffice Calc). Keduanya ZIP berisi XML (kerabat DOCX/XLSX);
pakai JSZip yang sudah tervendor dengan pola yang sama seperti analyzeDocx/
analyzeXlsx di `assets/engine.js`. Kode aturan baru: **OD** (OpenDocument).

## engine.js — fungsi baru
Struktur hasil mengikuti `baseResult` yang ada (meta, timestamps, findings,
text, embedded, fonts, lineageId bila ada).

### Pembantu bersama `parseOdfMeta(zip)` (dipakai ODT & ODS)
Baca `meta.xml` (DOMParser seperti jalur DOCX):
- `meta:generator` → out.meta.generator
- `initial-creator`/`dc:creator` → meta creator
- `meta:creation-date` → timestamp creation (keandalan "B")
- `dc:date` → timestamp modification (keandalan "B")
- `meta:editing-cycles` (angka) & `meta:editing-duration` → simpan di meta
Temuan bersama:
- OD-01 `info` bila editing-cycles > 1: "Dokumen telah melalui N siklus
  penyuntingan" (observed: generator + siklus; penjelasan netral).
- OD-02 `suspicious` bila creation-date dan dc:date tidak konsisten secara
  mustahil (modifikasi LEBIH DULU dari pembuatan > 1 hari): pola mengikuti
  PF-01.

### `analyzeOdt(buf)`
- meta via parseOdfMeta.
- Teks: `content.xml` — gabung teks semua `text:p` dan `text:h` (textContent
  per elemen, pisahkan spasi/baris) → out.text (untuk pembanding & aturan teks).
- Font: kumpulkan nama font dari `style:font-name` pada content.xml + styles.xml
  (atribut `svg:font-family` / `style:font-name`) → out.fonts (unik).
- Objek tertanam: entri zip di bawah `Pictures/` atau `Object/` → out.embedded
  (nama + ukuran bila tersedia) mengikuti pola format lain.
- `meta:document-statistic` (jumlah halaman/kata) → meta bila ada.

### `analyzeOds(buf)`
- meta via parseOdfMeta.
- Isi: `content.xml` — untuk tiap `table:table` (nama dari `table:name`):
  telusuri `table:table-row`/`table:table-cell`; nilai tampil dari atribut
  `office:value` (angka), `office:string-value`, atau teks `text:p` di sel.
  Gabungkan nilai tampil sebagai teks (dibatasi wajar, mis. 2000 sel) → out.text.
- Cek rumus vs nilai cache (pola XL pada analyzeXlsx): sel dengan atribut
  `table:formula` DAN `office:value`: normalisasi rumus ODF ke bentuk yang
  dipahami `evalFormula` yang sudah ada — buang awalan namespace sebelum `=`
  (mis. `oooc:`/`of:`), ubah referensi `[.A1]`/`[Sheet.A1]` menjadi `A1`
  (abaikan referensi antar-sheet — perlakukan tak dapat dievaluasi), lalu
  evaluasi; bila hasil hitung ulang berbeda dari office:value di luar toleransi
  0.01 → OD-03 `suspicious` "Nilai tersimpan sel rumus berbeda dari hasil
  hitung ulang" (observed: alamat sel, rumus, nilai tersimpan vs hitung).
  Rumus yang tidak dapat dievaluasi: lewati diam-diam (jangan temuan).
- Jumlah sheet & sel berumus → meta.

## app.js
- `lightCheck`: pada cabang ZIP, setelah cek docx/xlsx: bila ada
  `zip.files["mimetype"]`, baca isinya (`zip.files["mimetype"].async("string")`):
  mengandung `opendocument.text` → "odt"; `opendocument.spreadsheet` → "ods".
  Fallback bila mimetype tak terbaca: ada `content.xml` + `meta.xml` dan TIDAK
  ada word/xl → periksa `zip.files["content.xml"]` sekilas tidak wajib; cukup
  kembalikan "zip-lain" (jangan menebak).
- KIND_LABEL: odt "ODT (LibreOffice Writer)", ods "ODS (LibreOffice Calc)";
  KIND_ICON samakan dengan docx/xlsx.
- Daftar supported: tambah "odt", "ods". Teks peringatan format di luar
  dukungan perbarui: "(PDF, DOCX, XLSX, ODT, ODS, JPG, PNG)".
- Dispatch pipeline tersangka & pembanding: odt → E.analyzeOdt, ods → E.analyzeOds.
- Penalti cakupan tanpa teks: kondisi `k === "pdf" || k === "docx"` tambah
  `|| k === "odt"`.
- Ekspor JSON & laporan cetak memakai res generik — pastikan tidak ada asumsi
  kind yang mematahkan odt/ods (grep "docx" di app.js dan nilai satu per satu).

## index.html
- Kedua input file: accept tambah `.odt,.ods`.
- Teks petunjuk dropzone: "PDF · DOCX · XLSX · ODT · ODS · JPG · PNG — maks
  dianjurkan 50 MB" (kedua zona bila teksnya ganda).

## Dokumentasi dalam aplikasi
- Keterangan kode aturan (tab Metodologi + legenda laporan cetak): tambah
  "OD = OpenDocument (LibreOffice)".
- Daftar format yang didukung di Metodologi (bila ada) perbarui.

## core.js
- Cek `EXT_TYPE`: bila ada peta ekstensi→jenis, tambah odt/ods
  ("opendocument-text"/pola yang konsisten dengan pemakaian di app.js —
  sesuaikan dengan pola string yang dibandingkan di onFile; laporkan
  keputusanmu). Bila tidak ada peta seperti itu, jangan buat baru.

## Tes — tests/engine-tests.mjs
Tambah kasus ODT & ODS mengikuti pola fixture yang ada (bangun ZIP ODF
minimal di Node: entri `mimetype` (stored), `meta.xml`, `content.xml`):
- ODT: meta creation-date terbaca sebagai timestamp; teks content.xml
  terekstrak; OD-01 muncul untuk editing-cycles 3.
- ODS: sel berumus dengan office:value yang TIDAK cocok dengan hitung ulang
  → OD-03 muncul; sel yang cocok → tidak ada OD-03.
Suite lama harus tetap hijau (core 23/23, sig 25/25; engine bertambah sesuai
kasus baru — laporkan hitungan akhirnya).

## Batasan
- Jangan mengubah aturan/format lain, kesimpulan, tema, atau teks di luar
  cakupan. `node --check` semua berkas diubah.
- Akhir: ringkasan perubahan + keputusan teknis di luar brief.
