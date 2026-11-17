/* SalmanForensik — sig-tests.mjs
 * Pengujian unit validasi kriptografis tanda tangan digital PDF (assets/sig.js).
 * Menguji SG-01 s/d SG-06, parser DER, WebCrypto RSA & ECDSA, serta ketahanan terhadap galat.
 * Jalankan: node tests/sig-tests.mjs */
import { createRequire } from "module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const C = require("../assets/core.js");
const SFSig = require("../assets/sig.js");

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✕ GAGAL: " + name + (extra ? " — " + extra : ""));
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-sig-test-"));

try {
  // 1. Siapkan kunci RSA dan sertifikat untuk pengujian
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${tmpDir}/rsa-key.pem" -out "${tmpDir}/rsa-cert.pem" -days 365 -nodes -subj "/C=ID/O=SalmanForensik/OU=Forensik/CN=Ricco Abu Salman" 2>/dev/null`);

  // Sertifikat kedaluwarsa (notAfter di masa lalu: 2020)
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${tmpDir}/exp-key.pem" -out "${tmpDir}/exp-cert.pem" -days 1 -nodes -subj "/C=ID/O=ExpiredCA/CN=Expired Signer" 2>/dev/null`);

  // Sertifikat EC (P-256)
  execSync(`openssl ecparam -name prime256v1 -genkey -noout -out "${tmpDir}/ec-key.pem" 2>/dev/null`);
  execSync(`openssl req -new -x509 -key "${tmpDir}/ec-key.pem" -out "${tmpDir}/ec-cert.pem" -days 365 -subj "/C=ID/O=EC Org/CN=EC Signer" 2>/dev/null`);

  // Generator PDF bertanda tangan
  function buildSignedPdf(opts = {}) {
    const hexLen = 8192;
    const zeroHex = "0".repeat(hexLen);

    const head = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
4 0 obj
<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached
   /ByteRange [0000000000 0000000000 0000000000 0000000000]
   /Contents <`;

    const extraAfterEof = opts.trailingBytes ? "\n% incremental update spoof\n5 0 obj\n<<>>\nendobj\n" : "";

    const tail = `>
   /M (D:20261117120000+07\x2700\x27)
>>
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000189 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
450
%%EOF
` + extraAfterEof;

    const b = Buffer.byteLength(head);
    const c = b + hexLen + 1;
    const d = Buffer.byteLength(tail) - 1 - Buffer.byteLength(extraAfterEof);

    const rangeStr = `[0 ${b} ${c} ${d}]`.padEnd(46, " ");
    const headWithRange = head.replace(/\[0000000000 0000000000 0000000000 0000000000\]/, `[${rangeStr.slice(1, -1)}]`);

    const initialPdf = Buffer.concat([
      Buffer.from(headWithRange),
      Buffer.from(zeroHex),
      Buffer.from(tail)
    ]);

    const part1 = initialPdf.subarray(0, b);
    const part2 = initialPdf.subarray(c, c + d);
    const dataToSign = Buffer.concat([part1, part2]);

    const toSignPath = path.join(tmpDir, "to-sign-" + Math.random().toString(36).slice(2) + ".bin");
    const cmsPath = path.join(tmpDir, "cms-" + Math.random().toString(36).slice(2) + ".der");
    fs.writeFileSync(toSignPath, dataToSign);

    const md = opts.hash || "sha256";
    const keyPem = opts.key || path.join(tmpDir, "rsa-key.pem");
    const certPem = opts.cert || path.join(tmpDir, "rsa-cert.pem");

    execSync(`openssl cms -sign -in "${toSignPath}" -signer "${certPem}" -inkey "${keyPem}" -outform DER -out "${cmsPath}" -binary -nosmimecap -md ${md}`);

    let cmsDer = fs.readFileSync(cmsPath);
    if (opts.corruptSig) {
      // Rusak byte tanda tangan kriptografis di akhir
      cmsDer = Buffer.from(cmsDer);
      cmsDer[cmsDer.length - 10] ^= 0xFF;
      cmsDer[cmsDer.length - 11] ^= 0xAA;
    }

    if (opts.expiredCert) {
      cmsDer = Buffer.from(cmsDer);
      let count = 0;
      for (let i = 0; i < cmsDer.length - 15; i++) {
        if (cmsDer[i] === 0x17 && cmsDer[i + 1] === 13) {
          count++;
          if (count === 2) { // notAfter
            cmsDer.write("200101000000Z", i + 2, 13, "latin1");
            break;
          }
        }
      }
    }

    if (opts.futureCert) {
      cmsDer = Buffer.from(cmsDer);
      let count = 0;
      for (let i = 0; i < cmsDer.length - 15; i++) {
        if (cmsDer[i] === 0x17 && cmsDer[i + 1] === 13) {
          count++;
          if (count === 1) { // notBefore
            cmsDer.write("350101000000Z", i + 2, 13, "latin1");
            break;
          }
        }
      }
    }

    const cmsHex = cmsDer.toString("hex").padEnd(hexLen, "0");

    let finalPdf = Buffer.concat([
      Buffer.from(headWithRange),
      Buffer.from(cmsHex),
      Buffer.from(tail)
    ]);

    if (opts.tamperContent) {
      // Modifikasi konten berkas di dalam jangkauan tanda tangan
      finalPdf = Buffer.from(finalPdf);
      const modPos = 20; // di dalam obj 1
      finalPdf[modPos] = finalPdf[modPos] === 0x41 ? 0x42 : 0x41;
    }

    return finalPdf;
  }

  console.log("Kasus 1: Tanda tangan valid RSA (SHA-256):");
  const pdf1 = buildSignedPdf();
  const res1 = await SFSig.analyzeSignatures(pdf1.buffer.slice(pdf1.byteOffset, pdf1.byteOffset + pdf1.byteLength));
  t("Tanda tangan terdeteksi", res1.signatures.length === 1);
  t("signerCN terbaca", res1.signatures[0]?.signerCN === "Ricco Abu Salman");
  t("signerOrg terbaca", res1.signatures[0]?.signerOrg === "SalmanForensik");
  t("integritas ok", res1.signatures[0]?.integrity === "ok");
  t("sigValid true", res1.signatures[0]?.sigValid === true);
  t("coversWholeFile true", res1.signatures[0]?.coversWholeFile === true);
  t("SG-03 info muncul", res1.findings.some(f => f.ruleId === "SG-03" && f.severity === "info"));
  t("Tidak ada temuan kritis", !res1.findings.some(f => f.severity === "critical"));

  console.log("\nKasus 2: Dokumen diubah setelah ditandatangani (SG-01):");
  const pdf2 = buildSignedPdf({ tamperContent: true });
  const res2 = await SFSig.analyzeSignatures(pdf2.buffer.slice(pdf2.byteOffset, pdf2.byteOffset + pdf2.byteLength));
  t("integritas fail", res2.signatures[0]?.integrity === "fail");
  t("SG-01 kritis terdeteksi", res2.findings.some(f => f.ruleId === "SG-01" && f.severity === "critical"));

  console.log("\nKasus 3: Tanda tangan rusak / kriptografis gagal (SG-02):");
  const pdf3 = buildSignedPdf({ corruptSig: true });
  const res3 = await SFSig.analyzeSignatures(pdf3.buffer.slice(pdf3.byteOffset, pdf3.byteOffset + pdf3.byteLength));
  t("sigValid false", res3.signatures[0]?.sigValid === false);
  t("SG-02 kritis terdeteksi", res3.findings.some(f => f.ruleId === "SG-02" && f.severity === "critical"));

  console.log("\nKasus 4: Algoritma hash lemah SHA-1 (SG-04):");
  const pdf4 = buildSignedPdf({ hash: "sha1" });
  const res4 = await SFSig.analyzeSignatures(pdf4.buffer.slice(pdf4.byteOffset, pdf4.byteOffset + pdf4.byteLength));
  t("digestAlg SHA-1", res4.signatures[0]?.digestAlg === "SHA-1");
  t("SG-04 suspicious terdeteksi", res4.findings.some(f => f.ruleId === "SG-04" && f.severity === "suspicious"));

  console.log("\nKasus 5: Konten di luar jangkauan tanda tangan (SG-06):");
  const pdf5 = buildSignedPdf({ trailingBytes: true });
  const res5 = await SFSig.analyzeSignatures(pdf5.buffer.slice(pdf5.byteOffset, pdf5.byteOffset + pdf5.byteLength));
  t("coversWholeFile false", res5.signatures[0]?.coversWholeFile === false);
  t("SG-06 info bila integritas utuh (kalibrasi 2026-11-17)", res5.findings.some(f => f.ruleId === "SG-06" && f.severity === "info"));

  console.log("\nKasus 5b: Konten di luar jangkauan + integritas gagal (SG-06 suspicious):");
  const pdf5b = buildSignedPdf({ trailingBytes: true, tamperContent: true });
  const res5b = await SFSig.analyzeSignatures(pdf5b.buffer.slice(pdf5b.byteOffset, pdf5b.byteOffset + pdf5b.byteLength));
  t("SG-06 suspicious bila integritas gagal", res5b.findings.some(f => f.ruleId === "SG-06" && f.severity === "suspicious"));

  console.log("\nKasus 6: Tanda tangan ECDSA (P-256):");
  const pdf6 = buildSignedPdf({
    key: path.join(tmpDir, "ec-key.pem"),
    cert: path.join(tmpDir, "ec-cert.pem")
  });
  const res6 = await SFSig.analyzeSignatures(pdf6.buffer.slice(pdf6.byteOffset, pdf6.byteOffset + pdf6.byteLength));
  t("signerCN ECDSA terbaca", res6.signatures[0]?.signerCN === "EC Signer");
  t("integritas ECDSA ok", res6.signatures[0]?.integrity === "ok");
  t("sigValid ECDSA true", res6.signatures[0]?.sigValid === true);
  t("SG-03 info muncul untuk ECDSA", res6.findings.some(f => f.ruleId === "SG-03"));

  console.log("\nKasus 7: Blob CMS tidak dapat diparse / rusak total:");
  const corruptedBuf = new TextEncoder().encode("%PDF-1.4 /ByteRange [0 10 20 10] /Contents <DEADBEEFCAFE>");
  const res7 = await SFSig.analyzeSignatures(corruptedBuf.buffer);
  t("signatures kosong bila parse gagal", Array.isArray(res7.signatures) && res7.signatures.length === 0);
  t("findings kosong tanpa temuan SG", Array.isArray(res7.findings) && res7.findings.length === 0);

  console.log("\nKasus 8: Sertifikat kedaluwarsa pada signingTime (SG-05):");
  const pdf8 = buildSignedPdf({ expiredCert: true });
  const res8 = await SFSig.analyzeSignatures(pdf8.buffer.slice(pdf8.byteOffset, pdf8.byteOffset + pdf8.byteLength));
  t("SG-05 kedaluwarsa terdeteksi", res8.findings.some(f => f.ruleId === "SG-05" && f.title.includes("kedaluwarsa")));

  console.log("\nKasus 9: Sertifikat belum berlaku pada signingTime (SG-05):");
  const pdf9 = buildSignedPdf({ futureCert: true });
  const res9 = await SFSig.analyzeSignatures(pdf9.buffer.slice(pdf9.byteOffset, pdf9.byteOffset + pdf9.byteLength));
  t("SG-05 belum berlaku terdeteksi", res9.findings.some(f => f.ruleId === "SG-05" && f.title.includes("belum berlaku")));

} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\nHasil sig-tests: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
