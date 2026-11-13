# SalmanForensik

**Screening Forensik Dokumen Digital** — telusuri umur, riwayat perubahan, dan indikasi manipulasi dokumen, langsung di browser Anda, tanpa unggah ke server.

🔗 **Buka aplikasi:** https://riccohsaputra.github.io/salmanforensik/

## Apa ini?

SalmanForensik adalah alat **screening awal (pemeriksaan pendahuluan)** forensik dokumen digital berbasis web. Pilih sebuah dokumen, klik *Mulai Pemeriksaan*, dan terima:

1. **Profil umur dokumen secara detail** — kapan dibuat, kapan dan berapa kali dimodifikasi, direkonstruksi dari banyak sumber bukti waktu di dalam berkas (metadata, XMP, struktur internal, objek tertanam).
2. **Temuan indikasi manipulasi** — inkonsistensi metadata, anakronisme teknologi, jejak revisi, teks tersembunyi, rumus Excel yang nilainya ditimpa, dan lainnya, masing-masing dengan lokasi & penjelasan.
3. **Perbandingan opsional** terhadap dokumen pembanding asli (hash, garis keturunan, perbedaan teks, uji identitas objek tanda tangan/stempel).
4. **Kesimpulan screening berkategori** dan **rekomendasi rujukan** (penerbit dokumen, BPN, Dukcapil, jalur kepolisian/ahli forensik) beserta petunjuk menjaga bukti.
5. **Laporan PDF ringkas + berkas JSON teknis** yang dibangkitkan lokal di perangkat Anda.

## Privasi — dokumen tidak pernah meninggalkan perangkat

- 100% pemrosesan *client-side* di browser; **tidak ada unggahan ke server mana pun**.
- Data sesi hanya hidup di memori tab: tutup tab atau tekan **Hapus Sesi** dan semuanya bersih. Tanpa timer, tanpa penyimpanan dokumen di browser.
- Satu-satunya yang disimpan browser adalah preferensi tema (terang/gelap/otomatis).

## Format yang didukung

PDF · DOCX · XLSX · JPG · PNG — termasuk foto dokumen hasil print sebagai berkas gambar (yang diperiksa: umur berkas gambar & indikasi visual; umur fisik kertas/tinta memerlukan pemeriksaan dokumen fisik di laboratorium).

## Batasan penting

SalmanForensik **bukan** penetapan keaslian: tidak ada kesimpulan "asli/palsu". Tidak adanya temuan bukan bukti keaslian. Hasil screening adalah bahan awal untuk verifikasi ke penerbit dokumen atau pemeriksaan forensik formal. Rincian lengkap ada di [docs/SPESIFIKASI.md](docs/SPESIFIKASI.md).

## Pengembangan

Statis tanpa build step — jalankan lokal dengan server statis apa pun:

```bash
python3 -m http.server 8000   # lalu buka http://localhost:8000
node tests/run-tests.mjs      # tes logika inti (22 pemeriksaan)
node tests/engine-tests.mjs   # tes parser atas korpus sintetis (perlu jsdom di tests/)
```

Semua pustaka pihak ketiga di-vendor di `vendor/` (JSZip, exifr, pdf.js) — aplikasi tidak memanggil CDN saat runtime.

---

SalmanForensik — created by Ricco Abu Salman
