/* SalmanForensik — core.js
 * Logika murni (tanpa DOM): deteksi tipe, parsing tanggal, aturan umur,
 * kesimpulan, dan rujukan. Dipakai browser (window.SFCore) dan tes Node.
 * Sesuai docs/SPESIFIKASI.md v1.0. */
(function (global) {
  "use strict";

  /* ---------- Deteksi tipe dari magic bytes ---------- */
  function detectType(u8) {
    if (!u8 || u8.length < 4) return "unknown";
    if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return "pdf"; // %PDF
    if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "jpeg";
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "png";
    if (u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07)) return "zip";
    return "unknown";
  }

  function extOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  const EXT_TYPE = { pdf: "pdf", docx: "ooxml-word", xlsx: "ooxml-excel", jpg: "jpeg", jpeg: "jpeg", png: "png" };

  /* ---------- Parsing tanggal ---------- */
  // PDF: D:YYYYMMDDHHmmSS+07'00' / D:YYYYMMDD / variasi Z
  function parsePdfDate(s) {
    if (!s) return null;
    const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*(Z|[+-]\d{2}'?\d{0,2}'?)?/.exec(String(s).trim());
    if (!m) return null;
    const [, y, mo = "01", d = "01", hh = "00", mi = "00", ss = "00", tz] = m;
    let iso = `${y}-${mo}-${d}T${hh}:${mi}:${ss}`;
    if (tz && tz !== "Z") {
      const sign = tz[0];
      const digits = tz.slice(1).replace(/'/g, "");
      const th = digits.slice(0, 2), tm = digits.slice(2, 4) || "00";
      iso += `${sign}${th}:${tm}`;
    } else if (tz === "Z") iso += "Z";
    const dt = new Date(iso);
    return isNaN(dt) ? null : dt;
  }

  // EXIF: "2025:03:14 09:12:44" | ISO umum | Date objek
  function parseAnyDate(v) {
    if (v == null) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    if (!s) return null;
    if (/^D:/.test(s)) return parsePdfDate(s);
    const exif = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
    if (exif) {
      const dt = new Date(`${exif[1]}-${exif[2]}-${exif[3]}T${exif[4]}:${exif[5]}:${exif[6]}`);
      return isNaN(dt) ? null : dt;
    }
    // Sebagian generator (mis. openpyxl) menulis ISO cacat: offset + "Z" sekaligus
    const cleaned = s.replace(/([+-]\d{2}:?\d{2})Z$/, "$1");
    const dt = new Date(cleaned);
    return isNaN(dt) ? null : dt;
  }

  function fmtWIB(d) {
    if (!d || isNaN(d)) return "—";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      }).format(d) + " WIB";
    } catch (e) { return d.toISOString(); }
  }

  /* ---------- Basis pengetahuan anakronisme teknologi ----------
   * Hanya entri yang tahun rilisnya mapan & dapat diverifikasi umum.
   * Dipakai konservatif: flag hanya bila tanggal KLAIM < tahun rilis. */
  const TECH_RELEASE = [
    { pattern: /Microsoft®?\s*Word\s*2021|Microsoft Word 2021/i, label: "Microsoft Word 2021", year: 2021 },
    { pattern: /Microsoft®?\s*Word\s*2019|Microsoft Word 2019/i, label: "Microsoft Word 2019", year: 2018 },
    { pattern: /Microsoft®?\s*Word\s*2016|Microsoft Word 2016/i, label: "Microsoft Word 2016", year: 2015 },
    { pattern: /Word for Microsoft 365|Microsoft 365/i, label: "Microsoft 365 (penamaan)", year: 2020 },
    { pattern: /Acrobat PDFMaker\s*24/i, label: "Acrobat PDFMaker 24", year: 2024 },
    { pattern: /Acrobat PDFMaker\s*23/i, label: "Acrobat PDFMaker 23", year: 2023 },
    { pattern: /Acrobat PDFMaker\s*22/i, label: "Acrobat PDFMaker 22", year: 2022 },
    { pattern: /Acrobat PDFMaker\s*21/i, label: "Acrobat PDFMaker 21", year: 2021 },
    { pattern: /Acrobat PDFMaker\s*20/i, label: "Acrobat PDFMaker 20", year: 2020 },
    { pattern: /Acrobat PDFMaker\s*19/i, label: "Acrobat PDFMaker 19", year: 2018 },
    { pattern: /Acrobat PDFMaker\s*17/i, label: "Acrobat PDFMaker 17", year: 2017 },
    { pattern: /Adobe PDF Library\s*21/i, label: "Adobe PDF Library 21", year: 2021 },
    { pattern: /Adobe PDF Library\s*19/i, label: "Adobe PDF Library 19", year: 2018 },
    { pattern: /LibreOffice\s*24\./i, label: "LibreOffice 24.x", year: 2024 },
    { pattern: /LibreOffice\s*7\./i, label: "LibreOffice 7.x", year: 2020 },
    { pattern: /LibreOffice\s*6\./i, label: "LibreOffice 6.x", year: 2018 },
    { pattern: /Calibri/i, label: "Font Calibri", year: 2007 },
    { pattern: /Cambria/i, label: "Font Cambria", year: 2007 }
  ];

  function techAnachronisms(texts) {
    const hits = [];
    const joined = (texts || []).filter(Boolean).join(" | ");
    for (const t of TECH_RELEASE) {
      if (t.pattern.test(joined)) hits.push({ label: t.label, year: t.year });
    }
    return hits;
  }

  /* ---------- Aturan umur (U-01..U-10, subset yang dapat dievaluasi dari model) ----------
   * evidence: [{role:'creation'|'modification'|'other', date:Date, source, reliability}]
   * ctx: {examDate, claimDate (Date|null), techHits:[{label,year}], embeddedYounger:bool} */
  function evaluateAgeRules(evidence, ctx) {
    const findings = [];
    const ev = (evidence || []).filter(e => e && e.date instanceof Date && !isNaN(e.date));
    const creations = ev.filter(e => e.role === "creation").map(e => e.date);
    const mods = ev.filter(e => e.role === "modification").map(e => e.date);
    const push = (ruleId, severity, title, observed, explanation, confidence) =>
      findings.push({ ruleId, severity, category: "umur", title, location: "Timeline umur dokumen",
        observed, explanation, method: "Aturan timeline SalmanForensik " + ruleId, confidence: confidence || "medium" });

    if (creations.length && mods.length) {
      const minCreate = new Date(Math.min(...creations));
      const maxMod = new Date(Math.max(...mods));
      if (maxMod < minCreate) {
        push("U-01", "critical", "Tanggal modifikasi lebih dulu daripada tanggal pembuatan",
          `Modifikasi terakhir tercatat ${fmtWIB(maxMod)}, mendahului pembuatan ${fmtWIB(minCreate)}.`,
          "Pada dokumen wajar, modifikasi tidak mungkin mendahului pembuatan. Pola ini lazim muncul bila metadata tanggal diubah manual.");
      }
    }
    if (creations.length >= 2) {
      const spread = Math.max(...creations) - Math.min(...creations);
      if (spread > 24 * 3600 * 1000) {
        push("U-02", "suspicious", "Sumber-sumber tanggal pembuatan saling tidak sepakat",
          `Selisih antar sumber tanggal pembuatan mencapai ${(spread / 86400000).toFixed(1)} hari.`,
          "Beberapa bagian file menyimpan tanggal pembuatan yang berbeda jauh — dapat terjadi pada dokumen rakitan atau penyuntingan metadata sebagian.");
      }
    }
    const future = ev.filter(e => e.date - ctx.examDate > 24 * 3600 * 1000);
    if (future.length) {
      push("U-07", "suspicious", "Ditemukan tanggal di masa depan",
        `${future.length} bukti waktu melampaui waktu pemeriksaan (terbaru ${fmtWIB(new Date(Math.max(...future.map(e => e.date))))}).`,
        "Tanggal internal melampaui hari pemeriksaan — jam perangkat pembuat tidak akurat atau tanggal ditulis manual.");
    }
    if (ev.length >= 3) {
      const seconds = new Set(ev.map(e => Math.floor(e.date.getTime() / 1000)));
      if (seconds.size === 1) {
        push("U-06", "suspicious", "Seluruh timestamp identik sampai detik (pola penyalinan)",
          `${ev.length} bukti waktu dari sumber berbeda bernilai persis sama.`,
          "Sumber-sumber independen jarang berbagi detik yang sama persis; pola ini khas berkas hasil salinan/ekspor massal atau penulisan metadata serentak.");
      }
    }
    if (ctx.claimDate && ctx.techHits && ctx.techHits.length) {
      for (const t of ctx.techHits) {
        if (ctx.claimDate.getFullYear() < t.year) {
          push("U-05", "critical", `Anakronisme teknologi: ${t.label}`,
            `Dokumen diklaim berasal dari ${ctx.claimDate.getFullYear()}, tetapi memakai ${t.label} yang baru ada ${t.year}.`,
            "Dokumen tidak mungkin dibuat sebelum teknologi yang dipakainya tersedia (terminus post quem).", "high");
        }
      }
    }
    if (ctx.claimDate && ev.length) {
      const earliest = new Date(Math.min(...ev.map(e => e.date)));
      if (ctx.claimDate < earliest && (earliest - ctx.claimDate) > 366 * 86400000 * 5) {
        push("U-03", "suspicious", "Tanggal klaim jauh lebih tua dari seluruh jejak internal",
          `Klaim ${fmtWIB(ctx.claimDate)}; bukti internal paling awal ${fmtWIB(earliest)}.`,
          "Selisih sangat besar antara tanggal yang diklaim dan jejak waktu tertua di dalam file. Ini bukan bukti tunggal — jam perangkat dan migrasi format dapat berpengaruh — tetapi wajib diverifikasi ke penerbit.");
      }
    }
    if (ctx.embeddedYounger) {
      push("U-04", "suspicious", "Objek sisipan lebih muda daripada dokumen induknya",
        "Setidaknya satu objek tertanam (gambar/media) memiliki bukti waktu lebih baru dari tanggal pembuatan dokumen.",
        "Objek disisipkan pada penyuntingan belakangan, atau dokumen dirakit dari bahan yang lebih baru daripada klaimnya.");
    }
    return findings;
  }

  /* ---------- Kesimpulan screening (Bagian 13) ---------- */
  const CATEGORIES = {
    none: "Tidak ditemukan indikasi signifikan",
    weak: "Indikasi lemah",
    strong: "Indikasi kuat adanya manipulasi",
    insufficient: "Bukti tidak cukup"
  };

  function conclude(findings, coverage, ageOk) {
    if (!ageOk || coverage < 0.35) return { key: "insufficient", label: CATEGORIES.insufficient };
    const crit = findings.filter(f => f.severity === "critical");
    const susp = findings.filter(f => f.severity === "suspicious");
    if (crit.length >= 1 || susp.length >= 4) return { key: "strong", label: CATEGORIES.strong };
    if (susp.length >= 1 || crit.length > 0) return { key: "weak", label: CATEGORIES.weak };
    if (coverage < 0.6) return { key: "insufficient", label: CATEGORIES.insufficient };
    return { key: "none", label: CATEGORIES.none };
  }

  /* ---------- Rujukan (Bagian 14) ---------- */
  const ISSUER_MAP = {
    ijazah: "Sekolah/kampus penerbit; untuk perguruan tinggi juga verifikasi data SIVIL/PDDikti",
    sertifikat: "Penerbit sertifikat yang tertera pada dokumen",
    surat: "Instansi/perusahaan penerbit (bagian SDM/legal)",
    keuangan: "Bank/lembaga keuangan penerbit",
    tanah: "Kantor Pertanahan (BPN) setempat",
    kependudukan: "Dinas Kependudukan dan Pencatatan Sipil (Dukcapil)",
    akta: "Kantor notaris yang bersangkutan",
    pengadilan: "Pengadilan penerbit dokumen",
    lainnya: "Penerbit dokumen sebagaimana tertera pada dokumen"
  };

  function referralFor(conclusionKey, docType, purpose) {
    const out = [];
    const issuer = ISSUER_MAP[docType] || ISSUER_MAP.lainnya;
    if (conclusionKey === "insufficient") {
      out.push("Lengkapi bahan terlebih dahulu: minta berkas digital asli dari penerbit, dokumen pembanding, dan/atau dokumen fisik asli — lalu lakukan pemeriksaan ulang atau rujuk dengan bahan lengkap.");
    } else {
      out.push(`Verifikasi ke penerbit dokumen: ${issuer}. Bawa ringkasan laporan ini (nomor dokumen, tanggal tertera, penandatangan, dan hash SHA-256 berkas).`);
    }
    if (conclusionKey === "strong") {
      out.push("Bila ada dugaan penggunaan dokumen untuk penipuan/tindak pidana, buat laporan ke kepolisian (SPKT Polres/Polda setempat). Pemeriksaan laboratorium forensik formal (mis. Puslabfor Polri) pada umumnya berjalan atas permintaan penyidik/instansi, sehingga jalur publiknya melalui laporan kepolisian.");
      out.push("Untuk sengketa perdata atau kebutuhan pendapat ahli, pertimbangkan ahli forensik digital / laboratorium forensik universitas dengan pendampingan advokat.");
    } else if (conclusionKey === "weak") {
      out.push("Bila verifikasi penerbit tidak menyelesaikan keraguan, pertimbangkan konsultasi ahli forensik digital dengan membawa laporan PDF + JSON teknis hasil screening ini.");
    } else if (conclusionKey === "none") {
      out.push("Arsipkan laporan ini. Untuk dokumen bernilai penting, verifikasi berkala ke penerbit tetap merupakan langkah paling otoritatif.");
    }
    if (purpose === "sengketa" && conclusionKey !== "insufficient") {
      out.push("Karena tujuan pemeriksaan terkait sengketa, simpan seluruh bahan secara utuh dan pertimbangkan pendampingan advokat sebelum menyerahkan dokumen ke pihak mana pun.");
    }
    out.push("Jaga bukti: jangan membuka lalu menyimpan-ulang berkas (mengubah metadata), jangan mengedit/mengganti nama secara massal, simpan salinan apa adanya beserta hash-nya, dan bawa berkas dari perangkat asal bila ada.");
    return out;
  }

  function makeReportId(now) {
    const y = now.getFullYear();
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `SF-${y}-${rnd}`;
  }

  const api = { detectType, extOf, EXT_TYPE, parsePdfDate, parseAnyDate, fmtWIB,
    TECH_RELEASE, techAnachronisms, evaluateAgeRules, CATEGORIES, conclude,
    ISSUER_MAP, referralFor, makeReportId };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SFCore = api;
})(typeof window !== "undefined" ? window : globalThis);
