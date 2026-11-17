# Spesifikasi Produk & Teknis — SalmanForensik

**Versi:** 1.0 (Terkunci)
**Tanggal:** 13 November 2026
**Status:** Hasil final diskusi perancangan Ricco × Rumi, 13 November 2026. Dokumen ini adalah acuan tunggal pembangunan. Perubahan atas isi terkunci hanya melalui revisi versi dokumen ini.
**Produk:** SalmanForensik — created by Ricco Abu Salman
**Tagline:** Screening Forensik Dokumen Digital — telusuri umur, riwayat perubahan, dan indikasi manipulasi dokumen, langsung di browser Anda, tanpa unggah ke server.

---

## 1. Ringkasan Produk

SalmanForensik adalah aplikasi web untuk **screening awal (pemeriksaan pendahuluan) forensik dokumen digital**. Pengguna memuat sebuah dokumen, aplikasi memeriksanya secara lokal di browser, lalu menyajikan:

1. Profil **umur dokumen secara detail** — kapan dibuat, kapan dan berapa kali dimodifikasi, direkonstruksi dari banyak sumber bukti waktu di dalam file.
2. Temuan indikasi manipulasi dari struktur, metadata, konten, dan objek sisipan dokumen.
3. Perbandingan terhadap dokumen pembanding asli (opsional).
4. Kesimpulan screening berkategori dan **rekomendasi rujukan** ke pihak yang berwenang (penerbit dokumen, laboratorium forensik formal, atau jalur hukum).
5. Keluaran berupa **laporan PDF ringkas** dan **berkas JSON teknis terpisah**.

## 2. Posisi Produk & Batasan Wajib

Ketentuan ini tidak boleh dilanggar oleh desain, teks antarmuka, maupun materi promosi:

- SalmanForensik adalah alat **screening awal**, BUKAN alat penetapan keaslian. Aplikasi tidak pernah menyatakan dokumen "ASLI" atau "PALSU".
- Kesimpulan hanya boleh memakai empat kategori pada Bagian 13.
- Tidak adanya temuan bukan bukti keaslian; laporan wajib memuat pernyataan ini.
- Aplikasi tidak menggantikan pemeriksaan ahli forensik dokumen, verifikasi penerbit dokumen, maupun proses hukum.
- Umur fisik kertas dan tinta **tidak diperiksa** (lihat Backlog Riset, Bagian 21).
- Aplikasi tidak menyediakan fitur "verifikasi laporan online" (mis. QR verifikasi), karena tidak ada server penyimpanan; identitas laporan dibuktikan oleh ID laporan + hash dokumen + waktu pembuatan laporan.

## 3. Keputusan Terkunci

| # | Aspek | Keputusan |
|---|-------|-----------|
| 1 | Tujuan | Screening awal investigasi dokumen digital; hasil diarahkan ke institusi terkait |
| 2 | Fokus utama | Umur file digital secara DETAIL: dibuat kapan, dimodifikasi kapan dan berapa kali, dari triangulasi banyak sumber timestamp |
| 3 | Format MVP | PDF, DOCX, XLSX, dan gambar (JPG/PNG) — termasuk foto dokumen hasil print sebagai file gambar |
| 4 | Pembanding | Opsional — didukung mode dengan dan tanpa dokumen pembanding asli |
| 5 | Platform | Aplikasi web di **GitHub Pages**, tanpa instalasi, cukup membuka tautan |
| 6 | Pemrosesan | 100% *client-side* di browser pengguna; dokumen **tidak pernah dikirim ke server** |
| 7 | Penghapusan | Tanpa timer: data sesi hilang saat tab ditutup atau tombol "Hapus Sesi" ditekan |
| 8 | Nama | **SalmanForensik** (keluarga merek SalmanPDF); slug repo `salmanforensik` |
| 9 | Tampilan | Gaya macOS; tema **Terang / Gelap / Otomatis** (default Otomatis mengikuti perangkat) |
| 10 | Keluaran | Laporan **PDF ringkas** + **JSON teknis terpisah**, berbagi ID laporan yang sama |
| 11 | Di luar MVP | Penentuan umur fisik kertas/tinta dari foto → riset lanjutan (Bagian 21) |
| 12 | Bahasa | Antarmuka dan laporan: Bahasa Indonesia |

## 4. Pengguna & Skenario Utama

**Pengguna sasaran:** masyarakat umum yang menerima dokumen dan ingin memeriksa kewajarannya (ijazah, sertifikat, surat keterangan, kwitansi, laporan), staf administrasi/kampus/instansi yang melakukan verifikasi awal, serta pendidik/peneliti forensik digital.

**Skenario A — Cek dokumen tanpa pembanding.** Pengguna menerima PDF ijazah hasil pindaian. Ia memuat file, memulai pemeriksaan, menerima profil umur + temuan, dan rekomendasi untuk verifikasi ke kampus penerbit.

**Skenario B — Cek dengan pembanding.** Pengguna memiliki DOCX asli dari penerbit dan versi yang beredar. Keduanya dimuat; aplikasi menilai relasi kedua file dan perbedaan utamanya.

**Skenario C — Foto dokumen cetak.** Pengguna hanya memiliki foto (JPG) dokumen hasil print. Aplikasi memeriksa umur file foto, riwayat penyuntingan gambar, indikasi manipulasi visual, dan anakronisme isi — dengan batasan yang dinyatakan eksplisit.

**Skenario D — Rujukan formal.** Hasil screening berkategori "Indikasi kuat" digunakan pengguna sebagai bahan awal saat melapor/meminta pemeriksaan ke penerbit dokumen atau jalur formal, dengan membawa PDF ringkas + JSON teknis.

## 5. Arsitektur Sistem

### 5.1 Prinsip
GitHub Pages hanya melayani berkas statis. Karena itu seluruh logika berjalan di peramban pengguna:

```
Repo GitHub (kode sumber)
        │  build statis
        ▼
GitHub Pages ──► Browser pengguna mengunduh aplikasi (HTML/JS/WASM)
                        │
                        ├─ File API: dokumen dibaca ke memori tab (tidak diunggah)
                        ├─ Web Worker: mesin analisis (antarmuka tidak membeku, bisa dibatalkan)
                        ├─ Modul parser per format → model bukti terpadu
                        ├─ Mesin timeline + mesin aturan temuan + mesin rujukan
                        └─ Pembangkit laporan PDF & JSON (lokal, diunduh pengguna)
```

### 5.2 Konsekuensi arsitektur
- Tidak ada backend, basis data, akun pengguna, analitik, dan tidak ada panggilan jaringan apa pun setelah aplikasi termuat.
- Kekuatan pemrosesan bergantung pada perangkat pengguna; pemeriksaan berat memberi peringatan dan anjuran memakai browser desktop.
- Kode sumber bersifat terbuka di repo; tidak ada rahasia/kredensial di sisi klien.

### 5.3 Tumpukan teknologi (kandidat, dibuktikan lewat spike pada Milestone 1)
- Bahasa & build: TypeScript + Vite, aplikasi statis.
- Eksekusi analisis: Web Worker khusus; pembatalan via `AbortController`/pesan worker.
- PDF: PDF.js (render & ekstraksi teks) + **parser struktur kustom** (xref, trailer, incremental update, objek) — parser kustom wajib karena pemeriksaan forensik memerlukan data di bawah level API render. Evaluasi MuPDF WASM sebagai alternatif.
- DOCX/XLSX: JSZip untuk membuka kontainer OOXML + parser XML (DOMParser) atas part-part internal.
- Gambar: parser EXIF/XMP berbasis JS (mis. exifr) + Canvas API untuk analisis piksel; OCR (Tesseract.js WASM) untuk foto dokumen.
- Laporan PDF: dibangkitkan dari tampilan cetak (print stylesheet A4) — mekanisme persisnya diputuskan pada spike; JSON dibuat dari model hasil analisis.
- Semua pustaka **di-bundle dari repo sendiri** (self-hosted); tidak ada CDN pihak ketiga saat runtime.

## 6. Model Privasi & Penghapusan Sesi

Aturan keras implementasi:

1. Dokumen, hasil analisis, dan isian formulir **hanya hidup di memori tab** (variabel/ArrayBuffer).
2. **Dilarang** menyimpan data dokumen/hasil/isi formulir ke LocalStorage, SessionStorage, IndexedDB, cookie, atau cache Service Worker. Aplikasi tidak memasang Service Worker yang meng-cache data pengguna.
3. Pengecualian satu-satunya: **preferensi tema** (terang/gelap/otomatis) boleh disimpan di LocalStorage karena bukan data dokumen.
4. URL objek pratinjau (`URL.createObjectURL`) wajib dicabut (`revokeObjectURL`) saat sesi dihapus/diakhiri.
5. **Tab ditutup = sesi berakhir.** Tidak ada pemulihan sesi.
6. Tombol **"Hapus Sesi"** selalu terlihat di header; menekan tombol ini (dengan konfirmasi) membersihkan seluruh state pemeriksaan dan mengembalikan aplikasi ke layar awal kosong.
7. **Tanpa timer** penghapusan otomatis.
8. Redaksi privasi yang wajib tampil di antarmuka: dokumen diproses di perangkat pengguna dan tidak diunggah; yang dibersihkan adalah salinan di dalam aplikasi — berkas asli di perangkat pengguna tetap milik pengguna dan tidak dihapus aplikasi.
9. Laporan unduhan adalah satu-satunya data yang keluar dari sesi, dan hanya atas tindakan eksplisit pengguna.

## 7. Alur Pengguna & Spesifikasi Layar

### 7.1 Layar Awal (Landing)
- Logo + nama SalmanForensik + tagline.
- Lencana privasi: "100% diproses di browser Anda — file tidak diunggah ke server".
- Penjelasan singkat 3 langkah + daftar format yang didukung + peringatan posisi screening.
- Kotak muat dokumen (drag & drop atau klik pilih berkas).

### 7.2 Layar Persiapan (setelah berkas dipilih — pemeriksaan TIDAK auto-jalan)
- Pemeriksaan ringan seketika: nama berkas, ukuran, dan **tipe berkas dari magic bytes** (bukan ekstensi). Ketidaksesuaian ekstensi vs isi ditampilkan sebagai peringatan awal.
- Kartu identitas awal berkas tersangka.
- Bagian opsional (dilipat, tidak mengganggu alur cepat):
  - Muat dokumen pembanding.
  - Formulir konteks: jenis dokumen (pilihan: Ijazah/Transkrip; Sertifikat; Surat Instansi/Perusahaan; Dokumen Keuangan; Dokumen Tanah; Dokumen Kependudukan; Akta/Kontrak; Lainnya), nama penerbit, tanggal tertera/diklaim pada dokumen, tujuan pemeriksaan (Cek pribadi; Kebutuhan instansi; Ada sengketa), nama pemeriksa (untuk laporan).
- Peringatan pra-proses bila berkas melebihi ambang ukuran (Bagian 18).
- Tombol utama: **"Mulai Pemeriksaan"**.

### 7.3 Layar Proses
- Daftar 8 tahapan berstatus (selesai / berjalan / menunggu / dilewati / gagal) sesuai Bagian 8.
- Progress bar keseluruhan berbasis bobot tahapan + timer berjalan. Persentase adalah estimasi penyelesaian tahapan, **bukan** janji waktu.
- Panel hasil terisi **bertahap**: identitas + hash muncul lebih dulu, lalu timeline, lalu temuan (dengan penghitung per tingkat). Banner kesimpulan tetap nonaktif bertuliskan "Menilai…" sampai mesin aturan selesai.
- Tombol **Batalkan**; peringatan "Jangan tutup tab ini — sesi dan hasil akan hilang."
- Pemeriksaan berjalan di Web Worker agar antarmuka tetap responsif.

### 7.4 Layar Hasil
- Header selesai: durasi pemeriksaan + kategori kesimpulan + label "Pemeriksaan Parsial" bila ada modul gagal (Bagian 17).
- Tab (segmented control ala macOS): **Ringkasan | Timeline Umur | Temuan | Struktur & Objek | Pembanding | Metodologi & Batasan**.
- Aksi: **Unduh Laporan PDF**, **Unduh JSON Teknis**, **Periksa Berkas Lain** (menghapus sesi berjalan), **Hapus Sesi**.
- Sakelar privasi sebelum unduh PDF: sertakan nama berkas asli (ya/samarkan), sertakan cuplikan halaman teranotasi (ya/tidak).

### 7.5 Keadaan Kosong, Gagal, dan Parsial
Semua keadaan galat dirancang manusiawi: apa yang terjadi, apa dampaknya ke hasil, dan apa yang disarankan (lihat Bagian 17).

## 8. Tahapan Pemeriksaan (Pipeline)

| Tahap | Nama | Isi pekerjaan |
|-------|------|---------------|
| 1 | Akuisisi & Integritas | Baca berkas ke memori read-only; hitung **SHA-256**; catat waktu sesi & ID laporan acak lokal; file asli tidak pernah diubah |
| 2 | Identifikasi | Tipe dari magic bytes; versi format; jumlah halaman/sheet; ukuran halaman/dimensi; enkripsi |
| 3 | Ekstraksi Metadata & Bukti Waktu | Semua metadata + seluruh sumber timestamp per format (Bagian 10–11) |
| 4 | Timeline Umur | Normalisasi zona waktu; pengurutan; penandaan inkonsistensi & anakronisme; pembentukan jendela kesimpulan umur |
| 5 | Struktur & Konten | Pemeriksaan khas format (Bagian 11): struktur internal, font/teks, formula, revisi, dan sejenisnya |
| 6 | Objek Sisipan & Tanda Tangan | Inventaris + hash tiap objek sisipan; pemeriksaan EXIF sisipan; validasi tanda tangan digital PDF bila ada |
| 7 | Pembanding | Hanya bila pembanding dimuat (relasi & perbedaan, Bagian 12); selain itu berstatus "dilewati" |
| 8 | Penilaian & Rujukan | Mesin aturan temuan → kategori kesimpulan → rekomendasi rujukan; susun model laporan |


## 9. Model Data Inti (Terpadu untuk Semua Format)

Seluruh parser wajib menormalkan hasil ke model berikut; mesin timeline, temuan, pembanding, dan laporan hanya bekerja atas model ini.

**FileIdentity** — `fileName`, `detectedType` (dari magic bytes), `declaredExtension`, `sizeBytes`, `sha256`, `pageOrSheetCount`, `encrypted` (bool), `role` (`suspect` | `reference`).

**TimestampEvidence** — satu bukti waktu:
```json
{
  "source": "pdf.xmp.modifyDate",
  "location": "metadata blok XMP",
  "rawValue": "2026-03-14T09:12:44+07:00",
  "normalizedUtc": "2026-03-14T02:12:44Z",
  "timezonePresent": true,
  "precision": "second",
  "reliability": "B",
  "note": "Ditetapkan aplikasi pembuat; dapat diubah alat metadata"
}
```

**Finding** — satu temuan:
```json
{
  "id": "SF-001",
  "ruleId": "U-03",
  "severity": "critical | suspicious | info",
  "category": "umur | struktur | konten | objek-sisipan | tanda-tangan | pembanding | gambar",
  "title": "Tanggal modifikasi lebih dulu daripada tanggal pembuatan",
  "location": "Metadata PDF (Info Dictionary vs XMP)",
  "observed": "ModDate 2024-… < CreationDate 2025-…",
  "explanation": "…",
  "method": "Perbandingan ternormalisasi seluruh TimestampEvidence",
  "confidence": "high | medium | low"
}
```

**EmbeddedObject** — `kind` (gambar/font/berkas/lampiran), `format`, `sizeBytes`, `sha256`, `exif` (bila ada), `location` (halaman/sheet/part).
**TextSpan** (PDF/gambar-OCR) — `text` (potongan), `page`, `fontName`, `fontSize`, `color`, `bbox`, `baseline`.
**ComparisonResult** — relasi + daftar perbedaan terstruktur (Bagian 12).

Prinsip: model menyimpan **nilai mentah dan nilai ternormalisasi secara terpisah**; tidak ada bukti waktu yang dibuang atau ditimpa.

## 10. Modul Umur & Timeline (Fitur Inti)

### 10.1 Tingkat keandalan bukti waktu
- **A — Kuat:** waktu dari tanda tangan digital bertimestamp TSA; tanggal tersandi pada artefak pihak ketiga yang sulit dipalsukan pengguna biasa.
- **B — Sedang:** metadata internal yang konsisten lintas sumber independen di dalam file (Info Dictionary vs XMP vs part internal OOXML).
- **C — Lemah:** satu metadata tunggal yang mudah diubah (mis. hanya `CreationDate` PDF).
- **D — Sangat lemah:** `lastModified` berkas dari File API (berubah saat berkas disalin) — ditampilkan hanya sebagai konteks sesi, tidak dipakai menarik kesimpulan umur.

### 10.2 Sumber bukti waktu per format
- **PDF:** Info Dictionary `CreationDate`/`ModDate` (+offset zona); XMP `CreateDate`/`ModifyDate`/`MetadataDate`; tiap segmen *incremental update* (trailer) sebagai bukti penyimpanan ulang; waktu tanda tangan + TSA; EXIF gambar sisipan; tanggal rilis Producer/versi PDF/font (untuk anakronisme).
- **DOCX/XLSX:** `docProps/core.xml` (created, modified, revision, total editing time); `docProps/app.xml` (aplikasi & versi); timestamp **tiap entri di dalam ZIP**; tanggal revisi/komentar per penulis; EXIF media sisipan.
- **JPG/PNG:** EXIF `DateTimeOriginal`/`DateTime`/`DateTimeDigitized`, model perangkat, software; XMP `CreateDate`/`ModifyDate` + riwayat edit (`History`) bila ada; chunk teks PNG (`tEXt`/`iTXt`) berisi Software/Creation Time.

### 10.3 Aturan analisis umur (rule ID U)
- **U-01** Modifikasi lebih dulu daripada pembuatan (inkonsistensi keras).
- **U-02** Ketidaksepakatan tanggal antar sumber sejajar (mis. Info Dictionary vs XMP berbeda tanpa penjelasan pola simpan-ulang).
- **U-03** Tanggal tertera/diklaim pada isi dokumen **lebih tua** daripada batas umur terbukti (anakronisme — temuan kritis).
- **U-04** Objek sisipan (foto/tanda tangan/stempel) lebih muda daripada dokumen induknya.
- **U-05** Teknologi anachronistic: versi software/font/format yang dipakai baru ada setelah tanggal klaim (basis data rilis terverifikasi, di-bundle dan berversi bersama aturan).
- **U-06** Pola penyalinan: seluruh timestamp identik sampai detik di banyak sumber yang seharusnya independen.
- **U-07** Tanggal di masa depan relatif terhadap waktu pemeriksaan.
- **U-08** Metadata waktu terhapus total/ter-strip (bukan temuan manipulasi; memicu penurunan cakupan & kemungkinan kategori "Bukti tidak cukup").
- **U-09** Jumlah segmen incremental update / nomor revisi tidak wajar terhadap klaim riwayat dokumen (konteks, tingkat mencurigakan sesuai pola).
- **U-10** Zona waktu hilang/bercampur sehingga urutan kejadian ambigu (info/mencurigakan sesuai dampaknya).

### 10.4 Keluaran modul umur ("Laporan Umur 3 Lapis")
1. **Klaim** — tanggal tertera pada dokumen (dari isian pengguna dan/atau ekstraksi isi) + tanggal metadata utama.
2. **Jejak internal** — tabel + visual timeline seluruh TimestampEvidence terurut, lengkap dengan sumber, konversi UTC/WIB, dan tingkat keandalan.
3. **Batas umur yang dapat dibuktikan** — bukti internal paling awal; bukti modifikasi terakhir; dan *terminus post quem* (dokumen tidak mungkin dibuat sebelum tanggal X) beserta dasarnya bila ada anakronisme.

## 11. Pemeriksaan per Format

### 11.1 PDF (pemeriksaan terdalam)
- **PF-01** Konsistensi Info Dictionary vs XMP (judul, penulis, tanggal).
- **PF-02** Rekonstruksi incremental update: jumlah revisi tersimpan, perbedaan antar-revisi bila dapat dipulihkan.
- **PF-03** Inventaris objek: halaman, font (nama, subset, embedding), gambar (resolusi efektif, kompresi), lampiran/berkas tersembunyi, JavaScript/aksi otomatis, lapisan (OCG).
- **PF-04** Ekstraksi TextSpan per halaman: deteksi inkonsistensi font/ukuran/warna/baseline dalam satu baris/dokumen (pola klasik penggantian nama/angka/tanggal).
- **PF-05** Konten tersembunyi: teks berwarna sama dengan latar, teks di luar area halaman, teks ukuran ekstrem kecil, redaksi tidak sempurna (teks tertutup kotak tetapi masih terekstrak).
- **PF-06** Tanda tangan digital: keberadaan, validitas rantai sertifikat sejauh dapat diperiksa di browser, waktu tanda tangan, TSA, dan apakah dokumen berubah setelah ditandatangani.
- **PF-07** Objek tanda tangan/stempel raster: hash pikselnya disimpan untuk uji identitas antardokumen (Bagian 12).
- **PF-08** Anomali struktur: objek yatim, xref tidak konsisten, perbedaan jumlah objek terhadap pola Producer yang diklaim.

### 11.2 DOCX
- **DC-01** Properti inti & aplikasi (penulis, perusahaan, aplikasi+versi, total waktu edit, nomor revisi).
- **DC-02** Konsistensi timestamp antar part ZIP vs core.xml (pola perakitan dari potongan lain).
- **DC-03** Jejak revisi: `w:ins`/`w:del`, komentar + tanggalnya, RSID sesi penyuntingan, penulis terakhir mengubah.
- **DC-04** Media sisipan: inventaris + EXIF + hash (termasuk gambar tanda tangan/stempel untuk uji identitas).
- **DC-05** Elemen tersembunyi: teks `w:vanish`, bidang (field) dinamis, custom XML, thumbnail pratinjau versi awal bila ada, objek OLE tertanam.

### 11.3 XLSX
- **XL-01** Properti workbook & konsistensi timestamp part ZIP vs core.xml.
- **XL-02** **Formula vs nilai tersimpan (cached value) tidak cocok** — sel yang nilainya ditimpa tanpa perhitungan ulang formula.
- **XL-03** Sheet tersembunyi & `veryHidden`; baris/kolom tersembunyi; filter & area cetak yang menyembunyikan data.
- **XL-04** Komentar/catatan + penulis & tanggalnya; riwayat revisi workbook bersama bila ada.
- **XL-05** Tautan eksternal, nama terdefinisi (defined names) mencurigakan, objek/media tertanam + EXIF-nya.
- **XL-06** Inkonsistensi gaya/format pada sel-sel angka kunci dibanding pola sekitarnya (indikasi penimpaan manual) — tingkat info/mencurigakan, bukan bukti tunggal.

### 11.4 Gambar (JPG/PNG) — termasuk foto dokumen hasil print
- **IM-01** EXIF/XMP lengkap + riwayat penyuntingan (software pengolah, jejak simpan ulang).
- **IM-02** Tabel kuantisasi JPEG & penanda editor (pola kompresi khas perangkat lunak pengolah gambar) sebagai konteks asal-usul.
- **IM-03** Ketidakcocokan thumbnail tertanam vs gambar utama.
- **IM-04** Analisis visual: inkonsistensi noise antarwilayah, indikasi copy-move/splicing, dan Error Level Analysis — **ELA dan sejenisnya hanya petunjuk awal**, wajib diberi label kepercayaan rendah dan tidak boleh berdiri sendiri sebagai temuan kritis.
- **IM-05** Jalur foto dokumen: koreksi perspektif ringan untuk pratinjau; OCR untuk mencocokkan tanggal/nama tertera dengan klaim pengguna; penilaian urutan tindih teks–stempel–tanda tangan pada perbesaran (kronologi relatif).
- **IM-06** Anakronisme isi: model perangkat pada EXIF, logo/kop, dan format penulisan yang tidak sejalan dengan tanggal klaim foto/dokumen.
- **IM-07** Batasan wajib tampil: dari foto, aplikasi memeriksa umur **file foto** dan indikasi visual — bukan umur fisik kertas/tinta (Bagian 2 & 21).

## 12. Mode Pembanding

Aktif hanya bila berkas pembanding dimuat. Keluaran relasi berkategori:
`File identik` · `Kemungkinan turunan dari sumber yang sama` · `Dokumen berbeda yang meniru tampilan` · `Bukti kurang untuk menilai relasi`.

Pemeriksaan:
- **PB-01** Hash SHA-256 identik atau tidak.
- **PB-02** Tabel beda metadata & bukti waktu berdampingan.
- **PB-03** Uji garis keturunan: PDF Document ID (bagian pertama trailer ID), XMP DocumentID/InstanceID, ID sesi/revisi OOXML — kesamaan ID menunjukkan asal-usul yang sama.
- **PB-04** Beda teks kata-per-kata ter-highlight (untuk PDF/DOCX; untuk XLSX beda per sel: nilai & formula).
- **PB-05** Beda visual halaman setelah disejajarkan (overlay geser) untuk PDF & gambar.
- **PB-06** Uji identitas objek tanda tangan/stempel: hash piksel **persis sama** pada dokumen berbeda adalah indikasi kuat penempelan salinan (tanda tangan wajar tidak pernah identik piksel-per-piksel).
- **PB-07** Beda struktur: jumlah objek/font/part internal.
Tanpa pembanding, modul ini dilewati dan laporan menyatakan analisis bersifat intrinsik dengan keterbatasan itu.


## 13. Mesin Temuan & Kesimpulan Screening

### 13.1 Tingkat temuan
- **Kritis** — anomali struktural/faktual yang sangat sulit terjadi pada dokumen wajar (mis. anakronisme terbukti U-03, modifikasi sebelum pembuatan U-01, tanda tangan piksel-identik PB-06, redaksi bocor PF-05, formula–nilai bertentangan XL-02).
- **Mencurigakan** — pola tidak wajar yang punya kemungkinan penjelasan sah (inkonsistensi metadata, revisi berlapis, objek sisipan lebih muda).
- **Info** — fakta konteks pemeriksaan (produser, jumlah revisi, metadata ter-strip, dsb).

### 13.2 Kategori kesimpulan (satu-satunya yang boleh dipakai)
1. **Tidak ditemukan indikasi signifikan** — pemeriksaan selesai dengan cakupan memadai dan tidak ada temuan kritis/mencurigakan material.
2. **Indikasi lemah** — hanya temuan mencurigakan ringan/terisolir.
3. **Indikasi kuat adanya manipulasi** — ≥1 temuan kritis, atau pola temuan mencurigakan yang saling menguatkan lintas modul.
4. **Bukti tidak cukup** — cakupan pemeriksaan terlalu rendah untuk menyimpulkan (enkripsi tidak dapat dibuka, berkas rusak berat, seluruh bukti waktu ter-strip, hanya tersedia foto beresolusi sangat rendah, dsb).

### 13.3 Aturan penilaian
- Penilaian **berbasis aturan deterministik yang terdokumentasi** (ruleId pada tiap Finding); tidak ada skor "AI" kotak-hitam.
- Yang boleh ditampilkan sebagai angka hanyalah **indeks cakupan pemeriksaan** (seberapa banyak modul berhasil berjalan), dan wajib diberi label persis sebagai cakupan — bukan skor keaslian.
- Tiap kategori wajib disertai alasan yang merujuk Finding ID konkret dan daftar "yang tidak diperiksa".
- Pemeriksaan parsial (Bagian 17) membatasi kategori maksimum yang boleh dikeluarkan; bila modul umur gagal total, kategori hanya boleh "Bukti tidak cukup".

## 14. Mesin Rekomendasi Rujukan

### 14.1 Masukan
Kategori kesimpulan + jenis dokumen + tujuan pemeriksaan (dari formulir konteks Bagian 7.2). Bila formulir kosong, rekomendasi bersifat umum.

### 14.2 Jenjang rekomendasi
- **Kategori 1 (tidak ada indikasi signifikan):** arsipkan laporan; bila dokumen bernilai penting, verifikasi berkala ke penerbit tetap disarankan.
- **Kategori 2 (indikasi lemah):** verifikasi ke penerbit dokumen sebagai langkah utama.
- **Kategori 3 (indikasi kuat):** (a) verifikasi tertulis ke penerbit; (b) bila ada dugaan penggunaan untuk penipuan/tindak pidana → buat laporan ke kepolisian (SPKT Polres/Polda) — pemeriksaan laboratorium forensik formal (mis. Puslabfor Polri) pada umumnya berjalan atas permintaan penyidik/instansi, sehingga jalur publiknya melalui laporan kepolisian; (c) untuk sengketa perdata/kebutuhan pendapat ahli → ahli forensik digital / laboratorium forensik universitas, dengan pendampingan advokat bila perlu.
- **Kategori 4 (bukti tidak cukup):** rekomendasikan bahan tambahan: berkas digital asli dari penerbit, dokumen pembanding, dan/atau dokumen fisik asli — lalu pemeriksaan ulang atau rujukan dengan bahan lengkap.

### 14.3 Pemetaan penerbit per jenis dokumen
| Jenis dokumen | Rujukan verifikasi pertama |
|---|---|
| Ijazah / transkrip | Sekolah/kampus penerbit; untuk perguruan tinggi juga data SIVIL/PDDikti |
| Sertifikat tanah | Kantor Pertanahan (BPN) setempat |
| Dokumen kependudukan | Dinas Dukcapil |
| Dokumen perbankan/keuangan | Bank/lembaga penerbit |
| Akta / dokumen notaris | Kantor notaris yang bersangkutan |
| Surat instansi/perusahaan | Instansi/perusahaan penerbit (bagian SDM/legal) |
| Putusan/dokumen pengadilan | Pengadilan penerbit |
| Lainnya | Penerbit dokumen sebagaimana tertera pada dokumen |

### 14.4 Petunjuk menjaga bukti (selalu tampil pada rekomendasi)
Jangan membuka lalu menyimpan-ulang berkas (mengubah metadata); jangan mengedit/mengganti nama secara massal; simpan salinan apa adanya beserta hash-nya; bawa berkas dari perangkat asal bila ada; bawa juga dokumen fisik dan pembanding bila tersedia.

## 15. Keluaran

### 15.1 Laporan PDF ringkas (±4–6 halaman, A4, selalu mode terang)
1. Sampul & peringatan posisi screening; ID laporan; waktu pemeriksaan; versi aplikasi & versi aturan.
2. Ringkasan eksekutif: identitas dokumen, kategori kesimpulan, hitungan temuan per tingkat, 3 temuan terpenting, 1 kalimat rekomendasi utama.
3. Objek pemeriksaan & integritas: identitas berkas + SHA-256 tersangka & pembanding; catatan bahwa rantai penguasaan yang dijamin aplikasi dimulai sejak berkas dimuat pada sesi pemeriksaan.
4. Profil umur: visual timeline + Laporan Umur 3 Lapis (Bagian 10.4).
5. Temuan utama (rincian lengkap temuan ada pada JSON & layar hasil).
6. Hasil pembanding (bila ada).
7. Kesimpulan + rekomendasi rujukan + petunjuk menjaga bukti.
8. Metodologi ringkas & batasan; footer tiap halaman: ID laporan, nomor halaman, "SalmanForensik — created by Ricco Abu Salman".
- **Tanpa** kode QR verifikasi (lihat Bagian 2).

### 15.2 JSON teknis terpisah
- Nama berkas berbagi ID laporan dengan PDF: `SalmanForensik-Laporan-<ID>.pdf` dan `SalmanForensik-Teknis-<ID>.json`.
- Struktur tingkat atas: `schemaVersion`, `report` (id, waktu, versi aplikasi/aturan), `examinerContext` (isian formulir), `files[]`, `timestamps[]`, `modules{}`, `embeddedObjects[]`, `fonts[]`, `findings[]`, `comparison{}`, `conclusion{}`, `referral{}`, `limitations[]`, `sensitivityNotice`.
- **Pagar isi:** tidak ada dump teks lengkap dokumen dan tidak ada isi biner dokumen; potongan teks hanya sebatas sekitar temuan yang memerlukannya. JSON diberi label sensitif di dalam berkasnya.
- Keduanya dibangkitkan lokal dan diunduh atas tindakan pengguna; aplikasi tidak menyimpan salinannya.

## 16. Desain Antarmuka (Gaya macOS)

### 16.1 Tema
- Switch 3 pilihan: **Terang / Gelap / Otomatis**; default Otomatis (`prefers-color-scheme`), berubah seketika mengikuti perangkat; pilihan manual disimpan (hanya preferensi tema — Bagian 6 butir 3).
- Pratinjau dokumen selalu tampil sebagai "kertas putih" pada kedua tema.
- Laporan PDF selalu mode terang.

### 16.2 Token warna (sistem Apple)
| Peran | Terang | Gelap |
|---|---|---|
| Latar | `#F5F5F7` | `#1C1C1E` |
| Kartu/permukaan | `#FFFFFF` | `#2C2C2E` |
| Teks utama | `#1D1D1F` | `#F5F5F7` |
| Teks sekunder | `#6E6E73` | `#98989F` |
| Aksen utama / info | `#007AFF` | `#0A84FF` |
| Konsisten (hijau) | `#34C759` | `#30D158` |
| Mencurigakan (oranye) | `#FF9500` | `#FF9F0A` |
| Kritis (merah) | `#FF3B30` | `#FF453A` |

### 16.3 Karakter UI
- Sidebar/header **frosted glass** (translusen + backdrop blur); sudut membulat 12–16 px; garis pemisah hairline; bayangan sangat halus.
- Kontrol tab hasil: segmented control ala macOS.
- Tipografi: system font stack (`-apple-system`, dst. → SF Pro di perangkat Apple; fallback Inter di platform lain). Hash & timestamp selalu **monospace**.
- Logo: siluet dokumen + kaca pembesar berisi simpul timeline; sekeluarga visual dengan SalmanPDF.
- Aksesibilitas: kontras memenuhi WCAG AA untuk teks utama; status tidak hanya dibedakan oleh warna (ikon + label teks).
- Responsif: tata letak bertumpuk di layar kecil dengan tab; anjuran browser desktop untuk pemeriksaan dalam ditampilkan jujur pada perangkat bergerak.
- Bahasa antarmuka: Bahasa Indonesia.

## 17. Penanganan Galat & Kasus Tepi

| Kasus | Perilaku |
|---|---|
| Berkas terenkripsi (PDF/OOXML) | Minta kata sandi berkas (hanya dipakai dalam sesi, tidak disimpan), atau lanjut parsial dengan modul yang mungkin; label "Pemeriksaan Parsial" |
| Berkas rusak / parser gagal sebagian | Modul gagal ditandai; modul lain tetap berjalan; hasil akhir berlabel parsial; kategori kesimpulan dibatasi (Bagian 13.3) |
| Format di luar dukungan | Pesan jelas + daftar format yang didukung; tidak ada pemrosesan lanjutan |
| Ekstensi ≠ isi berkas | Peringatan sejak Layar Persiapan; pemrosesan mengikuti isi sebenarnya |
| Berkas sangat besar | Peringatan pra-proses (Bagian 18) dengan pilihan lanjut/batal |
| Dua berkas bernama sama | Dibedakan oleh peran (Tersangka/Pembanding) + hash; nama tampil dengan label perannya |
| Tab ditutup / browser crash | Sesi hilang sesuai desain privasi; tidak ada pemulihan — perilaku ini didokumentasikan ke pengguna sejak awal |
| Pembanding berformat berbeda dari tersangka | Perbandingan dibatasi pada metadata/hash/teks yang dapat diekstrak; keterbatasan dicatat pada hasil & laporan |


## 18. Kinerja & Batasan Teknis

- Pemrosesan berat wajib di Web Worker; antarmuka tidak boleh membeku > 100 ms selama analisis.
- Ambang ukuran awal: peringatan di atas **50 MB**; batas keras awal **200 MB** per berkas (dapat ditinjau setelah pengujian kinerja Milestone 4). Di atas batas keras: penolakan halus dengan penjelasan.
- Kemajuan tahapan bersifat berbobot modul; tidak ada estimasi waktu selesai yang dijanjikan.
- Pembatalan harus menghentikan worker dan membersihkan state parsial modul yang belum selesai.
- Target peramban: Chrome, Edge, Firefox, Safari versi modern (2 rilis besar terakhir). Fitur yang tidak tersedia pada suatu peramban harus terdegradasi secara eksplisit, bukan gagal diam-diam.

## 19. Pengujian & Kriteria Penerimaan

### 19.1 Korpus uji sintetis (dibangun sebelum parser dianggap selesai)
Untuk tiap format, dibuat pasangan berkas dengan *ground truth* yang diketahui:
1. Dokumen asli bersih (dibuat normal dari aplikasi sumbernya).
2. Metadata tanggal diubah (alat pengubah metadata) — wajib terdeteksi oleh aturan U yang relevan.
3. Isi disunting lalu disimpan ulang (ganti nama/angka/tanggal) — wajib memunculkan temuan konten/struktur yang sesuai.
4. Objek tanda tangan ditempel dari dokumen lain — wajib tertangkap uji identitas objek (PB-06) pada mode pembanding.
5. PDF dengan incremental update berlapis & redaksi tidak sempurna — wajib tertangkap PF-02/PF-05.
6. XLSX dengan nilai sel ditimpa tanpa hitung ulang — wajib tertangkap XL-02.
7. Berkas asli ter-strip metadata — wajib menghasilkan penurunan cakupan & kemungkinan kategori "Bukti tidak cukup", BUKAN kesimpulan bersih.
8. Berkas terenkripsi & berkas rusak — wajib menghasilkan perilaku Bagian 17.
9. Foto dokumen hasil print (dari dokumen yang diketahui riwayatnya) — wajib memeriksa umur file foto & indikasi visual tanpa klaim umur fisik.

### 19.2 Uji wajib lainnya
- **Uji nol-unggah:** dengan pemantauan jaringan (DevTools/throttling offline setelah muat awal), pemrosesan penuh tidak menghasilkan satu pun permintaan jaringan berisi data dokumen.
- **Uji penghapusan sesi:** setelah Hapus Sesi / tutup tab, tidak ada sisa data dokumen pada storage peramban (LocalStorage/IndexedDB/cookie/cache) selain preferensi tema.
- Uji lintas peramban target; uji tema terang/gelap/otomatis; uji cetak laporan A4.
- Uji parser atas fixture: nilai hash contoh, daftar TimestampEvidence, dan Finding yang diharapkan dibandingkan otomatis (snapshot terverifikasi manual pertama kali).

### 19.3 Kriteria penerimaan MVP
- Seluruh korpus 19.1 memberi hasil sesuai harapan terdokumentasi.
- Uji nol-unggah & penghapusan sesi lulus.
- Laporan PDF + JSON contoh lolos telaah manual: posisi screening jelas, tidak ada klaim asli/palsu, ID & hash konsisten antar kedua berkas.

## 20. Tahapan Pembangunan (Milestone)

| Milestone | Isi | Kriteria keluar |
|---|---|---|
| M1 — Fondasi & Spike | Kerangka web statis, tema macOS terang/gelap/otomatis, layar awal–persiapan–proses–hasil (kerangka), model data inti; spike pustaka PDF/OOXML/gambar | Arsitektur terbukti sanggup mengekstrak metadata + struktur dasar dari 4 format contoh di browser |
| M2 — Modul Umur | Ekstraksi TimestampEvidence semua format, timeline engine, aturan U-01…U-10, Laporan Umur 3 Lapis di layar hasil | Korpus uji umur (19.1 butir 2, 7) lulus |
| M3 — Pemeriksaan Dalam per Format | Aturan PF/DC/XL/IM, objek sisipan & tanda tangan digital, jalur foto dokumen | Korpus 19.1 butir 3, 5, 6, 9 lulus |
| M4 — Pembanding & Rujukan | PB-01…PB-07, mesin kesimpulan, mesin rujukan | Korpus 19.1 butir 4 lulus; matriks rujukan telaah manual |
| M5 — Laporan & Rilis | PDF ringkas + JSON teknis, uji nol-unggah & penghapusan, uji lintas peramban, publikasi GitHub Pages + README (cara pakai, posisi screening, privasi) | Kriteria penerimaan 19.3 terpenuhi |

Urutan ini adalah urutan *pembangunan internal*; cakupan rilis MVP tetap seluruh keputusan Bagian 3.

## 21. Backlog Riset (Di Luar MVP — Jangan Diklaim Sebelum Terbukti)

1. **Umur fisik kertas & tinta dari foto** — indeks kekuningan terkalibrasi kartu warna, foxing, pemudaran tinta, protokol foto terstandar (RAW/DNG, referensi warna & skala, cahaya menyamping/dari belakang, makro persilangan). Validasi wajib memakai sampel yang umurnya diketahui pasti. Catatan ilmiah: umur fisik yang sahih memerlukan dokumen fisik + uji laboratorium kimia; modul ini selamanya bersifat indikasi kualitatif kondisi, bukan penanggalan.
2. **Dekode Machine Identification Code (yellow dots)** printer laser warna → seri printer + waktu cetak; keberhasilan bergantung merek/model & kualitas foto/scan. Label: eksperimental.
3. **Klasifikasi teknologi cetak** dari pola halftone (analisis FFT): laser vs inkjet vs fotokopi, dan atribusi printer dari cacat khas.
4. Format tambahan: PPTX, ODT/ODS, TIFF, HEIC, berkas arsip berisi dokumen.
5. Opsi backend ephemeral terenkripsi ber-TTL untuk analisis berat — hanya bila kebutuhan nyata muncul; bertentangan dengan prinsip "GitHub saja" sehingga memerlukan keputusan produk baru.

## 22. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Pengguna salah membaca hasil sebagai vonis asli/palsu | Peringatan posisi di landing, layar hasil, dan halaman 1 laporan; kosakata kesimpulan terkunci (Bagian 13.2) |
| Metadata mudah dipalsukan → hasil terlalu percaya diri | Triangulasi multi-sumber + tingkat keandalan eksplisit; tidak ada skor tunggal keaslian |
| Kemampuan parser browser lebih terbatas dari alat desktop | Parser struktur kustom untuk PDF; degradasi eksplisit per modul; label parsial jujur |
| Perangkat pengguna lemah / berkas besar | Worker, ambang ukuran, pembatalan, anjuran desktop |
| Temuan visual gambar (ELA dll) disalahartikan sebagai bukti | Label kepercayaan rendah wajib; tidak boleh berdiri sendiri sebagai kritis |
| Isu hukum dari saran rujukan yang keliru | Rujukan bersifat informasi jalur umum; teks ditelaah sebelum rilis; tanpa alamat/kontak spesifik yang tidak terverifikasi |
| Nama/klaim pemasaran berlebihan | Tagline & README memakai kata "screening"; dilarang kata "detektor dokumen palsu" sebagai klaim penetapan |

## 23. Glosarium

- **Anakronisme** — bukti bahwa suatu elemen dokumen berasal dari masa setelah tanggal yang diklaim dokumen.
- **Bukti waktu (TimestampEvidence)** — satu nilai waktu beserta sumber dan keandalannya (Bagian 9).
- **Incremental update** — cara PDF menambahkan revisi di akhir berkas tanpa menulis ulang keseluruhan; revisi lama dapat tetap tersimpan.
- **Magic bytes** — tanda tangan biner di awal berkas yang menunjukkan tipe berkas sebenarnya.
- **Screening awal** — pemeriksaan pendahuluan berbasis aturan untuk menentukan perlu/tidaknya pemeriksaan lanjutan oleh pihak berwenang.
- **Terminus post quem** — batas "tidak mungkin sebelum tanggal X" berdasarkan bukti tertua yang dapat dibuktikan.
- **TSA (Time Stamp Authority)** — pihak ketiga tepercaya yang membubuhkan waktu pada tanda tangan digital.

---

## Lampiran A — Contoh Ringkas JSON Teknis (potongan)

```json
{
  "schemaVersion": "1.0",
  "report": { "id": "SF-2026-XXXX", "generatedAt": "2026-11-13T03:55:00Z",
              "appVersion": "1.0.0", "rulesVersion": "1.0" },
  "files": [{ "role": "suspect", "fileName": "dokumen.pdf", "detectedType": "pdf",
              "sizeBytes": 182344, "sha256": "…", "pageOrSheetCount": 2, "encrypted": false }],
  "timestamps": [ { "source": "pdf.info.creationDate", "rawValue": "D:20250314091244+07'00'",
                    "normalizedUtc": "2025-03-14T02:12:44Z", "reliability": "C" } ],
  "conclusion": { "category": "indikasi-kuat", "reasons": ["SF-001"], "coverageIndex": 0.92 },
  "sensitivityNotice": "Berkas ini berisi metadata dan temuan pemeriksaan dokumen. Perlakukan sebagai data sensitif."
}
```

## Lampiran B — Prinsip Telaah Ulang Spesifikasi

Spesifikasi ini versi 1.0. Setiap perubahan keputusan terkunci (Bagian 3) wajib menaikkan nomor versi dokumen ini dan dicatat alasannya, agar pembangunan tidak pernah berjalan di atas keputusan yang sudah diganti secara diam-diam.

*— Akhir Spesifikasi SalmanForensik v1.0 —*

---

## Addendum 2026-11-17 — Kemampuan Pasca-v1.0 (sudah terbit)

Dua batasan awal v1.0 kini teratasi; addendum ini yang berlaku:

1. **Validasi kriptografis tanda tangan PDF** (`assets/sig.js`, aturan SG-01 s.d.
   SG-06): uji integritas ByteRange terhadap messageDigest, verifikasi tanda
   tangan RSA/ECDSA via WebCrypto, identitas penanda tangan & penerbit
   sertifikat, masa berlaku sertifikat, waktu stempel TSA, dan jangkauan berkas.
   Yang tetap TIDAK ditetapkan aplikasi: kepercayaan rantai sertifikat ke root
   eksternal (otoritas) — rantai ditampilkan apa adanya. Kalibrasi SG-06:
   konten sesudah penandatanganan berstatus info bila integritas bagian yang
   ditandatangani terbukti utuh.
2. **OCR dokumen pindaian** (`assets/ocr.js`, aturan OC-01): Tesseract.js v5
   (ind+eng) dimuat lazy dari CDN jsDelivr hanya saat dokumen tanpa lapisan
   teks terdeteksi; pengenalan berjalan lokal (WASM), dokumen tidak dikirim ke
   server. Batas screening: maks 5 halaman, penalti cakupan 5%. Tanpa koneksi
   internet, OCR tidak dapat dimuat (dicatat sebagai catatan modul).
3. Vonis keaslian tetap BUKAN keluaran aplikasi — posisi produk Bagian 2 tidak
   berubah.
