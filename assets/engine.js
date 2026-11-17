/* SalmanForensik — engine.js
 * Parser per format (browser). Semua fungsi menerima ArrayBuffer dan
 * mengembalikan model parsial sesuai SPESIFIKASI Bagian 9–12.
 * Tidak ada panggilan jaringan di berkas ini. */
(function (global) {
  "use strict";
  const C = global.SFCore;

  async function sha256hex(buf) {
    const h = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function latin1(buf, start, len) {
    const u8 = new Uint8Array(buf, start || 0, len || buf.byteLength);
    let s = "";
    const CH = 32768;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return s;
  }
  function parseXml(text) { return new DOMParser().parseFromString(text, "text/xml"); }
  function xmlTag(root, name) {
    const el = root.getElementsByTagName(name)[0] || root.getElementsByTagName("dcterms:" + name)[0];
    return el ? el.textContent : null;
  }
  function ev(source, location, raw, date, role, reliability, note) {
    if (!date) return null;
    return { source, location, rawValue: raw == null ? "" : String(raw), date, role: role || "other",
      reliability: reliability || "C", timezonePresent: true, note: note || "" };
  }
  function finding(ruleId, severity, category, title, location, observed, explanation, confidence) {
    return { ruleId, severity, category, title, location, observed, explanation,
      method: "Pemeriksaan SalmanForensik " + ruleId, confidence: confidence || "medium" };
  }

  /* ================= PDF ================= */
  async function analyzePdf(buf, name) {
    const out = baseResult("pdf");
    const text = latin1(buf);
    const grab = (re) => { const m = re.exec(text); return m ? m[1] : null; };
    const info = {
      title: grab(/\/Title\s*\(([^)]*)\)/), author: grab(/\/Author\s*\(([^)]*)\)/),
      creator: grab(/\/Creator\s*\(([^)]*)\)/), producer: grab(/\/Producer\s*\(([^)]*)\)/),
      creationRaw: grab(/\/CreationDate\s*\(([^)]*)\)/), modRaw: grab(/\/ModDate\s*\(([^)]*)\)/)
    };
    out.meta.info = info;
    if (info.creationRaw) out.timestamps.push(ev("pdf.info.creationDate", "Info Dictionary", info.creationRaw, C.parsePdfDate(info.creationRaw), "creation", "C", "Ditetapkan aplikasi pembuat; mudah diubah alat metadata"));
    if (info.modRaw) out.timestamps.push(ev("pdf.info.modDate", "Info Dictionary", info.modRaw, C.parsePdfDate(info.modRaw), "modification", "C"));

    const xmpMatch = /<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/.exec(text);
    if (xmpMatch) {
      const x = xmpMatch[0];
      const xg = (re) => { const m = re.exec(x); return m ? m[1] : null; };
      const xc = xg(/xmp:CreateDate="([^"]+)"/) || xg(/<xmp:CreateDate>([^<]+)/);
      const xm = xg(/xmp:ModifyDate="([^"]+)"/) || xg(/<xmp:ModifyDate>([^<]+)/);
      const xmd = xg(/xmp:MetadataDate="([^"]+)"/) || xg(/<xmp:MetadataDate>([^<]+)/);
      const xdoc = xg(/xmpMM:DocumentID="([^"]+)"/);
      const xinst = xg(/xmpMM:InstanceID="([^"]+)"/);
      if (xc) out.timestamps.push(ev("pdf.xmp.createDate", "Metadata XMP", xc, C.parseAnyDate(xc), "creation", "B"));
      if (xm) out.timestamps.push(ev("pdf.xmp.modifyDate", "Metadata XMP", xm, C.parseAnyDate(xm), "modification", "B"));
      if (xmd) out.timestamps.push(ev("pdf.xmp.metadataDate", "Metadata XMP", xmd, C.parseAnyDate(xmd), "modification", "B"));
      out.meta.xmp = { documentId: xdoc, instanceId: xinst, producer: xg(/pdf:Producer="([^"]+)"/) };
      if (xdoc) out.lineageId = xdoc;
      if ((info.creationRaw && xc && Math.abs(C.parsePdfDate(info.creationRaw) - C.parseAnyDate(xc)) > 86400000))
        out.findings.push(finding("PF-01", "suspicious", "struktur", "Tanggal pembuatan Info Dictionary dan XMP berbeda jauh",
          "Metadata PDF", `Info: ${info.creationRaw} vs XMP: ${xc}`, "Dua sumber tanggal utama tidak sepakat; wajarnya keduanya ditulis oleh proses simpan yang sama.", "medium"));
    }
    const eofCount = (text.match(/%%EOF/g) || []).length;
    const prevCount = (text.match(/\/Prev\s+\d+/g) || []).length;
    out.meta.incrementalUpdates = Math.max(0, prevCount);
    if (prevCount >= 1) out.findings.push(finding("PF-02", "info", "struktur",
      `PDF menyimpan ${prevCount} lapisan incremental update`, "Struktur PDF (trailer)",
      `${eofCount} segmen %%EOF, ${prevCount} penunjuk /Prev`,
      "Berkas disunting dan disimpan ulang tanpa menulis total. Versi sebelumnya mungkin masih tertanam di dalam berkas — pola normal untuk PDF yang diedit, tetapi relevan terhadap riwayat dokumen."));
    const idm = /\/ID\s*\[\s*<([0-9A-Fa-f]+)>/.exec(text);
    if (idm) { out.meta.trailerId = idm[1]; if (!out.lineageId) out.lineageId = "pdfid:" + idm[1]; }
    const fonts = new Set();
    for (const m of text.matchAll(/\/BaseFont\s*\/([^\s\/\[\]<>()]+)/g)) fonts.add(m[1].replace(/^[A-Z]{6}\+/, ""));
    out.fonts = [...fonts];
    const pageCountRaw = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (/\/EmbeddedFile|\/Filespec/.test(text))
      out.findings.push(finding("PF-03", "info", "objek-sisipan", "PDF memuat berkas tertanam/lampiran internal", "Inventaris objek",
        "Ditemukan penanda /EmbeddedFile atau /Filespec", "Lampiran internal tidak selalu terlihat di penampil PDF biasa; periksa relevansinya terhadap isi dokumen."));
    if (/\/JavaScript|\/JS\s*[\(<]|\/OpenAction|\/AA\s*<</.test(text))
      out.findings.push(finding("PF-03", "suspicious", "objek-sisipan", "PDF memuat JavaScript/aksi otomatis", "Inventaris objek",
        "Ditemukan penanda JavaScript atau aksi otomatis", "Dokumen biasa (surat/sertifikat) umumnya tidak memerlukan skrip atau aksi otomatis saat dibuka."));
    const sigIdx = text.indexOf("/ByteRange");
    if (sigIdx >= 0) {
      out.meta.signature = { present: true };
      const mDate = /\/M\s*\((D:[^)]*)\)/.exec(text.slice(sigIdx, sigIdx + 4000));
      if (mDate) out.timestamps.push(ev("pdf.signature.signingTime", "Tanda tangan digital (/M)", mDate[1], C.parsePdfDate(mDate[1]), "other", "B", "Waktu pada kamus tanda tangan; kekuatan penuhnya bergantung rantai sertifikat & TSA"));
      out.findings.push(finding("PF-06", "info", "tanda-tangan", "PDF memiliki tanda tangan digital", "Struktur PDF",
        mDate ? `Waktu tanda tangan tercatat ${mDate[1]}` : "Penanda /ByteRange ditemukan",
        "Validasi rantai sertifikat & TSA secara kriptografis penuh tidak dilakukan di browser pada versi ini; tanda tangan dicatat sebagai bukti pendukung."));
    }
    out.meta.pageCountRaw = pageCountRaw;

    /* pdf.js: halaman, teks per font, teks penuh */
    try {
      const pdf = await global.pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      out.pageCount = pdf.numPages;
      const lines = new Map(); let fullText = ""; const tiny = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        for (const it of tc.items) {
          fullText += it.str + " ";
          const size = Math.abs(it.transform[3]) || Math.hypot(it.transform[1], it.transform[3]);
          const y = Math.round(it.transform[5]);
          const key = p + ":" + y;
          if (!lines.has(key)) lines.set(key, []);
          if (it.fontName) lines.get(key).push({ font: it.fontName, str: it.str, x: it.transform[4], w: it.width || (it.str.length * size * 0.5) });
          if (size > 0 && size < 3.5 && it.str.trim()) tiny.push({ page: p, str: it.str.slice(0, 40), size: size.toFixed(1) });
        }
      }
      out.text = fullText;
      /* PF-04 (direvisi 2026-11-17 setelah false positive pada dokumen resmi asli):
         fontName pdf.js adalah ID sumber font (beda ID = beda font, mis. reguler vs
         tebal pun beda ID), jadi yang dinilai adalah POLA pergantiannya dalam baris:
         - DIHITUNG: font kembali berganti setelah sempat berganti (A-B-A, sisipan di
           tengah kalimat), atau ekor baris berganti font setelah mayoritas baris
           memakai satu font (ekor diketik ulang / token disisipkan di akhir).
         - DIKECUALIKAN: segmen awal pendek diikuti font lain sampai akhir baris
           (pola label/judul formulir), baris formulir yang memuat label bertanda
           ':' (termasuk baris tabel yang tergabung pada tinggi sama), segmen
           1 karakter (artefak substitusi glyph tanda kutip dsb.), baris cap tanda
           tangan elektronik, dan beda font yang terpisah jauh horizontal. */
      const isStampLine = (txt) => /ditandatangani secara elektronik|tanda tangan elektronik|token\s*:/i.test(txt);
      let mixed = 0; let mixedExample = "";
      for (const [, items] of lines) {
        const lineText = items.map(i => i.str).join("");
        if (isStampLine(lineText)) continue;
        const sorted = [...items].sort((a, b) => a.x - b.x);
        /* rangkum segmen font berurutan; lompat bila pergantian font terpisah jauh */
        const segs = []; let columnSplit = false;
        for (const it of sorted) {
          const last = segs[segs.length - 1];
          if (last && last.font === it.font) { last.chars += it.str.length; last.end = it.x + it.w; last.txt += it.str; continue; }
          if (last && it.x - last.end > 30) { columnSplit = true; break; }
          segs.push({ font: it.font, chars: it.str.length, end: it.x + it.w, txt: it.str });
        }
        if (columnSplit || segs.length < 2) continue;
        /* gabung segmen 1 karakter (artefak substitusi glyph: tanda kutip dsb.) */
        const merged = [];
        for (const s of segs) {
          const last = merged[merged.length - 1];
          if (last && s.chars <= 1) { last.chars += s.chars; continue; }
          merged.push({ font: s.font, chars: s.chars, txt: s.txt || "" });
        }
        /* baris yang memuat label bertanda ':' adalah baris formulir (label:nilai,
           termasuk dua baris tabel yang tergabung pada tinggi yang sama) → wajar */
        if (merged.some(s => (s.txt || "").includes(":"))) continue;
        const total = merged.reduce((a, s) => a + s.chars, 0);
        if (total < 4) continue;
        let hit = false;
        if (merged.length >= 3) hit = true;                     // A-B-A(-…) : font berganti lebih dari sekali
        else if (merged.length === 2 && merged[0].chars >= total / 2) hit = true; // ekor baris berganti font
        // sisa kasus: segmen awal minoritas + satu font lain sampai akhir = label/judul → wajar
        if (hit) { mixed++; if (!mixedExample) mixedExample = lineText.trim().slice(0, 60); }
      }
      if (mixed > 0) out.findings.push(finding("PF-04", "suspicious", "konten",
        `${mixed} baris teks berganti font di tengah baris`, "Ekstraksi teks per halaman (pdf.js)",
        `Contoh baris: “${mixedExample}”`,
        "Penggantian kata/angka pada dokumen jadi kerap meninggalkan jejak pergantian font di tengah atau di ekor baris. Pola label/judul formulir (segmen awal berbeda, sisanya satu font), cap tanda tangan elektronik, dan kolom formulir terpisah tidak dihitung oleh aturan ini."));
      if (tiny.length) out.findings.push(finding("PF-05", "suspicious", "konten",
        "Ditemukan teks berukuran sangat kecil", "Ekstraksi teks per halaman",
        `${tiny.length} potong teks < 3,5 pt, contoh hal. ${tiny[0].page}: “${tiny[0].str}”`,
        "Teks nyaris tak terbaca dapat dipakai menyembunyikan konten dari pembaca sambil tetap ada di dalam berkas."));
    } catch (e) {
      out.moduleNotes.push("Render/ekstraksi teks pdf.js gagal: " + e.message + " (pemeriksaan struktur tetap berjalan).");
      out.coveragePenalty += 0.15;
    }
    out.meta.techTexts = [info.producer, info.creator, out.meta.xmp && out.meta.xmp.producer, ...out.fonts];
    out.timestamps = out.timestamps.filter(Boolean);
    return out;
  }

  /* ================= OOXML bersama ================= */
  async function loadZip(buf) { return await global.JSZip.loadAsync(buf); }
  async function ooxmlCommon(zip, out) {
    const names = Object.keys(zip.files);
    out.meta.parts = names.length;
    for (const n of names) {
      const f = zip.files[n];
      if (f.date) out.timestamps.push(ev("zip.entry.date", "Entri ZIP: " + n, f.date.toISOString(), f.date, "other", "D",
        "Waktu lokal tanpa zona pada kontainer ZIP; konteks saja"));
    }
    if (zip.files["docProps/core.xml"]) {
      const core = parseXml(await zip.files["docProps/core.xml"].async("string"));
      out.meta.core = {
        creator: xmlTag(core, "creator"), lastModifiedBy: xmlTag(core, "lastModifiedBy"),
        revision: xmlTag(core, "revision"), title: xmlTag(core, "title")
      };
      const created = xmlTag(core, "created"), modified = xmlTag(core, "modified");
      if (created) out.timestamps.push(ev("ooxml.core.created", "docProps/core.xml", created, C.parseAnyDate(created), "creation", "B"));
      if (modified) out.timestamps.push(ev("ooxml.core.modified", "docProps/core.xml", modified, C.parseAnyDate(modified), "modification", "B"));
    }
    if (zip.files["docProps/app.xml"]) {
      const app = parseXml(await zip.files["docProps/app.xml"].async("string"));
      out.meta.app = { application: xmlTag(app, "Application"), appVersion: xmlTag(app, "AppVersion"),
        totalTime: xmlTag(app, "TotalTime"), company: xmlTag(app, "Company") };
    }
    for (const n of names) {
      if (/^word\/media\/|^xl\/media\//.test(n) || /\.(jpe?g|png)$/i.test(n) && /media\//.test(n)) {
        const data = await zip.files[n].async("arraybuffer");
        const item = { kind: "media", location: n, sizeBytes: data.byteLength, sha256: await sha256hex(data) };
        if (/\.jpe?g$/i.test(n) && global.exifr) {
          try {
            const ex = await global.exifr.parse(data, { tiff: true, exif: true, gps: false });
            if (ex) {
              item.exif = { make: ex.Make, model: ex.Model, software: ex.Software };
              const d = ex.DateTimeOriginal || ex.CreateDate || ex.ModifyDate;
              if (d) { item.exifDate = C.parseAnyDate(d); out.timestamps.push(ev("ooxml.media.exif", n, String(d), item.exifDate, "other", "B")); }
            }
          } catch (e) { /* abaikan */ }
        }
        out.embedded.push(item);
      }
      if (/embeddings\//.test(n)) out.embedded.push({ kind: "ole", location: n, sizeBytes: zip.files[n]._data ? 0 : 0 });
    }
    out.meta.techTexts = [out.meta.app && out.meta.app.application, out.meta.app && ("AppVersion " + (out.meta.app.appVersion || ""))];
    return out;
  }

  async function analyzeDocx(buf) {
    const out = baseResult("docx");
    const zip = await loadZip(buf);
    if (!zip.files["word/document.xml"]) throw new Error("word/document.xml tidak ditemukan — bukan DOCX yang valid.");
    await ooxmlCommon(zip, out);
    const docText = await zip.files["word/document.xml"].async("string");
    const ins = [...docText.matchAll(/<w:ins[^>]*w:date="([^"]+)"/g)];
    const del = (docText.match(/<w:del[\s>]/g) || []).length;
    const vanish = (docText.match(/<w:vanish/g) || []).length;
    const rsids = new Set([...docText.matchAll(/w:rsid\w*="([0-9A-Fa-f]+)"/g)].map(m => m[1]));
    out.meta.revisions = { insertions: ins.length, deletions: del, rsidSessions: rsids.size };
    for (const m of ins.slice(0, 20)) out.timestamps.push(ev("docx.revision.date", "Revisi w:ins", m[1], C.parseAnyDate(m[1]), "modification", "B"));
    if (ins.length || del) out.findings.push(finding("DC-03", "suspicious", "konten",
      "Dokumen menyimpan jejak revisi (track changes)", "word/document.xml",
      `${ins.length} penyisipan & ${del} penghapusan terekam masih tersimpan di dalam berkas.`,
      "Revisi yang belum diterima/dibersihkan menunjukkan dokumen disunting bertahap dan riwayat suntingannya bocor ke penerima berkas."));
    if (vanish) out.findings.push(finding("DC-05", "suspicious", "konten", "Ditemukan teks tersembunyi (vanish)", "word/document.xml",
      `${vanish} run teks berformat vanish`, "Teks yang disembunyikan dari tampilan tetapi tetap ada di berkas."));
    if (zip.files["word/comments.xml"]) {
      const cText = await zip.files["word/comments.xml"].async("string");
      const cDates = [...cText.matchAll(/w:date="([^"]+)"/g)];
      for (const m of cDates.slice(0, 20)) out.timestamps.push(ev("docx.comment.date", "Komentar", m[1], C.parseAnyDate(m[1]), "other", "B"));
      out.findings.push(finding("DC-03", "info", "konten", `Dokumen memuat ${cDates.length} komentar bertanggal`, "word/comments.xml",
        "Komentar beserta tanggalnya tersimpan di berkas.", "Komentar dapat memberi konteks proses penyusunan dokumen."));
    }
    const paras = [...docText.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map(p =>
      [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join("")).filter(Boolean);
    out.text = paras.join("\n");
    out.pageCount = null;
    out.timestamps = out.timestamps.filter(Boolean);
    return out;
  }

  function evalFormula(f, values) {
    let expr = f.replace(/^\s*=/, "").trim();
    const rangeVal = (a, b, fn) => {
      const colA = a.replace(/[0-9]/g, ""), rowA = +a.replace(/\D/g, "");
      const colB = b.replace(/[0-9]/g, ""), rowB = +b.replace(/\D/g, "");
      if (colA !== colB) return null;
      const arr = [];
      for (let r = Math.min(rowA, rowB); r <= Math.max(rowA, rowB); r++) {
        const v = values[colA + r]; if (typeof v === "number") arr.push(v);
      }
      if (!arr.length) return 0;
      if (fn === "SUM") return arr.reduce((x, y) => x + y, 0);
      if (fn === "AVERAGE") return arr.reduce((x, y) => x + y, 0) / arr.length;
      if (fn === "MIN") return Math.min(...arr);
      if (fn === "MAX") return Math.max(...arr);
      return null;
    };
    let prev;
    do { prev = expr;
      expr = expr.replace(/\b(SUM|AVERAGE|MIN|MAX)\(\s*([A-Z]+\d+)\s*:\s*([A-Z]+\d+)\s*\)/gi, (m, fn, a, b) => {
        const v = rangeVal(a.toUpperCase(), b.toUpperCase(), fn.toUpperCase()); return v == null ? m : String(v);
      });
    } while (expr !== prev);
    expr = expr.replace(/\b(SUM|AVERAGE|MIN|MAX)\(([^()]*)\)/gi, (m, fn, args) => {
      const nums = args.split(/[;,]/).map(s => { const v = values[s.trim().toUpperCase()]; return typeof v === "number" ? v : parseFloat(s); }).filter(v => !isNaN(v));
      if (!nums.length) return "0";
      if (fn.toUpperCase() === "SUM") return String(nums.reduce((x, y) => x + y, 0));
      if (fn.toUpperCase() === "AVERAGE") return String(nums.reduce((x, y) => x + y, 0) / nums.length);
      if (fn.toUpperCase() === "MIN") return String(Math.min(...nums));
      return String(Math.max(...nums));
    });
    expr = expr.replace(/\$?([A-Z]+)\$?(\d+)/g, (m, c, r) => {
      const v = values[c + r]; return typeof v === "number" ? String(v) : "NaN";
    });
    if (/[^0-9+\-*/().\s]/.test(expr)) return null;
    try { const v = Function('"use strict";return(' + expr + ")")(); return typeof v === "number" && isFinite(v) ? v : null; }
    catch (e) { return null; }
  }

  async function analyzeXlsx(buf) {
    const out = baseResult("xlsx");
    const zip = await loadZip(buf);
    if (!zip.files["xl/workbook.xml"]) throw new Error("xl/workbook.xml tidak ditemukan — bukan XLSX yang valid.");
    await ooxmlCommon(zip, out);
    const wb = await zip.files["xl/workbook.xml"].async("string");
    const sheets = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*state="([^"]+)"/g)];
    const allSheets = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map(m => m[1]);
    out.meta.sheets = allSheets;
    for (const s of sheets) out.findings.push(finding("XL-03", s[2] === "veryHidden" ? "suspicious" : "info", "struktur",
      `Sheet “${s[1]}” berstatus ${s[2]}`, "xl/workbook.xml", `state=${s[2]}`,
      s[2] === "veryHidden" ? "Sheet veryHidden tidak muncul di daftar sembunyikan biasa Excel — pola yang kerap dipakai menyamarkan data."
                            : "Sheet tersembunyi terdeteksi."));
    const defined = (wb.match(/<definedName/g) || []).length;
    if (defined) out.meta.definedNames = defined;
    const extLinks = Object.keys(zip.files).filter(n => /externalLinks\//.test(n));
    if (extLinks.length) out.findings.push(finding("XL-05", "info", "struktur", "Workbook memiliki tautan eksternal", "xl/externalLinks",
      extLinks.join(", "), "Nilai sel dapat bergantung pada berkas lain di luar workbook ini."));
    let mismatch = [], uncalculated = 0, hiddenRows = 0, hiddenCols = 0, cellTexts = [];
    const sheetNames = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    for (const sn of sheetNames) {
      const sx = parseXml(await zip.files[sn].async("string"));
      hiddenRows += [...sx.getElementsByTagName("row")].filter(r => r.getAttribute("hidden") === "1").length;
      hiddenCols += [...sx.getElementsByTagName("col")].filter(r => r.getAttribute("hidden") === "1").length;
      const values = {}; const cells = [...sx.getElementsByTagName("c")];
      for (const c of cells) {
        const vEl = c.getElementsByTagName("v")[0];
        const ref = c.getAttribute("r");
        if (vEl && !isNaN(parseFloat(vEl.textContent))) values[ref] = parseFloat(vEl.textContent);
        if (c.getAttribute("t") === "s") cellTexts.push(ref);
      }
      for (const c of cells) {
        const fEl = c.getElementsByTagName("f")[0]; if (!fEl) continue;
        const vEl = c.getElementsByTagName("v")[0];
        const ref = c.getAttribute("r");
        if (!vEl) { uncalculated++; continue; }
        const cached = parseFloat(vEl.textContent);
        const calc = evalFormula(fEl.textContent, values);
        if (calc != null && !isNaN(cached) && Math.abs(calc - cached) > Math.max(0.01, Math.abs(calc) * 0.000001))
          mismatch.push({ sheet: sn.split("/").pop(), ref, formula: fEl.textContent, cached, calc: +calc.toFixed(4) });
      }
    }
    if (mismatch.length) out.findings.push(finding("XL-02", "critical", "konten",
      `${mismatch.length} sel: nilai tersimpan tidak cocok dengan hasil formulanya`, "Lembar kerja XLSX",
      mismatch.slice(0, 5).map(m => `${m.ref}: =${m.formula} tersimpan ${m.cached}, seharusnya ±${m.calc}`).join("; "),
      "Pada berkas yang disimpan normal oleh Excel, nilai cache selalu hasil hitung formula terakhir. Ketidakcocokan adalah pola klasik penimpaan angka manual tanpa menghitung ulang.", "high"));
    if (uncalculated) out.findings.push(finding("XL-02", "info", "konten", `${uncalculated} sel formula tanpa nilai cache`, "Lembar kerja XLSX",
      "Formula belum pernah dihitung sejak ditulis.", "Dapat terjadi pada berkas hasil generator program, bukan Excel."));
    if (hiddenRows || hiddenCols) out.findings.push(finding("XL-03", "info", "struktur",
      `${hiddenRows} baris & ${hiddenCols} kolom tersembunyi`, "Lembar kerja XLSX", "Atribut hidden pada baris/kolom.",
      "Data tersembunyi tetap terbaca mesin dan relevan untuk pemeriksaan menyeluruh."));
    out.pageCount = allSheets.length;
    out.timestamps = out.timestamps.filter(Boolean);
    return out;
  }

  /* ================= Gambar ================= */
  async function analyzeImage(buf, kind) {
    const out = baseResult(kind);
    const u8 = new Uint8Array(buf);
    if (global.exifr) {
      try {
        const ex = await global.exifr.parse(buf, { tiff: true, exif: true, xmp: true, iptc: false });
        if (ex) {
          out.meta.exif = { make: ex.Make, model: ex.Model, software: ex.Software, artist: ex.Artist };
          const rows = [["exif.dateTimeOriginal", "EXIF DateTimeOriginal", ex.DateTimeOriginal, "creation"],
                        ["exif.createDate", "EXIF CreateDate", ex.CreateDate, "creation"],
                        ["exif.modifyDate", "EXIF ModifyDate", ex.ModifyDate, "modification"]];
          for (const [src, loc, val, role] of rows)
            if (val) out.timestamps.push(ev(src, loc, String(val), C.parseAnyDate(val), role, "B"));
          try {
            const thumb = await global.exifr.thumbnail(buf);
            if (thumb) out.meta.hasExifThumbnail = true;
          } catch (e) { /* abaikan */ }
          out.meta.techTexts = [ex.Software, ex.Model];
        } else out.moduleNotes.push("Tidak ditemukan metadata EXIF/XMP (mungkin sudah dibersihkan oleh aplikasi pengirim, mis. WhatsApp).");
      } catch (e) { out.moduleNotes.push("Pembacaan EXIF gagal: " + e.message); }
    }
    if (kind === "jpeg") {
      let i = 2, dqt = 0, w = 0, h = 0, scans = 0;
      while (i < u8.length - 3) {
        if (u8[i] !== 0xff) break;
        const marker = u8[i + 1];
        if (marker === 0xda) { scans++; break; }
        const len = (u8[i + 2] << 8) + u8[i + 3];
        if (marker === 0xdb) dqt++;
        if ((marker === 0xc0 || marker === 0xc2) && len >= 7) { h = (u8[i + 5] << 8) + u8[i + 6]; w = (u8[i + 7] << 8) + u8[i + 8]; }
        i += 2 + len;
      }
      out.meta.dimensions = w && h ? `${w}×${h}` : null;
      out.meta.quantTables = dqt;
    }
    if (kind === "png") {
      let i = 8; const texts = [];
      while (i < u8.length - 7) {
        const len = (u8[i] << 24) + (u8[i + 1] << 16) + (u8[i + 2] << 8) + u8[i + 3];
        const type = String.fromCharCode(u8[i + 4], u8[i + 5], u8[i + 6], u8[i + 7]);
        if (type === "IHDR") out.meta.dimensions = `${(u8[i + 8] << 24) + (u8[i + 9] << 16) + (u8[i + 10] << 8) + u8[i + 11]}×${(u8[i + 12] << 24) + (u8[i + 13] << 16) + (u8[i + 14] << 8) + u8[i + 15]}`;
        if (type === "tIME" && len >= 7) {
          const y = (u8[i + 8] << 8) + u8[i + 9];
          const dt = new Date(Date.UTC(y, u8[i + 10] - 1, u8[i + 11], u8[i + 12], u8[i + 13], u8[i + 14]));
          out.timestamps.push(ev("png.tIME", "Chunk tIME PNG", dt.toISOString(), dt, "modification", "B"));
        }
        if ((type === "tEXt" || type === "iTXt") && len < 4096) texts.push(latin1(buf, i + 8, len).slice(0, 200));
        if (type === "IEND") break;
        i += 12 + len;
      }
      out.meta.pngTexts = texts;
      for (const t of texts) {
        const m = /Creation Time\0(.+)/.exec(t);
        if (m) out.timestamps.push(ev("png.text.creationTime", "Chunk teks PNG", m[1], C.parseAnyDate(m[1]), "creation", "C"));
      }
    }
    /* ELA indikatif (kepercayaan rendah) */
    try {
      const blob = new Blob([buf], { type: kind === "png" ? "image/png" : "image/jpeg" });
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      const orig = cx.getImageData(0, 0, cv.width, cv.height).data;
      const recompressed = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.92));
      const url2 = URL.createObjectURL(recompressed);
      const img2 = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url2; });
      cx.drawImage(img2, 0, 0, cv.width, cv.height);
      const re = cx.getImageData(0, 0, cv.width, cv.height).data;
      let sum = 0, n = 0;
      for (let p = 0; p < orig.length; p += 16) { sum += Math.abs(orig[p] - re[p]); n++; }
      out.meta.elaMean = +(sum / Math.max(1, n)).toFixed(2);
      URL.revokeObjectURL(url); URL.revokeObjectURL(url2);
      out.findings.push(finding("IM-04", "info", "gambar", `Analisis tingkat galat (ELA) indikatif: rerata selisih ${out.meta.elaMean}`,
        "Analisis piksel gambar", "Perbandingan gambar asli vs hasil kompresi-ulang JPEG kualitas 92%.",
        "ELA HANYA petunjuk awal berkepercayaan rendah: nilai tinggi dapat berasal dari pemrosesan kamera yang sah. Tidak dipakai sebagai bukti tunggal.", "low"));
    } catch (e) { out.moduleNotes.push("ELA tidak dijalankan: " + e.message); }
    out.pageCount = 1;
    out.timestamps = out.timestamps.filter(Boolean);
    return out;
  }

  function baseResult(kind) {
    return { kind, timestamps: [], findings: [], embedded: [], fonts: [], meta: {}, text: "",
      pageCount: null, moduleNotes: [], coveragePenalty: 0, lineageId: null };
  }

  global.SFEngine = { sha256hex, analyzePdf, analyzeDocx, analyzeXlsx, analyzeImage, evalFormula };
})(typeof window !== "undefined" ? window : globalThis);
