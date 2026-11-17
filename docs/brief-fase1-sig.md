# Brief Fase 1 — Validasi Kriptografis Tanda Tangan PDF (untuk agen pelaksana)

Baca dulu `AGENTS.md` di root proyek dan patuhi invarian di sana (client-side only,
tanpa jaringan, UI Bahasa Indonesia, kata kesimpulan terkunci, perubahan bedah,
tes Node harus tetap hijau). Jangan mengubah theme.css / tata letak index.html
selain menambah tag script.

## Tujuan
SalmanForensik saat ini hanya mendeteksi keberadaan tanda tangan (aturan PF-06 di
`assets/engine.js` ± baris 86–94). Tambahkan validasi kriptografis sungguhan,
100% di browser, tanpa dependensi baru (parser ASN.1/DER ditulis tangan, hash &
verifikasi memakai WebCrypto `crypto.subtle`).

## Berkas baru: `assets/sig.js`
IIFE seperti engine.js, expose `global.SFSig = { analyzeSignatures }`.
`async function analyzeSignatures(buf)` menerima ArrayBuffer PDF utuh dan
mengembalikan `{ signatures: [...], findings: [...] }`.

### Langkah
1. Cari SEMUA kemunculan `/ByteRange [a b c d]` pada representasi latin1 berkas.
   Untuk tiap kemunculan ambil juga dari jendela teks di sekitarnya:
   `/Contents <hex…>` (blob CMS), `/SubFilter /…`, `/M (D:…)` bila ada.
2. Parser DER minimal (tag, length bentuk pendek & panjang, value; constructed
   flag) yang cukup untuk menelusuri struktur CMS:
   ContentInfo → SEQUENCE { OID signedData 1.2.840.113549.1.7.2, [0] SignedData }.
   SignedData: version, digestAlgorithms SET, encapContentInfo, certificates [0]
   (SET sertifikat X.509), signerInfos SET.
3. Tiap sertifikat: parse TBSCertificate → serialNumber (hex), issuer & subject
   (RDN: kumpulkan CN/O/OU/C sebagai string terbaca), validity notBefore/notAfter
   (UTCTime & GeneralizedTime), subjectPublicKeyInfo (simpan DER mentahnya +
   OID algoritma), signatureAlgorithm OID.
4. Tiap signerInfo: digestAlgorithm OID (petakan 2.16.840.1.101.3.4.2.1=SHA-256,
   .2.2=SHA-384, .2.3=SHA-512, 1.3.14.3.2.26=SHA-1, 2.16.840.1.101.3.4.2.4=SHA-224),
   signedAttrs [0]: ambil OID contentType, signingTime (1.2.840.113549.1.9.5),
   messageDigest (1.2.840.113549.1.9.4, OCTET STRING), signatureAlgorithm
   (1.2.840.113549.1.1.1=RSA, .11=SHA256withRSA dst., 1.2.840.10040.4.1 / EC
   1.2.840.10045.2.1), signature OCTET STRING, sid (issuer+serial) untuk
   mencocokkan sertifikat penanda tangan. unsignedAttrs [1]: cari
   signatureTimeStampToken (1.2.840.113549.1.9.6) → parse ContentInfo bersarang →
   TSTInfo → genTime (GeneralizedTime).
5. **Uji integritas**: hash (sesuai digestAlgorithm) atas gabungan byte
   buf[a..a+b] + buf[c..c+d] dari ByteRange; bandingkan dengan messageDigest.
6. **Verifikasi tanda tangan**: data yang ditandatangani = byte DER signedAttrs
   dengan byte tag pertama diganti 0xA0 → 0x31 (SET OF). Verifikasi dengan
   `crypto.subtle.importKey("spki", spkiDer, …)` + `crypto.subtle.verify`:
   RSA → RSASSA-PKCS1-v1_5; ECDSA → ubah signature DER (SEQUENCE 2 INTEGER)
   menjadi r||s mentah ber-padding sesuai ukuran kurva (P-256=32, P-384=48).
   Kegagalan parse/verifikasi TIDAK boleh melempar keluar — tangkap, catat
   sebagai status `unknown`/`fail` seperlunya.
7. Rantai: susun issuer→subject antar sertifikat tertanam; catat nama penerbit
   teratas (self-signed atau issuer yang tidak ditemukan pasangannya).

### Objek hasil tiap tanda tangan
`{ subFilter, signerCN, signerOrg, issuer, serial, notBefore, notAfter,
   signingTime (Date|null, dari signedAttrs; fallback /M), tsaTime (Date|null),
   digestAlg, integrity: "ok"|"fail"|"unknown", sigValid: true|false|null,
   chainTop, coversWholeFile: bool (ByteRange menjangkau EOF) }`

### Temuan (fungsi finding lokal seentuk engine.js; kategori "tanda-tangan")
- SG-01 `critical` — integrity === "fail": judul "Dokumen berubah setelah
  ditandatangani — integritas tanda tangan gagal". Penjelasan: hash isi saat ini
  tidak cocok dengan messageDigest yang dikunci saat penandatanganan.
- SG-02 `critical` — sigValid === false: "Tanda tangan digital tidak valid
  secara kriptografis".
- SG-03 `info` — integrity "ok" DAN sigValid true: "Tanda tangan digital
  terverifikasi — integritas dokumen utuh". observed memuat: penanda tangan
  (CN, O), penerbit sertifikat, waktu tanda tangan, waktu TSA bila ada.
- SG-04 `suspicious` — digestAlg SHA-1: "Tanda tangan memakai algoritma hash
  lemah (SHA-1)".
- SG-05 `suspicious` — sertifikat penanda tangan sudah kedaluwarsa pada
  signingTime, atau belum berlaku: sebutkan tanggalnya.
- SG-06 `suspicious` — coversWholeFile false: "Tanda tangan tidak mencakup
  seluruh berkas — ada konten di luar jangkauan tanda tangan" (hanya bila
  ByteRange tidak mencapai akhir berkas DAN ada byte bermakna sesudahnya).
- Bila blob CMS tidak dapat diparse sama sekali: jangan buat temuan SG;
  kembalikan signatures: [] dan biarkan PF-06 lama yang berbicara.

## Integrasi
- `index.html`: tambah `<script src="assets/sig.js"></script>` SEBELUM engine.js.
- `assets/engine.js` di blok tanda tangan (± baris 86–94): bila /ByteRange ada,
  `try { const sig = await global.SFSig.analyzeSignatures(buf); if (sig) {
  out.signatures = sig.signatures; out.findings.push(...sig.findings); } }
  catch (e) { out.moduleNotes.push("Modul validasi tanda tangan gagal: " + e.message); }`
  Perbarui teks penjelasan PF-06: validasi kriptografis kini DILAKUKAN (integritas
  + tanda tangan + identitas); yang tetap tidak dilakukan: verifikasi kepercayaan
  rantai ke root eksternal.
- `assets/app.js`:
  - Tab "Objek & Bukti": bila `res.signatures` ada, tampilkan kartu per tanda
    tangan (penanda tangan, penerbit, status integritas, status verifikasi,
    waktu tanda tangan, waktu TSA, masa berlaku sertifikat, algoritma).
  - Laporan cetak (buildPrintArea): tambahkan blok tanda tangan digital di
    bagian 2 (Objek & integritas) atau sub-bagian sendiri di dalam bagian 2 —
    JANGAN mengubah penomoran bagian yang sudah ada.
  - Perbarui teks "Tidak diperiksa / batasan" (tab Metodologi & bagian 7
    laporan): hapus "validasi kriptografis penuh tanda tangan digital" dari
    daftar tidak-diperiksa; ganti dengan batas yang akurat: "kepercayaan rantai
    sertifikat ke root eksternal (otoritas) tidak ditetapkan aplikasi — status
    integritas & identitas ditampilkan apa adanya".
  - Ekspor JSON sudah menampung res utuh; pastikan `signatures` ikut (otomatis
    bila menempel di res).

## Batasan kerja
- Jangan mengubah aturan lain, kesimpulan, tema, atau teks di luar cakupan ini.
- `node --check` semua berkas yang diubah; `node tests/run-tests.mjs` dan
  `node tests/engine-tests.mjs` harus tetap hijau (23/23 dan 14/14).
- Catat ringkasan perubahan di akhir keluaranmu: berkas yang diubah + keputusan
  teknis apa pun yang kamu ambil di luar brief ini.
