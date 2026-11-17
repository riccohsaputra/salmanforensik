/* SalmanForensik — ocr.js
 * Modul OCR (Optical Character Recognition) untuk dokumen hasil scan & gambar.
 * Memakai Tesseract.js v5 yang dimuat lazy dari CDN jsDelivr saat dibutuhkan.
 * Pengenalan berjalan lokal di browser (WASM) tanpa mengirim data ke server. */
(function (global) {
  "use strict";

  const SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const WORKER_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
  const CORE_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5";
  const LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";
  const LANG = "ind+eng";

  let tesseractPromise = null;

  function isLoaded() {
    return Boolean(global.Tesseract && typeof global.Tesseract.recognize === "function");
  }

  function loadTesseract() {
    if (isLoaded()) {
      return Promise.resolve(global.Tesseract);
    }
    if (tesseractPromise) return tesseractPromise;

    if (typeof document === "undefined" || !document.createElement) {
      return Promise.reject(new Error("Lingkungan DOM (document) tidak tersedia untuk memuat Tesseract.js"));
    }

    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        if (isLoaded()) {
          resolve(global.Tesseract);
        } else {
          tesseractPromise = null;
          reject(new Error("Tesseract.js dimuat tetapi objek Tesseract tidak tersedia"));
        }
      };
      script.onerror = () => {
        tesseractPromise = null;
        reject(new Error("Gagal mengunduh Tesseract.js dari CDN (periksa koneksi internet)"));
      };
      document.head.appendChild(script);
    });

    return tesseractPromise;
  }

  async function recognizePdf(pdfDoc) {
    if (!pdfDoc || !pdfDoc.numPages) {
      return { text: "", confidence: 0, pages: 0, capped: false };
    }
    await loadTesseract();
    const maxPages = Math.min(pdfDoc.numPages, 5);
    const capped = pdfDoc.numPages > 5;
    const texts = [];
    const confidences = [];

    for (let i = 1; i <= maxPages; i++) {
      if (typeof global.SFProgress === "function") {
        global.SFProgress(`OCR halaman ${i} dari ${maxPages}…`);
      }
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) || canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const res = await global.Tesseract.recognize(canvas, LANG, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH
      });

      const pageText = (res && res.data && res.data.text) ? res.data.text : "";
      const pageConf = (res && res.data && typeof res.data.confidence === "number") ? res.data.confidence : 0;
      texts.push(pageText);
      confidences.push(pageConf);

      canvas.width = 0;
      canvas.height = 0;
    }

    const text = texts.join("\n\n").trim();
    const confidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    return { text, confidence, pages: maxPages, capped };
  }

  async function recognizeImage(buf, kind) {
    await loadTesseract();
    if (typeof global.SFProgress === "function") {
      global.SFProgress("Menjalankan OCR pada gambar…");
    }
    const mime = kind === "png" ? "image/png" : "image/jpeg";
    const blob = new Blob([buf], { type: mime });
    const url = URL.createObjectURL(blob);
    try {
      const res = await global.Tesseract.recognize(url, LANG, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH
      });
      const text = (res && res.data && res.data.text) ? res.data.text.trim() : "";
      const confidence = (res && res.data && typeof res.data.confidence === "number") ? res.data.confidence : 0;
      return { text, confidence, pages: 1, capped: false };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const api = { recognizePdf, recognizeImage, isLoaded };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SFOCR = api;
})(typeof window !== "undefined" ? window : globalThis);
