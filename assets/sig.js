/* SalmanForensik — sig.js
 * Modul validasi kriptografis tanda tangan digital PDF (100% client-side WebCrypto).
 * Parser ASN.1/DER & CMS X.509 SignedData minimal tanpa dependensi pihak ketiga.
 * Aturan temuan: SG-01..SG-06 (kategori: "tanda-tangan"). */
(function (global) {
  "use strict";

  /* ================= Utilitas Format & Konversi ================= */
  function latin1(buf, start, len) {
    const u8 = new Uint8Array(buf, start || 0, len || buf.byteLength);
    let s = "";
    const CH = 32768;
    for (let i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return s;
  }

  function hexToBytes(hex) {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "");
    const len = clean.length;
    if (len === 0) return new Uint8Array(0);
    const u8 = new Uint8Array(Math.ceil(len / 2));
    for (let i = 0; i < len; i += 2) {
      const byteHex = (i + 1 < len) ? clean.slice(i, i + 2) : clean[i] + "0";
      u8[i >> 1] = parseInt(byteHex, 16);
    }
    return u8;
  }

  function bytesToHex(bytes) {
    if (!bytes) return "";
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
      s += bytes[i].toString(16).padStart(2, "0");
    }
    return s;
  }

  function arraysEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function fmtDate(d) {
    if (!d) return "";
    if (global.SFCore && typeof global.SFCore.fmtWIB === "function") {
      return global.SFCore.fmtWIB(d);
    }
    return d.toISOString();
  }

  function finding(ruleId, severity, category, title, location, observed, explanation, confidence) {
    return {
      ruleId,
      severity,
      category,
      title,
      location,
      observed,
      explanation,
      method: "Pemeriksaan SalmanForensik " + ruleId,
      confidence: confidence || "high"
    };
  }

  /* ================= Peta Algoritma & OID ================= */
  const OID_DIGEST = {
    "2.16.840.1.101.3.4.2.1": "SHA-256",
    "2.16.840.1.101.3.4.2.2": "SHA-384",
    "2.16.840.1.101.3.4.2.3": "SHA-512",
    "1.3.14.3.2.26": "SHA-1",
    "2.16.840.1.101.3.4.2.4": "SHA-224"
  };

  const OID_SIG_TO_HASH = {
    "1.2.840.113549.1.1.11": "SHA-256",
    "1.2.840.113549.1.1.12": "SHA-384",
    "1.2.840.113549.1.1.13": "SHA-512",
    "1.2.840.113549.1.1.5": "SHA-1",
    "1.2.840.10045.4.3.2": "SHA-256",
    "1.2.840.10045.4.3.3": "SHA-384",
    "1.2.840.10045.4.3.4": "SHA-512",
    "1.2.840.10045.4.1": "SHA-1"
  };

  /* ================= Parser ASN.1 / DER ================= */
  function parseDer(bytes, start, end) {
    start = start || 0;
    end = end === undefined ? bytes.length : end;
    let offset = start;
    if (offset >= end) return null;

    const headerOffset = offset;
    const tag = bytes[offset++];
    if (offset > end) return null;

    if ((tag & 0x1F) === 0x1F) {
      while (offset < end && (bytes[offset] & 0x80) !== 0) offset++;
      if (offset >= end) return null;
      offset++;
    }

    if (offset >= end) return null;
    const b = bytes[offset++];
    let length = 0;
    let endOffset = 0;

    if (b === 0x80) {
      // Indefinite length (BER)
      let scan = offset;
      let depth = 1;
      let found = false;
      while (scan < end - 1) {
        if (bytes[scan] === 0 && bytes[scan + 1] === 0) {
          depth--;
          if (depth === 0) {
            length = scan - offset;
            endOffset = scan + 2;
            found = true;
            break;
          }
          scan += 2;
        } else {
          scan++;
        }
      }
      if (!found) return null;
    } else if ((b & 0x80) === 0) {
      length = b;
      endOffset = offset + length;
    } else {
      const numBytes = b & 0x7F;
      if (numBytes === 0 || offset + numBytes > end) return null;
      for (let i = 0; i < numBytes; i++) {
        length = (length * 256) + bytes[offset++];
      }
      endOffset = offset + length;
    }

    if (endOffset > end) return null;

    return {
      tag,
      constructed: (tag & 0x20) !== 0,
      headerOffset,
      offset,
      length,
      endOffset,
      raw: bytes.subarray(offset, offset + length),
      der: bytes.subarray(headerOffset, endOffset)
    };
  }

  function parseChildren(bytes, start, end) {
    const children = [];
    let cur = start;
    while (cur < end) {
      if (bytes[cur] === 0 && cur + 1 < end && bytes[cur + 1] === 0) {
        cur += 2;
        continue;
      }
      const node = parseDer(bytes, cur, end);
      if (!node || node.endOffset <= cur) break;
      children.push(node);
      cur = node.endOffset;
    }
    return children;
  }

  function parseOid(bytes) {
    if (!bytes || bytes.length === 0) return "";
    const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
    let val = 0;
    for (let i = 1; i < bytes.length; i++) {
      val = (val * 128) + (bytes[i] & 0x7F);
      if ((bytes[i] & 0x80) === 0) {
        parts.push(val);
        val = 0;
      }
    }
    return parts.join(".");
  }

  function parseAsn1String(node) {
    if (!node || !node.raw) return "";
    if (node.tag === 0x1E) { // BMPString (UTF-16BE)
      let s = "";
      for (let i = 0; i < node.raw.length; i += 2) {
        s += String.fromCharCode((node.raw[i] << 8) | (node.raw[i + 1] || 0));
      }
      return s;
    }
    try {
      return new TextDecoder("utf-8").decode(node.raw);
    } catch (e) {
      return String.fromCharCode.apply(null, node.raw);
    }
  }

  function parseAsn1Date(bytes) {
    if (!bytes || bytes.length === 0) return null;
    const str = String.fromCharCode.apply(null, bytes);
    // UTCTime: YYMMDDHHMMSSZ or YYMMDDHHMMZ
    const mUtc = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?([Z+-].*)?$/.exec(str);
    if (mUtc) {
      let year = parseInt(mUtc[1], 10);
      year += year >= 50 ? 1900 : 2000;
      const month = parseInt(mUtc[2], 10) - 1;
      const day = parseInt(mUtc[3], 10);
      const hour = parseInt(mUtc[4], 10);
      const min = parseInt(mUtc[5], 10);
      const sec = mUtc[6] ? parseInt(mUtc[6], 10) : 0;
      return new Date(Date.UTC(year, month, day, hour, min, sec));
    }
    // GeneralizedTime: YYYYMMDDHHMMSS...
    const mGen = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?([Z+-].*)?$/.exec(str);
    if (mGen) {
      const year = parseInt(mGen[1], 10);
      const month = parseInt(mGen[2], 10) - 1;
      const day = parseInt(mGen[3], 10);
      const hour = parseInt(mGen[4], 10);
      const min = parseInt(mGen[5], 10);
      const sec = parseInt(mGen[6], 10);
      return new Date(Date.UTC(year, month, day, hour, min, sec));
    }
    return null;
  }

  function parseName(nameNode, bytes) {
    const info = { cn: "", o: "", ou: "", c: "", parts: [] };
    if (!nameNode) return info;
    const rdnSets = parseChildren(bytes, nameNode.offset, nameNode.endOffset);
    for (const rdnSet of rdnSets) {
      const atvs = parseChildren(bytes, rdnSet.offset, rdnSet.endOffset);
      for (const atv of atvs) {
        const atvChildren = parseChildren(bytes, atv.offset, atv.endOffset);
        if (atvChildren.length >= 2) {
          const oid = parseOid(atvChildren[0].raw);
          const val = parseAsn1String(atvChildren[1]);
          if (oid === "2.5.4.3") {
            info.cn = val;
            info.parts.push("CN=" + val);
          } else if (oid === "2.5.4.10") {
            info.o = val;
            info.parts.push("O=" + val);
          } else if (oid === "2.5.4.11") {
            info.ou = val;
            info.parts.push("OU=" + val);
          } else if (oid === "2.5.4.6") {
            info.c = val;
            info.parts.push("C=" + val);
          } else if (val) {
            info.parts.push(val);
          }
        }
      }
    }
    info.str = info.parts.join(", ");
    return info;
  }

  function parseCertificates(certSetNode, bytes) {
    const certs = [];
    if (!certSetNode) return certs;
    const certNodes = parseChildren(bytes, certSetNode.offset, certSetNode.endOffset);
    for (const certNode of certNodes) {
      if (certNode.tag !== 0x30) continue;
      const certChildren = parseChildren(bytes, certNode.offset, certNode.endOffset);
      if (certChildren.length < 3) continue;

      const tbsNode = certChildren[0];
      const certSigAlgNode = certChildren[1];

      const tbsChildren = parseChildren(bytes, tbsNode.offset, tbsNode.endOffset);
      let tbsIdx = 0;
      if (tbsChildren[tbsIdx] && tbsChildren[tbsIdx].tag === 0xA0) {
        tbsIdx++; // version
      }
      if (tbsIdx >= tbsChildren.length) continue;

      const serialNode = tbsChildren[tbsIdx++];
      const serial = bytesToHex(serialNode.raw);

      const sigAlgNode = tbsChildren[tbsIdx++];
      const sigAlgChildren = parseChildren(bytes, sigAlgNode.offset, sigAlgNode.endOffset);
      const sigAlgOid = sigAlgChildren.length ? parseOid(sigAlgChildren[0].raw) : "";

      const issuerNode = tbsChildren[tbsIdx++];
      const issuer = parseName(issuerNode, bytes);

      const valNode = tbsChildren[tbsIdx++];
      const valChildren = parseChildren(bytes, valNode.offset, valNode.endOffset);
      const notBefore = valChildren.length > 0 ? parseAsn1Date(valChildren[0].raw) : null;
      const notAfter = valChildren.length > 1 ? parseAsn1Date(valChildren[1].raw) : null;

      const subjectNode = tbsChildren[tbsIdx++];
      const subject = parseName(subjectNode, bytes);

      const spkiNode = tbsChildren[tbsIdx++];
      const spkiDer = spkiNode.der;
      const spkiChildren = parseChildren(bytes, spkiNode.offset, spkiNode.endOffset);
      const spkiAlgChildren = parseChildren(bytes, spkiChildren[0].offset, spkiChildren[0].endOffset);
      const spkiAlgOid = spkiAlgChildren.length ? parseOid(spkiAlgChildren[0].raw) : "";
      let curveOid = "";
      if (spkiAlgChildren.length > 1 && spkiAlgChildren[1].tag === 0x06) {
        curveOid = parseOid(spkiAlgChildren[1].raw);
      }

      certs.push({
        serial,
        issuer,
        subject,
        notBefore,
        notAfter,
        sigAlgOid,
        spkiAlgOid,
        curveOid,
        spkiDer
      });
    }
    return certs;
  }

  function derEcdsaToRaw(sigDer, coordLen) {
    const root = parseDer(sigDer, 0, sigDer.length);
    if (!root || root.tag !== 0x30) return null;
    const children = parseChildren(sigDer, root.offset, root.endOffset);
    if (children.length < 2) return null;

    function toPadded(bytes, len) {
      let start = 0;
      while (start < bytes.length - 1 && bytes[start] === 0) start++;
      const trimmed = bytes.subarray(start);
      if (trimmed.length > len) return null;
      const out = new Uint8Array(len);
      out.set(trimmed, len - trimmed.length);
      return out;
    }

    const r = toPadded(children[0].raw, coordLen);
    const s = toPadded(children[1].raw, coordLen);
    if (!r || !s) return null;

    const raw = new Uint8Array(coordLen * 2);
    raw.set(r, 0);
    raw.set(s, coordLen);
    return raw;
  }

  /* ================= Validasi Kriptografis CMS ================= */
  async function parseAndVerifyCms(cmsBytes, buf, a, b, c, d, subFilter, mDateStr) {
    const ciNode = parseDer(cmsBytes, 0, cmsBytes.length);
    if (!ciNode || ciNode.tag !== 0x30) return null;

    const ciChildren = parseChildren(cmsBytes, ciNode.offset, ciNode.endOffset);
    if (ciChildren.length < 2) return null;

    const contentTypeOid = parseOid(ciChildren[0].raw);
    if (contentTypeOid !== "1.2.840.113549.1.7.2") return null; // pkcs7-signedData

    let sdNode = ciChildren[1];
    if (sdNode.tag === 0xA0) {
      const inner = parseDer(cmsBytes, sdNode.offset, sdNode.endOffset);
      if (inner && inner.tag === 0x30) sdNode = inner;
    }
    if (sdNode.tag !== 0x30) return null;

    const sdChildren = parseChildren(cmsBytes, sdNode.offset, sdNode.endOffset);
    if (sdChildren.length < 3) return null;

    let certSetNode = null;
    let siSetNode = null;
    for (let i = 3; i < sdChildren.length; i++) {
      const ch = sdChildren[i];
      if (ch.tag === 0xA0 && !certSetNode) {
        certSetNode = ch;
      } else if (ch.tag === 0x31) {
        siSetNode = ch;
      }
    }

    const certificates = certSetNode ? parseCertificates(certSetNode, cmsBytes) : [];
    if (!siSetNode) return null;

    const siNodes = parseChildren(cmsBytes, siSetNode.offset, siSetNode.endOffset);
    if (siNodes.length === 0) return null;

    const siNode = siNodes[0];
    const siChildren = parseChildren(cmsBytes, siNode.offset, siNode.endOffset);
    if (siChildren.length < 4) return null;

    let siIdx = 0;
    const siVersion = siChildren[siIdx++].raw[0];

    const sidNode = siChildren[siIdx++];
    let sidIssuer = "";
    let sidSerial = "";
    if (sidNode.tag === 0x30) {
      const sidChildren = parseChildren(cmsBytes, sidNode.offset, sidNode.endOffset);
      if (sidChildren.length >= 2) {
        sidIssuer = parseName(sidChildren[0], cmsBytes).str;
        sidSerial = bytesToHex(sidChildren[1].raw);
      }
    } else if (sidNode.tag === 0x80) {
      sidSerial = bytesToHex(sidNode.raw);
    }

    const daNode = siChildren[siIdx++];
    const daChildren = parseChildren(cmsBytes, daNode.offset, daNode.endOffset);
    const digestAlgOid = daChildren.length ? parseOid(daChildren[0].raw) : "";

    let signedAttrsNode = null;
    if (siIdx < siChildren.length && siChildren[siIdx].tag === 0xA0) {
      signedAttrsNode = siChildren[siIdx++];
    }

    if (siIdx >= siChildren.length) return null;
    const saNode = siChildren[siIdx++];
    const saChildren = parseChildren(cmsBytes, saNode.offset, saNode.endOffset);
    const sigAlgOid = saChildren.length ? parseOid(saChildren[0].raw) : "";

    if (siIdx >= siChildren.length) return null;
    const sigValNode = siChildren[siIdx++];
    const signatureBytes = sigValNode.raw;

    let unsignedAttrsNode = null;
    if (siIdx < siChildren.length && siChildren[siIdx].tag === 0xA1) {
      unsignedAttrsNode = siChildren[siIdx++];
    }

    let messageDigest = null;
    let signingTime = null;
    if (signedAttrsNode) {
      const attrNodes = parseChildren(cmsBytes, signedAttrsNode.offset, signedAttrsNode.endOffset);
      for (const attr of attrNodes) {
        const attrChildren = parseChildren(cmsBytes, attr.offset, attr.endOffset);
        if (attrChildren.length >= 2) {
          const oid = parseOid(attrChildren[0].raw);
          const valSet = attrChildren[1];
          const valChildren = parseChildren(cmsBytes, valSet.offset, valSet.endOffset);
          if (valChildren.length > 0) {
            if (oid === "1.2.840.113549.1.9.4") {
              messageDigest = valChildren[0].raw;
            } else if (oid === "1.2.840.113549.1.9.5") {
              signingTime = parseAsn1Date(valChildren[0].raw);
            }
          }
        }
      }
    }

    if (!signingTime && mDateStr) {
      if (global.SFCore && typeof global.SFCore.parsePdfDate === "function") {
        signingTime = global.SFCore.parsePdfDate(mDateStr);
      }
    }

    let tsaTime = null;
    if (unsignedAttrsNode) {
      const uAttrNodes = parseChildren(cmsBytes, unsignedAttrsNode.offset, unsignedAttrsNode.endOffset);
      for (const attr of uAttrNodes) {
        const attrChildren = parseChildren(cmsBytes, attr.offset, attr.endOffset);
        if (attrChildren.length >= 2) {
          const oid = parseOid(attrChildren[0].raw);
          if (oid === "1.2.840.113549.1.9.6") { // signatureTimeStampToken
            try {
              const valSet = attrChildren[1];
              const valChildren = parseChildren(cmsBytes, valSet.offset, valSet.endOffset);
              if (valChildren.length > 0) {
                const tsaCi = valChildren[0];
                const tsaCiChildren = parseChildren(cmsBytes, tsaCi.offset, tsaCi.endOffset);
                if (tsaCiChildren.length >= 2) {
                  let tsaSd = tsaCiChildren[1];
                  if (tsaSd.tag === 0xA0) {
                    const inner = parseDer(cmsBytes, tsaSd.offset, tsaSd.endOffset);
                    if (inner && inner.tag === 0x30) tsaSd = inner;
                  }
                  const tsaSdChildren = parseChildren(cmsBytes, tsaSd.offset, tsaSd.endOffset);
                  if (tsaSdChildren.length > 2) {
                    const encap = tsaSdChildren[2];
                    const encapChildren = parseChildren(cmsBytes, encap.offset, encap.endOffset);
                    if (encapChildren.length > 1) {
                      const eContent = encapChildren[1];
                      let tstBytes = eContent.raw;
                      if (eContent.tag === 0xA0) {
                        const inner = parseDer(cmsBytes, eContent.offset, eContent.endOffset);
                        if (inner) tstBytes = inner.raw;
                      }
                      if (tstBytes) {
                        const tst = parseDer(tstBytes, 0, tstBytes.length);
                        if (tst && tst.tag === 0x30) {
                          const tstChildren = parseChildren(tstBytes, tst.offset, tst.endOffset);
                          for (const ch of tstChildren) {
                            if (ch.tag === 0x18) {
                              tsaTime = parseAsn1Date(ch.raw);
                              break;
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            } catch (e) { /* abaikan error ekstraksi TSA */ }
          }
        }
      }
    }

    let signerCert = null;
    if (sidSerial) {
      const normSidSerial = sidSerial.replace(/^0+/, "").toLowerCase();
      signerCert = certificates.find(c => c.serial.replace(/^0+/, "").toLowerCase() === normSidSerial);
    }
    if (!signerCert && certificates.length === 1) {
      signerCert = certificates[0];
    }

    const signerCN = signerCert ? (signerCert.subject.cn || signerCert.subject.str) : "";
    const signerOrg = signerCert ? (signerCert.subject.o || "") : "";
    const issuer = signerCert ? (signerCert.issuer.str || signerCert.issuer.cn) : sidIssuer;
    const serial = signerCert ? signerCert.serial : sidSerial;
    const notBefore = signerCert ? signerCert.notBefore : null;
    const notAfter = signerCert ? signerCert.notAfter : null;

    let chainTop = "";
    if (signerCert) {
      let curr = signerCert;
      const visited = new Set();
      while (curr && !visited.has(curr)) {
        visited.add(curr);
        const isSelfSigned = curr.issuer.str && curr.subject.str && (curr.issuer.str === curr.subject.str);
        if (isSelfSigned) {
          chainTop = curr.issuer.cn || curr.issuer.o || curr.issuer.str;
          break;
        }
        const parent = certificates.find(c => c !== curr && c.subject.str && c.subject.str === curr.issuer.str);
        if (parent) {
          curr = parent;
        } else {
          chainTop = curr.issuer.cn || curr.issuer.o || curr.issuer.str;
          break;
        }
      }
    }

    /* Koreksi supervisor 2026-11-17: JANGAN default ke SHA-256 bila OID tidak
       dikenal (mis. MD5) — hash yang ditebak membuat uji integritas salah
       menyimpulkan "fail" (SG-01 kritis palsu). Tidak dikenal = tidak diuji. */
    const digestAlg = OID_DIGEST[digestAlgOid] || OID_SIG_TO_HASH[sigAlgOid] || null;

    // 5. Uji Integritas
    let integrity = "unknown";
    if (a >= 0 && b > 0 && c >= a + b && d > 0 && c + d <= buf.byteLength && messageDigest) {
      const combined = new Uint8Array(b + d);
      combined.set(new Uint8Array(buf, a, b), 0);
      combined.set(new Uint8Array(buf, c, d), b);

      if (["SHA-256", "SHA-384", "SHA-512", "SHA-1"].includes(digestAlg)) {
        try {
          const calcHash = new Uint8Array(await crypto.subtle.digest(digestAlg, combined));
          integrity = arraysEqual(calcHash, messageDigest) ? "ok" : "fail";
        } catch (e) {
          integrity = "unknown";
        }
      }
    }

    // 6. Verifikasi Tanda Tangan
    /* Koreksi supervisor 2026-11-17: kegagalan MEMPROSES (algoritma tak didukung
       WebCrypto seperti RSA-PSS / SHA-224, kurva eksotis) BUKAN bukti tanda tangan
       tidak valid — status harus "tidak dapat dipastikan" (null), bukan false.
       SG-02 kritis hanya bila verify() sungguhan mengembalikan false atau nilai
       tanda tangan ECDSA-nya sendiri rusak bentuk. */
    let sigValid = null;
    const supportedHash = ["SHA-256", "SHA-384", "SHA-512", "SHA-1"].includes(digestAlg);
    const isPss = sigAlgOid === "1.2.840.113549.1.1.10" ||
      (signerCert && signerCert.spkiAlgOid === "1.2.840.113549.1.1.10");
    if (signedAttrsNode && signerCert && signerCert.spkiDer && supportedHash && !isPss) {
      try {
        const signedDataBytes = new Uint8Array(signedAttrsNode.der);
        signedDataBytes[0] = 0x31; // 0xA0 -> 0x31 (SET OF)

        const isEc = signerCert.spkiAlgOid === "1.2.840.10045.2.1" || sigAlgOid.startsWith("1.2.840.10045.");
        if (isEc) {
          let namedCurve = "P-256";
          let coordLen = 32;
          if (signerCert.curveOid === "1.3.132.0.34") { namedCurve = "P-384"; coordLen = 48; }
          else if (signerCert.curveOid === "1.3.132.0.35") { namedCurve = "P-521"; coordLen = 66; }

          const rawSig = derEcdsaToRaw(signatureBytes, coordLen);
          if (!rawSig) {
            sigValid = false; // nilai tanda tangan rusak bentuk
          } else {
            let key = null;
            try {
              key = await crypto.subtle.importKey(
                "spki",
                signerCert.spkiDer,
                { name: "ECDSA", namedCurve },
                false,
                ["verify"]
              );
            } catch (e) { key = null; }
            if (key) {
              try {
                sigValid = await crypto.subtle.verify(
                  { name: "ECDSA", hash: { name: digestAlg } },
                  key,
                  rawSig,
                  signedDataBytes
                );
              } catch (e) { sigValid = null; }
            }
          }
        } else {
          // RSA PKCS#1 v1.5
          let key = null;
          try {
            key = await crypto.subtle.importKey(
              "spki",
              signerCert.spkiDer,
              { name: "RSASSA-PKCS1-v1_5", hash: { name: digestAlg } },
              false,
              ["verify"]
            );
          } catch (e) { key = null; }
          if (key) {
            try {
              sigValid = await crypto.subtle.verify(
                "RSASSA-PKCS1-v1_5",
                key,
                signatureBytes,
                signedDataBytes
              );
            } catch (e) { sigValid = null; }
          }
        }
      } catch (err) {
        sigValid = null;
      }
    }

    // coversWholeFile: ByteRange menjangkau EOF
    let coversWholeFile = true;
    const endOffset = c + d;
    if (endOffset < buf.byteLength) {
      const trailing = new Uint8Array(buf, endOffset);
      for (let i = 0; i < trailing.length; i++) {
        const bByte = trailing[i];
        if (bByte !== 0x20 && bByte !== 0x09 && bByte !== 0x0A && bByte !== 0x0D && bByte !== 0x00) {
          coversWholeFile = false;
          break;
        }
      }
    }

    return {
      subFilter,
      signerCN,
      signerOrg,
      issuer,
      serial,
      notBefore,
      notAfter,
      signingTime,
      tsaTime,
      digestAlg: digestAlg || ("Tidak dikenal (OID " + digestAlgOid + ")"),
      integrity,
      sigValid,
      chainTop,
      coversWholeFile,
      byteRangeEnd: endOffset
    };
  }

  /* ================= Fungsi Utama: analyzeSignatures ================= */
  async function analyzeSignatures(buf) {
    const text = latin1(buf);
    const signatures = [];
    const findings = [];

    // 1. Cari SEMUA kemunculan /ByteRange [a b c d]
    const byteRangeRe = /\/ByteRange\s*\[\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\]/g;
    let match;
    while ((match = byteRangeRe.exec(text)) !== null) {
      const a = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      const c = parseInt(match[3], 10);
      const d = parseInt(match[4], 10);
      const matchIdx = match.index;

      let hexString = "";
      if (a >= 0 && b > 0 && c > a + b && c <= buf.byteLength) {
        const between = text.slice(a + b, c);
        const mBetween = /<([0-9a-fA-F\s\r\n]+)>/.exec(between);
        if (mBetween) hexString = mBetween[1];
      }

      /* Kamus tanda tangan terbelah oleh blob /Contents yang bisa puluhan KB:
         /M & /SubFilter lazim tepat SEBELUM celah hex, /ByteRange sesudahnya
         (kasus nyata BSrE: jarak /M ke /ByteRange ±65 KB). Jendela pencarian =
         kawasan sebelum celah + sekitar /ByteRange + kawasan sesudah celah. */
      const win = text.slice(Math.max(0, a + b - 16384), a + b) + "\n" +
        text.slice(Math.max(0, matchIdx - 4096), Math.min(text.length, matchIdx + 4096)) + "\n" +
        text.slice(c, Math.min(text.length, c + 16384));

      if (!hexString) {
        const mContents = /\/Contents\s*<([0-9a-fA-F\s\r\n]+)>/.exec(win);
        if (mContents) hexString = mContents[1];
      }

      const mSubFilter = /\/SubFilter\s*\/([^\s\/\[\]<>()]+)/.exec(win);
      const subFilter = mSubFilter ? mSubFilter[1] : "";

      const mM = /\/M\s*\((D:[^)]*)\)/.exec(win);
      const mDateStr = mM ? mM[1] : null;

      if (!hexString) continue;

      const cmsBytes = hexToBytes(hexString);
      if (!cmsBytes || cmsBytes.length === 0) continue;

      let sigObj = null;
      try {
        sigObj = await parseAndVerifyCms(cmsBytes, buf, a, b, c, d, subFilter, mDateStr);
      } catch (err) {
        sigObj = null;
      }

      if (!sigObj) continue;

      signatures.push(sigObj);

      // SG-01: Dokumen berubah setelah ditandatangani — integritas tanda tangan gagal
      if (sigObj.integrity === "fail") {
        findings.push(finding(
          "SG-01",
          "critical",
          "tanda-tangan",
          "Dokumen berubah setelah ditandatangani — integritas tanda tangan gagal",
          "Tanda tangan digital",
          `Hash byte berkas saat ini tidak cocok dengan messageDigest yang dikunci pada tanda tangan (${sigObj.digestAlg})`,
          "Hash isi saat ini tidak cocok dengan messageDigest yang dikunci saat penandatanganan."
        ));
      }

      // SG-02: Tanda tangan digital tidak valid secara kriptografis
      if (sigObj.sigValid === false) {
        findings.push(finding(
          "SG-02",
          "critical",
          "tanda-tangan",
          "Tanda tangan digital tidak valid secara kriptografis",
          "Tanda tangan digital",
          `Verifikasi tanda tangan kriptografis untuk ${sigObj.signerCN || "penanda tangan"} tidak valid`,
          "Verifikasi kriptografis kunci publik terhadap tanda tangan gagal."
        ));
      }

      // SG-03: Tanda tangan digital terverifikasi — integritas dokumen utuh
      if (sigObj.integrity === "ok" && sigObj.sigValid === true) {
        let obs = `Penanda tangan: ${sigObj.signerCN || "—"}${sigObj.signerOrg ? " (" + sigObj.signerOrg + ")" : ""}; Penerbit: ${sigObj.issuer || "—"}`;
        if (sigObj.signingTime) obs += `; Waktu tanda tangan: ${fmtDate(sigObj.signingTime)}`;
        if (sigObj.tsaTime) obs += `; Waktu TSA: ${fmtDate(sigObj.tsaTime)}`;
        findings.push(finding(
          "SG-03",
          "info",
          "tanda-tangan",
          "Tanda tangan digital terverifikasi — integritas dokumen utuh",
          "Tanda tangan digital",
          obs,
          "Tanda tangan digital valid secara kriptografis dan isi dokumen di dalam jangkauan tanda tangan tidak berubah sejak ditandatangani."
        ));
      }

      // SG-04: Tanda tangan memakai algoritma hash lemah (SHA-1)
      if (sigObj.digestAlg === "SHA-1") {
        findings.push(finding(
          "SG-04",
          "suspicious",
          "tanda-tangan",
          "Tanda tangan memakai algoritma hash lemah (SHA-1)",
          "Tanda tangan digital",
          "Algoritma intisari (digest): SHA-1",
          "Algoritma SHA-1 rentan terhadap tabrakan hash (collision attack) dan tidak lagi direkomendasikan untuk tanda tangan digital."
        ));
      }

      // SG-05: Sertifikat penanda tangan kedaluwarsa atau belum berlaku pada signingTime
      if (sigObj.signingTime) {
        if (sigObj.notBefore && sigObj.signingTime < sigObj.notBefore) {
          findings.push(finding(
            "SG-05",
            "suspicious",
            "tanda-tangan",
            "Sertifikat tanda tangan belum berlaku pada waktu penandatanganan",
            "Sertifikat tanda tangan digital",
            `Waktu penandatanganan (${fmtDate(sigObj.signingTime)}) mendahului tanggal berlakunya sertifikat (${fmtDate(sigObj.notBefore)})`,
            "Sertifikat digital belum sah digunakan sebelum tanggal awal masa berlakunya (notBefore)."
          ));
        }
        if (sigObj.notAfter && sigObj.signingTime > sigObj.notAfter) {
          findings.push(finding(
            "SG-05",
            "suspicious",
            "tanda-tangan",
            "Sertifikat tanda tangan sudah kedaluwarsa pada waktu penandatanganan",
            "Sertifikat tanda tangan digital",
            `Waktu penandatanganan (${fmtDate(sigObj.signingTime)}) melewati tanggal kedaluwarsa sertifikat (${fmtDate(sigObj.notAfter)})`,
            "Sertifikat digital telah kedaluwarsa (notAfter) saat penandatanganan dokumen dilakukan."
          ));
        }
      }

    }

    /* SG-06 (kalibrasi ulang supervisor 2026-11-17): hanya dinilai dari tanda
       tangan dengan jangkauan TERAKHIR — pada dokumen multi-tanda tangan,
       tanda tangan awal memang tidak mencakup revisi sesudahnya. Bila integritas
       bagian yang ditandatangani TERBUKTI utuh, konten sesudahnya (penggabungan
       dokumen lanjutan via pembaruan inkremental — pola nyata dokumen BSrE)
       adalah info faktual, BUKAN kecurigaan: tanda tangannya sah, hanya tidak
       melindungi tambahan itu. Baru mencurigakan bila integritas tak terbukti. */
    if (signatures.length) {
      const last = signatures.reduce((m, s) => (s.byteRangeEnd > (m ? m.byteRangeEnd : -1) ? s : m), null);
      if (last && !last.coversWholeFile) {
        if (last.integrity === "ok") {
          findings.push(finding(
            "SG-06",
            "info",
            "tanda-tangan",
            "Ada konten setelah tanda tangan — tidak tercakup perlindungan tanda tangan",
            "Struktur jangkauan byte (/ByteRange)",
            `Jangkauan tanda tangan berakhir pada byte ${last.byteRangeEnd} dari total ${buf.byteLength} byte berkas; integritas bagian yang ditandatangani terverifikasi utuh`,
            "Konten tambahan sesudah penandatanganan (misalnya penggabungan dokumen lanjutan lewat pembaruan inkremental) adalah pola yang sah dan tidak merusak tanda tangan — bagian di dalam jangkauan terverifikasi utuh. Namun konten tambahan itu sendiri TIDAK dilindungi tanda tangan ini; keasliannya tidak dijamin oleh penanda tangan."
          ));
        } else {
          findings.push(finding(
            "SG-06",
            "suspicious",
            "tanda-tangan",
            "Tanda tangan tidak mencakup seluruh berkas — ada konten di luar jangkauan tanda tangan",
            "Struktur jangkauan byte (/ByteRange)",
            `Jangkauan tanda tangan berakhir pada byte ${last.byteRangeEnd} dari total ${buf.byteLength} byte berkas`,
            "Terdapat byte atau konten tambahan sesudah batas jangkauan tanda tangan (/ByteRange), dan integritas bagian yang ditandatangani tidak terbukti utuh. Konten tambahan tersebut tidak dilindungi oleh tanda tangan ini."
          ));
        }
      }
    }

    return { signatures, findings };
  }

  const api = { analyzeSignatures };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SFSig = api;
})(typeof window !== "undefined" ? window : globalThis);
