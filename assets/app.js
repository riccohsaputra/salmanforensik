/* SalmanForensik — app.js (pengendali antarmuka & pipeline)
 * Seluruh data pemeriksaan hidup hanya di memori tab ini.
 * Satu-satunya localStorage yang dipakai: preferensi tema (sf-theme). */
(function () {
  "use strict";
  const C = window.SFCore, E = window.SFEngine;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const humanSize = (n) => n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : n > 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B";

  /* ---------- Tema ---------- */
  const themeToggle = $("#theme-toggle");
  const THEME_META = {
    light: { icon: "☀️", label: "Terang" },
    dark: { icon: "🌙", label: "Gelap" },
    auto: { icon: "◐", label: "Otomatis" }
  };
  const THEME_CYCLE = { light: "dark", dark: "auto", auto: "light" };

  function applyTheme(val) {
    const eff = val === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : val;
    document.documentElement.dataset.theme = eff;
    const meta = THEME_META[val] || THEME_META.auto;
    if (themeToggle) {
      themeToggle.textContent = meta.icon;
      const desc = `Tema: ${meta.label} — ketuk untuk mengganti tema`;
      themeToggle.title = desc;
      themeToggle.setAttribute("aria-label", desc);
    }
  }
  let themePref = "auto";
  try { themePref = localStorage.getItem("sf-theme") || "auto"; } catch (e) { /* abaikan */ }
  applyTheme(themePref);
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      themePref = THEME_CYCLE[themePref] || "light";
      try { localStorage.setItem("sf-theme", themePref); } catch (err) { /* abaikan */ }
      applyTheme(themePref);
    });
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (themePref === "auto") applyTheme("auto"); });

  /* ---------- State sesi (memori saja) ---------- */
  const STAGES = ["Akuisisi & Integritas", "Identifikasi", "Ekstraksi Metadata & Bukti Waktu", "Timeline Umur",
    "Struktur & Konten", "Objek Sisipan & Tanda Tangan", "Pembanding", "Penilaian & Rujukan"];
  let session = null; // {suspectFile, refFile, suspectKind, refKind, result, refResult, comparison, reportId, cancelled, timerInt, t0}

  function newSession() {
    return { suspectFile: null, refFile: null, suspectKind: null, refKind: null,
      result: null, refResult: null, comparison: null, reportId: C.makeReportId(new Date()),
      cancelled: false, partial: false, coverage: 1 };
  }
  session = newSession();

  /* ---------- Pemilihan berkas ---------- */
  async function lightCheck(file) {
    const buf = await file.slice(0, 64).arrayBuffer();
    const t = C.detectType(new Uint8Array(buf));
    let kind = t;
    if (t === "zip") {
      try {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        if (zip.files["word/document.xml"]) kind = "docx";
        else if (zip.files["xl/workbook.xml"]) kind = "xlsx";
        else kind = "zip-lain";
      } catch (e) { kind = "zip-lain"; }
    }
    if (t === "jpeg") kind = "jpeg";
    return kind;
  }
  const KIND_LABEL = { pdf: "PDF", docx: "DOCX (Word)", xlsx: "XLSX (Excel)", jpeg: "Gambar JPEG", png: "Gambar PNG", "zip-lain": "ZIP (tidak didukung)", unknown: "Tidak dikenal" };
  const KIND_ICON = { pdf: "📕", docx: "📘", xlsx: "📗", jpeg: "🖼️", png: "🖼️" };

  async function onFile(which, file, cardEl, warnEl) {
    if (!file) return;
    const kind = await lightCheck(file);
    session[which + "File"] = file; session[which + "Kind"] = kind;
    cardEl.innerHTML = `<div class="filecard"><span class="ic">${KIND_ICON[kind] || "📄"}</span>
      <div><strong>${esc(file.name)}</strong><br><span class="note">${KIND_LABEL[kind] || kind} · ${humanSize(file.size)} · terakhir diubah di perangkat: ${esc(C.fmtWIB(new Date(file.lastModified)))} (konteks sesi saja, keandalan sangat lemah)</span></div></div>`;
    const supported = ["pdf", "docx", "xlsx", "jpeg", "png"].includes(kind);
    const ext = C.extOf(file.name);
    let warn = "";
    if (!supported) warn = "Format berkas ini di luar dukungan SalmanForensik (PDF, DOCX, XLSX, JPG, PNG).";
    else if (C.EXT_TYPE[ext] && !kind.startsWith(C.EXT_TYPE[ext].replace("ooxml-word", "docx").replace("ooxml-excel", "xlsx")))
      warn = `Ekstensi .${ext} tidak sesuai isi berkas yang terdeteksi sebagai ${KIND_LABEL[kind]}. Pemeriksaan mengikuti isi sebenarnya.`;
    if (file.size > 50 * 1048576) warn = (warn ? warn + " " : "") + "Berkas lebih dari 50 MB — pemeriksaan dapat berjalan lama dan berat di perangkat ini.";
    warnEl.innerHTML = warn ? `<div class="warn">⚠️ ${esc(warn)}</div>` : "";
    if (which === "suspect") $("#btn-start").disabled = !supported;
  }
  function wireDrop(zoneId, inputId, which, cardSel, warnSel) {
    const zone = $(zoneId), input = $(inputId);
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
    zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("drag"); if (e.dataTransfer.files[0]) onFile(which, e.dataTransfer.files[0], $(cardSel), $(warnSel)); });
    input.addEventListener("change", () => { if (input.files[0]) onFile(which, input.files[0], $(cardSel), $(warnSel)); });
  }
  wireDrop("#drop-suspect", "#file-suspect", "suspect", "#suspect-card", "#suspect-warn");
  wireDrop("#drop-ref", "#file-ref", "ref", "#ref-card", "#suspect-warn");

  /* ---------- Tahapan ---------- */
  function renderStages() {
    $("#stage-list").innerHTML = STAGES.map((s, i) =>
      `<li><span class="st-ic" id="st-ic-${i}">○</span><span>${esc(s)}</span><span class="note" id="st-note-${i}"></span></li>`).join("");
  }
  function setStage(i, state, note) {
    const ic = $("#st-ic-" + i), nt = $("#st-note-" + i);
    if (!ic) return;
    const map = { done: ["✓", "st-done"], run: ["◌", "st-run"], fail: ["✕", "st-fail"], skip: ["—", "st-skip"], wait: ["○", ""] };
    ic.textContent = map[state][0]; ic.className = "st-ic " + map[state][1];
    if (note && nt) nt.textContent = "— " + note;
    const doneCount = STAGES.map((_, j) => $("#st-ic-" + j)).filter(el => el && el.textContent === "✓").length;
    $("#progress-bar").style.width = Math.round(doneCount / STAGES.length * 100) + "%";
    $("#progress-label").textContent = state === "run" ? "Tahap " + (i + 1) + " dari " + STAGES.length + ": " + STAGES[i] + "…" : $("#progress-label").textContent;
  }
  function bumpCounters(findings) {
    $("#cnt-crit").textContent = findings.filter(f => f.severity === "critical").length + " kritis";
    $("#cnt-susp").textContent = findings.filter(f => f.severity === "suspicious").length + " mencurigakan";
    $("#cnt-info").textContent = findings.filter(f => f.severity === "info").length + " info";
  }

  /* ---------- Ekstraksi tanggal klaim dari isi ---------- */
  const ID_MONTHS = { januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5, juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11 };
  function claimFromText(text) {
    const m = /(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i.exec(text || "");
    if (!m) return null;
    return new Date(+m[3], ID_MONTHS[m[2].toLowerCase()], +m[1]);
  }

  /* ---------- Pipeline ---------- */
  $("#btn-start").addEventListener("click", runPipeline);
  $("#btn-cancel").addEventListener("click", () => { session.cancelled = true; });

  async function runPipeline() {
    if (!session.suspectFile) return;
    session.cancelled = false; session.partial = false;
    $("#view-start").classList.add("hidden");
    $("#view-results").classList.add("hidden");
    $("#view-progress").classList.remove("hidden");
    $("#live-results").innerHTML = "";
    renderStages(); bumpCounters([]);
    session.t0 = Date.now();
    session.timerInt = setInterval(() => { $("#elapsed").textContent = "· " + Math.round((Date.now() - session.t0) / 1000) + " dtk"; }, 500);
    const guard = () => { if (session.cancelled) throw new Error("__cancelled__"); };

    try {
      /* Tahap 1 — akuisisi */
      setStage(0, "run"); await sleep(30); guard();
      const sBuf = await session.suspectFile.arrayBuffer();
      const sHash = await E.sha256hex(sBuf);
      let rHash = null, rBuf = null;
      if (session.refFile) { rBuf = await session.refFile.arrayBuffer(); rHash = await E.sha256hex(rBuf); }
      session.suspectHash = sHash; session.refHash = rHash;
      setStage(0, "done", "SHA-256 " + sHash.slice(0, 16) + "…");
      $("#live-results").innerHTML = `<div class="card"><h3>Identitas berkas</h3>
        <p><strong>${esc(session.suspectFile.name)}</strong> · ${esc(KIND_LABEL[session.suspectKind])} · ${humanSize(session.suspectFile.size)}</p>
        <p class="mono">SHA-256: ${esc(sHash)}</p></div>`;

      /* Tahap 2 — identifikasi */
      setStage(1, "run"); await sleep(30); guard();
      setStage(1, "done", KIND_LABEL[session.suspectKind]);

      /* Tahap 3 — ekstraksi (mesin per format) */
      setStage(2, "run"); await sleep(30); guard();
      let res;
      const k = session.suspectKind;
      if (k === "pdf") res = await E.analyzePdf(sBuf, session.suspectFile.name);
      else if (k === "docx") res = await E.analyzeDocx(sBuf);
      else if (k === "xlsx") res = await E.analyzeXlsx(sBuf);
      else res = await E.analyzeImage(sBuf, k);
      res.timestamps = (res.timestamps || []).filter(Boolean);
      session.result = res;
      guard();
      setStage(2, "done", res.timestamps.length + " bukti waktu");
      bumpCounters(res.findings);

      /* Tahap 4 — timeline umur */
      setStage(3, "run"); await sleep(30); guard();
      const ctxForm = readContext();
      const claimDate = ctxForm.claimDate || claimFromText(res.text);
      const claimSource = ctxForm.claimDate ? "isian pemeriksa" : (claimDate ? "tanggal tertera pada isi dokumen" : null);
      const creations = res.timestamps.filter(t => t.role === "creation" && t.date).map(t => t.date);
      const embeddedYounger = res.embedded.some(o => o.exifDate && creations.length && o.exifDate > new Date(Math.max(...creations)));
      const techHits = C.techAnachronisms([].concat(res.meta.techTexts || [], res.fonts || []));
      const ageFindings = C.evaluateAgeRules(res.timestamps, { examDate: new Date(), claimDate, techHits, embeddedYounger });
      if (!res.timestamps.length)
        ageFindings.push({ ruleId: "U-08", severity: "info", category: "umur", title: "Tidak ditemukan bukti waktu internal",
          location: "Seluruh sumber metadata", observed: "0 timestamp internal terbaca",
          explanation: "Metadata waktu kosong/ter-strip (sering terjadi setelah berkas melewati aplikasi pesan atau alat pembersih metadata). Umur dokumen tidak dapat dinilai dari berkas ini.",
          method: "Aturan timeline SalmanForensik U-08", confidence: "high" });
      res.findings = res.findings.concat(ageFindings);
      session.claimDate = claimDate; session.claimSource = claimSource; session.techHits = techHits;
      setStage(3, "done", ageFindings.length + " temuan umur");
      bumpCounters(res.findings);

      /* Tahap 5 & 6 — struktur/konten & objek (hasil mesin dibukukan) */
      setStage(4, "run"); await sleep(30); guard();
      setStage(4, "done", res.findings.filter(f => ["konten", "struktur"].includes(f.category)).length + " temuan");
      setStage(5, "run"); await sleep(30); guard();
      setStage(5, "done", res.embedded.length + " objek sisipan");
      if (res.moduleNotes.length) session.partial = true;

      /* Tahap 7 — pembanding */
      if (session.refFile && rBuf) {
        setStage(6, "run"); await sleep(30); guard();
        let refRes;
        const rk = session.refKind;
        if (rk === "pdf") refRes = await E.analyzePdf(rBuf, session.refFile.name);
        else if (rk === "docx") refRes = await E.analyzeDocx(rBuf);
        else if (rk === "xlsx") refRes = await E.analyzeXlsx(rBuf);
        else if (["jpeg", "png"].includes(rk)) refRes = await E.analyzeImage(rBuf, rk);
        session.refResult = refRes || null;
        session.comparison = compare(session, res, refRes);
        if (session.comparison) {
          res.findings = res.findings.concat(session.comparison.findings);
          bumpCounters(res.findings);
        }
        setStage(6, "done", session.comparison ? session.comparison.relation : "format pembanding tidak sebanding");
      } else setStage(6, "skip", "tanpa pembanding");

      /* Tahap 8 — penilaian & rujukan */
      setStage(7, "run"); await sleep(30); guard();
      const ageOk = res.timestamps.length > 0;
      let coverage = 1 - (res.coveragePenalty || 0);
      if (res.timestamps.length < 2) coverage -= 0.25;
      if (!res.text && (k === "pdf" || k === "docx")) coverage -= 0.15;
      if (session.partial) coverage -= 0.1;
      session.coverage = Math.max(0.1, Math.min(1, coverage));
      session.conclusion = C.conclude(res.findings, session.coverage, ageOk);
      session.referral = C.referralFor(session.conclusion.key, ctxForm.type, ctxForm.purpose);
      session.ctx = ctxForm; session.durationSec = Math.round((Date.now() - session.t0) / 1000);
      setStage(7, "done", session.conclusion.label);
      clearInterval(session.timerInt);
      await sleep(450);
      showResults();
    } catch (err) {
      clearInterval(session.timerInt);
      if (err.message === "__cancelled__") { wipeSession(false); return; }
      session.partial = true;
      $("#progress-label").innerHTML = "⛔ Pemeriksaan terhenti: " + esc(err.message) +
        " — berkas mungkin terenkripsi/rusak atau formatnya menyimpang. Coba berkas lain, atau periksa sebagai berkas tanpa enkripsi.";
      setStage(2, "fail");
    }
  }

  function readContext() {
    const d = $("#ctx-claim").value;
    return { type: $("#ctx-type").value, purpose: $("#ctx-purpose").value,
      issuer: $("#ctx-issuer").value.trim(), examiner: $("#ctx-examiner").value.trim(),
      claimDate: d ? new Date(d + "T00:00:00") : null };
  }

  /* ---------- Pembanding ---------- */
  function wordDiff(aText, bText) {
    const a = (aText || "").split(/\s+/).filter(Boolean), b = (bText || "").split(/\s+/).filter(Boolean);
    if (!a.length || !b.length || a.length > 1500 || b.length > 1500) {
      const setA = new Set(a), setB = new Set(b);
      const onlyA = [...setA].filter(w => !setB.has(w)).length, onlyB = [...setB].filter(w => !setA.has(w)).length;
      return { mode: "ringkas", wordsA: a.length, wordsB: b.length, onlySuspect: onlyA, onlyRef: onlyB, segments: [] };
    }
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const segs = []; let i = 0, j = 0, cur = null;
    const flush = () => { if (cur) segs.push(cur); cur = null; };
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { flush(); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { if (!cur) cur = { a: [], b: [] }; cur.b.push(b[j]); j++; }
      else if (i < n) { if (!cur) cur = { a: [], b: [] }; cur.a.push(a[i]); i++; }
      else break;
    }
    flush();
    return { mode: "rinci", wordsA: n, wordsB: m, segments: segs.slice(0, 10).map(s => ({ suspect: s.a.join(" ").slice(0, 160), ref: s.b.join(" ").slice(0, 160) })) };
  }

  function compare(sess, s, r) {
    if (!r) return null;
    const out = { findings: [], hashEqual: sess.suspectHash === sess.refHash, relation: "", diff: null, lineageEqual: false, sharedEmbedded: [] };
    out.lineageEqual = !!(s.lineageId && r.lineageId && s.lineageId === r.lineageId);
    const sEmb = new Map(s.embedded.filter(o => o.sha256).map(o => [o.sha256, o]));
    for (const o of r.embedded) if (o.sha256 && sEmb.has(o.sha256)) out.sharedEmbedded.push(o);
    if (out.hashEqual) out.relation = "File identik";
    else if (out.lineageEqual) out.relation = "Kemungkinan turunan dari sumber yang sama";
    else if (out.sharedEmbedded.length) out.relation = "Dokumen berbeda, tetapi berbagi objek sisipan yang persis sama";
    else out.relation = "Dokumen berbeda (garis keturunan tidak terbukti sama)";
    if (out.sharedEmbedded.length && !out.hashEqual)
      out.findings.push({ ruleId: "PB-06", severity: "critical", category: "pembanding",
        title: "Objek sisipan identik persis pada kedua dokumen", location: "Perbandingan objek tertanam",
        observed: out.sharedEmbedded.map(o => esc(o.location)).join(", "),
        explanation: "Objek gambar yang sama persis (hash identik) muncul pada dua berkas berbeda. Untuk tanda tangan/stempel, kesamaan piksel-per-piksel adalah indikasi kuat penempelan salinan — tanda tangan wajar tidak pernah identik persis.",
        method: "Perbandingan hash objek SalmanForensik PB-06", confidence: "high" });
    if (s.text || r.text) out.diff = wordDiff(s.text, r.text);
    return out;
  }

  /* ---------- Render hasil ---------- */
  function findingCard(f, idx) {
    const sevLabel = { critical: "🔴 Kritis", suspicious: "🟠 Mencurigakan", info: "🔵 Info" }[f.severity];
    return `<div class="finding ${f.severity}"><h4>SF-${String(idx + 1).padStart(3, "0")} · ${esc(f.title)}</h4>
      <div class="meta">${sevLabel} · Kategori: ${esc(f.category)} · Aturan: ${esc(f.ruleId)} · Kepercayaan: ${esc(f.confidence)}</div>
      <p><strong>Lokasi:</strong> ${esc(f.location)}<br><strong>Teramati:</strong> ${esc(f.observed)}</p>
      <p>${esc(f.explanation)}</p></div>`;
  }
  function kvTable(rows) {
    return `<table class="kv">${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${r[1]}</td></tr>`).join("")}</table>`;
  }

  function showResults() {
    const s = session, res = s.result;
    $("#view-progress").classList.add("hidden");
    $("#view-results").classList.remove("hidden");
    const b = $("#conclusion-banner");
    b.className = "banner " + s.conclusion.key;
    $("#conclusion-title").textContent = s.conclusion.label + (s.partial ? " · Pemeriksaan Parsial" : "");
    const crit = res.findings.filter(f => f.severity === "critical").length;
    const susp = res.findings.filter(f => f.severity === "suspicious").length;
    $("#conclusion-sub").textContent = `Laporan ${s.reportId} · selesai dalam ${s.durationSec} dtk · ${crit} temuan kritis, ${susp} mencurigakan · cakupan pemeriksaan ${Math.round(s.coverage * 100)}% · Ini screening awal, bukan penetapan keaslian.`;

    /* Ringkasan */
    const top = [...res.findings].sort((a, b2) => ({ critical: 0, suspicious: 1, info: 2 }[a.severity] - { critical: 0, suspicious: 1, info: 2 }[b2.severity])).slice(0, 3);
    $("#tab-ringkasan").innerHTML = `<div class="card"><h2>Ringkasan eksekutif</h2>
      ${kvTable([
        ["Berkas", `<strong>${esc(s.suspectFile.name)}</strong>`],
        ["Jenis terdeteksi", esc(KIND_LABEL[s.suspectKind])],
        ["Ukuran", humanSize(s.suspectFile.size)],
        ["Halaman / sheet", res.pageCount == null ? "—" : res.pageCount],
        ["SHA-256", `<span class="mono">${esc(s.suspectHash)}</span>`],
        ["Pembanding", s.refFile ? `${esc(s.refFile.name)}<br><span class="mono">${esc(s.refHash)}</span>` : "Tidak ada (analisis intrinsik)"],
        ["Kategori screening", `<strong>${esc(s.conclusion.label)}</strong>`]
      ])}
      <h3>Temuan terpenting</h3>
      ${top.length ? top.map((f) => findingCard(f, res.findings.indexOf(f))).join("") : "<p>Tidak ada temuan material pada pemeriksaan ini.</p>"}
      <h3>Rekomendasi rujukan</h3><ol>${s.referral.map(r => `<li>${esc(r)}</li>`).join("")}</ol></div>`;

    /* Timeline */
    const evs = [...res.timestamps].filter(t => t.date).sort((a, b2) => a.date - b2.date);
    const earliest = evs.length ? evs[0].date : null;
    const mods = evs.filter(t => t.role === "modification");
    const latestMod = mods.length ? mods[mods.length - 1].date : null;
    $("#tab-timeline").innerHTML = `<div class="card"><h2>Profil umur dokumen</h2>
      ${kvTable([
        ["Tanggal klaim", s.claimDate ? esc(C.fmtWIB(s.claimDate)) + ` <span class="note">(${esc(s.claimSource || "")})</span>` : "Tidak tersedia"],
        ["Bukti internal paling awal", earliest ? esc(C.fmtWIB(earliest)) : "—"],
        ["Modifikasi terakhir terbukti", latestMod ? esc(C.fmtWIB(latestMod)) : "—"],
        ["Batas umur terbukti (terminus post quem)", s.techHits.length ? s.techHits.map(t => `${esc(t.label)} — tidak sebelum ${t.year}`).join("<br>") : "Tidak ada anakronisme teknologi terdeteksi"]
      ])}
      <h3>Garis waktu bukti</h3>
      ${evs.length ? `<div class="timeline">${evs.map(t => `<div class="ev ${t.role}">
        <div class="when">${esc(C.fmtWIB(t.date))}</div>
        <div><strong>${esc(t.location)}</strong> · sumber: <span class="mono">${esc(t.source)}</span> · keandalan ${esc(t.reliability)}</div>
        <div class="src">Nilai mentah: <span class="mono">${esc(t.rawValue)}</span>${t.note ? " · " + esc(t.note) : ""}</div></div>`).join("")}</div>`
      : "<p>Tidak ada bukti waktu internal yang terbaca dari berkas ini.</p>"}</div>`;

    /* Temuan */
    $("#tab-temuan").innerHTML = `<div class="card"><h2>Seluruh temuan (${res.findings.length})</h2>
      ${res.findings.length ? res.findings.map((f, i) => findingCard(f, i)).join("") : "<p>Tidak ada temuan.</p>"}</div>`;

    /* Struktur */
    const metaRows = Object.entries(res.meta).filter(([k2, v]) => v != null && typeof v !== "object")
      .map(([k2, v]) => [k2, esc(String(v))]);
    if (res.meta.info) metaRows.push(["Info PDF", esc(JSON.stringify(res.meta.info))]);
    if (res.meta.core) metaRows.push(["Properti inti OOXML", esc(JSON.stringify(res.meta.core))]);
    if (res.meta.app) metaRows.push(["Aplikasi pembuat", esc(JSON.stringify(res.meta.app))]);
    if (res.meta.exif) metaRows.push(["EXIF ringkas", esc(JSON.stringify(res.meta.exif))]);
    if (res.meta.sheets) metaRows.push(["Daftar sheet", esc(res.meta.sheets.join(", "))]);
    $("#tab-struktur").innerHTML = `<div class="card"><h2>Struktur &amp; objek</h2>
      ${kvTable(metaRows.length ? metaRows : [["—", "Tidak ada metadata terstruktur"]])}
      <h3>Font terdeteksi</h3><div class="chips">${res.fonts.length ? res.fonts.map(f => `<span class="chip">${esc(f)}</span>`).join("") : '<span class="note">Tidak ada / tidak berlaku</span>'}</div>
      <h3>Objek sisipan (${res.embedded.length})</h3>
      ${res.embedded.length ? kvTable(res.embedded.map(o => [o.location, `${esc(o.kind)} · ${humanSize(o.sizeBytes || 0)}<br><span class="mono">${esc(o.sha256 || "—")}</span>${o.exif ? "<br>EXIF: " + esc(JSON.stringify(o.exif)) + (o.exifDate ? " · " + esc(C.fmtWIB(o.exifDate)) : "") : ""}`])) : "<p class='note'>Tidak ditemukan objek media tertanam.</p>"}
      ${res.moduleNotes.length ? `<h3>Catatan modul</h3><ul>${res.moduleNotes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}</div>`;

    /* Pembanding */
    if (s.comparison) {
      const cp = s.comparison;
      $("#tab-pembanding").innerHTML = `<div class="card"><h2>Hasil pembanding</h2>
        ${kvTable([
          ["Hash identik", cp.hashEqual ? "Ya — berkas sama persis" : "Tidak"],
          ["Garis keturunan (ID dokumen)", cp.lineageEqual ? "Sama — kemungkinan satu sumber" : "Tidak terbukti sama / tidak tersedia"],
          ["Relasi dinilai", `<strong>${esc(cp.relation)}</strong>`],
          ["Objek sisipan identik", cp.sharedEmbedded.length ? cp.sharedEmbedded.map(o => esc(o.location)).join(", ") : "Tidak ada"],
          ["Perbedaan teks", cp.diff ? (cp.diff.mode === "rinci"
            ? `${cp.diff.segments.length} segmen berbeda teratas ditampilkan di bawah`
            : `Kata khas tersangka: ${cp.diff.onlySuspect} · kata khas pembanding: ${cp.diff.onlyRef} (dari ${cp.diff.wordsA} vs ${cp.diff.wordsB} kata)`) : "Tidak dapat dibandingkan (teks tidak tersedia)"]
        ])}
        ${cp.diff && cp.diff.segments.length ? "<h3>Segmen berbeda (tersangka ↔ pembanding)</h3>" + cp.diff.segments.map(sg =>
          `<div class="finding suspicious"><p><strong>Tersangka:</strong> ${esc(sg.suspect) || "—"}<br><strong>Pembanding:</strong> ${esc(sg.ref) || "—"}</p></div>`).join("") : ""}
        </div>`;
    } else {
      $("#tab-pembanding").innerHTML = `<div class="card"><h2>Pembanding</h2><p class="note">Pemeriksaan ini berjalan <strong>tanpa dokumen pembanding</strong> — analisis bersifat intrinsik (umur, struktur, konten berkas itu sendiri). Kesimpulan mode intrinsik lebih terbatas daripada mode dengan pembanding.</p></div>`;
    }

    /* Metodologi */
    $("#tab-metodologi").innerHTML = `<div class="card"><h2>Metodologi &amp; batasan</h2>
      <p>Pemeriksaan mengikuti Spesifikasi SalmanForensik v1.0: akuisisi &amp; hash SHA-256, identifikasi magic bytes, ekstraksi metadata &amp; bukti waktu multi-sumber, pembangunan timeline dengan aturan U-01…U-10, pemeriksaan struktur/konten per format (PF/DC/XL/IM), uji pembanding (PB) bila ada, penilaian berbasis aturan deterministik, dan rekomendasi rujukan.</p>
      <h3>Yang TIDAK diperiksa pada versi ini</h3>
      <ul>
        <li>Umur fisik kertas &amp; tinta (memerlukan dokumen fisik dan uji laboratorium kimia).</li>
        <li>Validasi kriptografis penuh rantai sertifikat tanda tangan digital &amp; TSA (dicatat keberadaannya sebagai bukti pendukung).</li>
        <li>OCR pada foto dokumen dan dekode titik kuning printer (Machine Identification Code) — riset lanjutan.</li>
        <li>Isi yang terenkripsi di balik kata sandi berkas, bila kata sandi tidak diberikan.</li>
      </ul>
      <p class="note">Tidak adanya temuan bukan bukti keaslian. Metadata dapat diubah; kekuatan kesimpulan bergantung pada banyaknya sumber bukti yang saling independen. Rantai penguasaan yang dijamin aplikasi dimulai sejak berkas dimuat pada sesi ini.</p></div>`;

    buildPrintArea();
  }

  /* Tabs */
  $("#result-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    $("#result-tabs").querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tabpage").forEach(p => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab));
  });

  /* ---------- Laporan ---------- */
  function buildPrintArea() {
    const s = session, res = s.result;
    const evs = [...res.timestamps].filter(t => t.date).sort((a, b) => a.date - b.date);
    $("#print-area").innerHTML = `<div class="card">
      <h1 style="margin:0">Laporan Screening Awal Forensik Dokumen Digital</h1>
      <p>SalmanForensik · Laporan <strong>${esc(s.reportId)}</strong> · Pemeriksaan: ${esc(C.fmtWIB(new Date()))} · Durasi ${s.durationSec} dtk</p>
      <div class="warn"><strong>Peringatan posisi:</strong> laporan ini adalah hasil screening awal otomatis. Ini BUKAN pendapat ahli dan BUKAN penetapan keaslian yang sah secara hukum. Tidak adanya temuan bukan bukti keaslian.</div>
      <h3>1 · Ringkasan eksekutif</h3>
      <p>Kategori kesimpulan: <strong>${esc(s.conclusion.label)}</strong>${s.partial ? " (pemeriksaan parsial)" : ""}. Temuan: ${res.findings.filter(f => f.severity === "critical").length} kritis, ${res.findings.filter(f => f.severity === "suspicious").length} mencurigakan, ${res.findings.filter(f => f.severity === "info").length} info. Cakupan pemeriksaan ${Math.round(s.coverage * 100)}%.</p>
      <h3>2 · Objek pemeriksaan &amp; integritas</h3>
      ${kvTable([["Berkas tersangka", esc(s.suspectFile.name)], ["Jenis", esc(KIND_LABEL[s.suspectKind])], ["Ukuran", humanSize(s.suspectFile.size)], ["SHA-256", `<span class="mono">${esc(s.suspectHash)}</span>`],
        ["Pembanding", s.refFile ? esc(s.refFile.name) + `<br><span class="mono">${esc(s.refHash)}</span>` : "Tidak ada"],
        ["Pemeriksa", esc(s.ctx.examiner || "—")], ["Jenis dokumen (konteks)", esc(s.ctx.type)], ["Penerbit (konteks)", esc(s.ctx.issuer || "—")]])}
      <h3>3 · Profil umur</h3>
      <p>Klaim: ${s.claimDate ? esc(C.fmtWIB(s.claimDate)) : "tidak tersedia"}. Bukti internal paling awal: ${evs.length ? esc(C.fmtWIB(evs[0].date)) : "—"}. Seluruh bukti waktu (${evs.length}):</p>
      ${kvTable(evs.map(t => [esc(C.fmtWIB(t.date)), `${esc(t.location)} · <span class="mono">${esc(t.source)}</span> · mentah: <span class="mono">${esc(t.rawValue)}</span> · keandalan ${esc(t.reliability)}`]))}
      <h3>4 · Temuan utama</h3>
      ${res.findings.length ? res.findings.map((f, i) => findingCard(f, i)).join("") : "<p>Tidak ada temuan.</p>"}
      <h3>5 · Kesimpulan &amp; rekomendasi rujukan</h3>
      <ol>${s.referral.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
      <h3>6 · Metodologi &amp; batasan ringkas</h3>
      <p>Analisis lokal di browser mengikuti Spesifikasi SalmanForensik v1.0 (aturan U/PF/DC/XL/IM/PB). Tidak diperiksa: umur fisik kertas/tinta, validasi kriptografis penuh tanda tangan digital, OCR foto dokumen, dan isi terenkripsi tanpa kata sandi. Data teknis lengkap tersedia pada berkas JSON pendamping ber-ID sama.</p>
      <p style="margin-top:24px" class="note">SalmanForensik — created by Ricco Abu Salman · Laporan ${esc(s.reportId)}</p>
    </div>`;
  }
  $("#btn-pdf").addEventListener("click", () => { buildPrintArea(); window.print(); });
  $("#btn-json").addEventListener("click", () => {
    const s = session, res = s.result;
    const data = {
      schemaVersion: "1.0",
      report: { id: s.reportId, generatedAt: new Date().toISOString(), appVersion: "1.0.0", rulesVersion: "1.0" },
      examinerContext: { docType: s.ctx.type, purpose: s.ctx.purpose, issuer: s.ctx.issuer, examiner: s.ctx.examiner },
      files: [{ role: "suspect", fileName: s.suspectFile.name, detectedType: s.suspectKind, sizeBytes: s.suspectFile.size, sha256: s.suspectHash, pageOrSheetCount: res.pageCount },
        ...(s.refFile ? [{ role: "reference", fileName: s.refFile.name, detectedType: s.refKind, sizeBytes: s.refFile.size, sha256: s.refHash }] : [])],
      timestamps: res.timestamps.filter(t => t.date).map(t => ({ source: t.source, location: t.location, rawValue: t.rawValue, normalizedUtc: t.date.toISOString(), role: t.role, reliability: t.reliability, note: t.note })),
      fonts: res.fonts, embeddedObjects: res.embedded.map(o => ({ kind: o.kind, location: o.location, sizeBytes: o.sizeBytes, sha256: o.sha256 || null })),
      meta: res.meta, findings: res.findings,
      comparison: s.comparison ? { relation: s.comparison.relation, hashEqual: s.comparison.hashEqual, lineageEqual: s.comparison.lineageEqual, sharedEmbeddedCount: s.comparison.sharedEmbedded.length } : null,
      conclusion: { category: s.conclusion.key, label: s.conclusion.label, coverageIndex: +s.coverage.toFixed(2), partial: s.partial },
      referral: s.referral,
      limitations: ["Screening awal otomatis — bukan penetapan keaslian.", "Umur fisik kertas/tinta tidak diperiksa.", "Validasi kriptografis penuh tanda tangan digital tidak dilakukan.", "OCR foto dokumen tidak dijalankan pada versi ini."],
      sensitivityNotice: "Berkas ini berisi metadata dan temuan pemeriksaan dokumen. Perlakukan sebagai data sensitif."
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `SalmanForensik-Teknis-${s.reportId}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  /* ---------- Hapus sesi ---------- */
  function wipeSession(ask) {
    if (ask && !confirm("Hapus seluruh sesi pemeriksaan ini? Berkas, hasil, dan isian akan dibersihkan dari memori browser.")) return;
    if (session && session.timerInt) clearInterval(session.timerInt);
    session = newSession();
    for (const id of ["#suspect-card", "#ref-card", "#suspect-warn", "#live-results", "#print-area"]) $(id).innerHTML = "";
    for (const id of ["#file-suspect", "#file-ref", "#ctx-issuer", "#ctx-examiner", "#ctx-claim"]) $(id).value = "";
    $("#btn-start").disabled = true;
    $("#view-progress").classList.add("hidden");
    $("#view-results").classList.add("hidden");
    $("#view-start").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("#btn-wipe").addEventListener("click", () => wipeSession(true));
  $("#btn-again").addEventListener("click", () => wipeSession(false));
})();
