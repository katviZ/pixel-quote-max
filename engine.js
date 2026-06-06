/* ============================================================
   PIXEL QUOTE MAX — calculation engine (pure, dependency-free)
   Runs in the browser (window.PQM) AND in Node (module.exports)
   so the same code is unit-tested headless and shipped to users.
   All internal geometry is in millimetres. Money in INR.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PQM = api;
})(this, function () {
  "use strict";

  const MM_PER_FT = 304.8;
  const ftToMm = (ft) => ft * MM_PER_FT;
  const mmToFt = (mm) => mm / MM_PER_FT;
  const round = Math.round;
  const fmtINR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  /* ---------- attribute reader ---------- */
  function attrs(tag) {
    const o = {};
    const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tag)) !== null) o[m[1]] = m[2];
    return o;
  }
  const numKeys = (o, keys) => { keys.forEach((k) => { if (o[k] !== undefined) o[k] = parseFloat(o[k]); }); return o; };

  /* ---------- XML -> db object (works in Node and browser) ---------- */
  function parseDbXml(xml) {
    const db = { meta: {}, install: [], controllers: { mini: [], micro: [] }, products: [] };

    const metaM = xml.match(/<meta\b[^>]*>/);
    if (metaM) db.meta = numKeys(attrs(metaM[0]),
      ["curveSurchargePct", "pixelsPerPortMini", "pixelsPerPortMicro", "controllerGst", "installGst"]);

    const instBlock = (xml.match(/<installTiers>([\s\S]*?)<\/installTiers>/) || [])[1] || "";
    instBlock.replace(/<tier\b[^>]*\/>/g, (t) => { db.install.push(numKeys(attrs(t), ["maxArea", "rate"])); return t; });

    xml.replace(/<controllers\s+type="(mini|micro)">([\s\S]*?)<\/controllers>/g, (full, type, body) => {
      body.replace(/<tier\b[^>]*\/>/g, (t) => { db.controllers[type].push(numKeys(attrs(t), ["maxPorts", "price"])); return t; });
      return full;
    });

    xml.replace(/<product\b([^>]*)>([\s\S]*?)<\/product>/g, (full, head, body) => {
      const p = numKeys(attrs("<x " + head + ">"), ["moduleW", "moduleH"]);
      p.cabinets = []; p.pitches = [];
      body.replace(/<cabinet\b[^>]*\/>/g, (t) => { p.cabinets.push(numKeys(attrs(t), ["w", "h"])); return t; });
      body.replace(/<pitch\b[^>]*\/>/g, (t) => { p.pitches.push(numKeys(attrs(t), ["pp", "rate", "gst"])); return t; });
      db.products.push(p);
      return full;
    });

    return db;
  }

  const getProduct = (db, id) => db.products.find((p) => p.id === id) || null;
  const isMicro = (product) => (product.type || "").toLowerCase() === "microled";

  /* ---------- price lookups ---------- */
  function priceForPitch(product, pp) {
    const exact = product.pitches.find((x) => Math.abs(x.pp - pp) < 1e-9);
    if (exact) return { rate: exact.rate, gst: exact.gst, sku: exact.sku };
    // linear interpolation between nearest catalogue pitches (rate rises as pitch falls)
    const sorted = [...product.pitches].sort((a, b) => a.pp - b.pp);
    const lo = sorted.filter((x) => x.pp <= pp).pop();
    const hi = sorted.filter((x) => x.pp >= pp).shift();
    if (lo && hi && lo.pp !== hi.pp) {
      const r = (pp - lo.pp) / (hi.pp - lo.pp);
      const rate = round(lo.rate + (hi.rate - lo.rate) * r);
      return { rate, gst: pp <= 1.56 ? 28 : 18, sku: "Custom " + pp + "mm" };
    }
    const one = lo || hi;
    return { rate: one.rate, gst: one.gst, sku: "Custom " + pp + "mm" };
  }

  function controllerPrice(db, ports, micro) {
    const tiers = micro ? db.controllers.micro : db.controllers.mini;
    const t = tiers.find((x) => ports <= x.maxPorts) || tiers[tiers.length - 1];
    return t.price;
  }
  function installRate(db, area) {
    const t = db.install.find((x) => area < x.maxArea) || db.install[db.install.length - 1];
    return t.rate;
  }

  /* ---------- curve geometry ---------- */
  // chordMm = straight span of the curved screen; returns radius R (mm)
  function radiusFrom(curveMode, { chordMm, sagittaMm, radiusMm, presetFactor }) {
    if (curveMode === "radius") return radiusMm;
    if (curveMode === "sagitta") {
      const s = Math.max(sagittaMm, 0.0001);
      return (chordMm * chordMm) / (8 * s) + s / 2; // exact for circular segment
    }
    return chordMm * presetFactor; // preset: R = factor * width
  }

  function curveMetrics({ chordMm, screenHmm, R, cabW, curveType, sag }) {
    const halfAngle = Math.asin(Math.min(1, chordMm / (2 * R)));
    const arcLen = R * 2 * halfAngle;
    const cabAngleDeg = (2 * Math.asin(Math.min(1, cabW / (2 * R))) * 180) / Math.PI;
    const gapPerJoint = (cabW * cabW) / (2 * R); // back gap a flat cabinet leaves on the arc

    let verdict, advice;
    if (gapPerJoint < 8) { verdict = "EXCELLENT"; advice = "Flat cabinets mount directly tangent. Negligible gap. No filler needed."; }
    else if (gapPerJoint < 15) { verdict = "VERY GOOD"; advice = "Flat cabinets work. Use 5mm closed-cell foam strip on cabinet edge for moisture seal."; }
    else if (gapPerJoint < 25) { verdict = "ACCEPTABLE"; advice = "Use wedge spacer plates (max ~12mm at edges) behind cabinets. Add aluminium trim filler at front joints."; }
    else if (gapPerJoint < 40) { verdict = "FACETED"; advice = "Visible faceting. Recommend a smaller cabinet, custom angled-edge cabinets, or a gentler curve."; }
    else { verdict = "SEVERE"; advice = "Use flexible/soft LED modules or cabinets fabricated specifically for this radius."; }

    const isOuter = curveType === "outer";
    const cantileverAtCenter = isOuter ? sag : 0;
    const wallContactAtEnds = isOuter ? "Chord endpoints" : "Full arc face";
    const structuralStrategy = isOuter
      ? (sag < 300 ? "Bracket cantilever from wall" : sag < 700 ? "Floating back-frame + 4-6 wall struts" : "Deep back-frame + heavy bracket system")
      : "Direct anchor along curve face into recessed wall";
    return { arcLen, cabAngleDeg, gapPerJoint, verdict, advice, isOuter, cantileverAtCenter, wallContactAtEnds, structuralStrategy };
  }

  /* ============================================================
     MAIN: computeQuote
     params = {
       mode: "flat" | "curved",
       productId, pitch (mm),
       widthFt, heightFt,           // requested screen size in feet
       cabIndex,                    // chosen cabinet from product list
       // curved only:
       curveMode: "preset"|"sagitta"|"radius",
       preset: "subtle"|"signature"|"wrap"|"cylinder",
       sagittaMm, radiusMm, curveType: "outer"|"inner",
       cabWeightKg,
       moduleW, moduleH            // optional overrides (mm)
     }
     ============================================================ */
  const PRESETS = { subtle: 5, signature: 2.5, wrap: 1.3, cylinder: 0.8 };

  function computeQuote(params, db) {
    const product = getProduct(db, params.productId);
    if (!product) throw new Error("Unknown product: " + params.productId);
    const micro = isMicro(product);
    const pitch = parseFloat(params.pitch);
    const cab = product.cabinets[Math.min(params.cabIndex || 0, product.cabinets.length - 1)];
    const rotated = params.orientation === "rotated";
    const cabW = rotated ? cab.h : cab.w;
    const cabH = rotated ? cab.w : cab.h;
    const modW = rotated ? (params.moduleH || product.moduleH) : (params.moduleW || product.moduleW);
    const modH = rotated ? (params.moduleW || product.moduleW) : (params.moduleH || product.moduleH);

    const reqWmm = ftToMm(params.widthFt);
    const reqHmm = ftToMm(params.heightFt);

    // snap UP to whole cabinets (you build & quote whole cabinets)
    const cabCountW = Math.max(1, Math.ceil(reqWmm / cabW));
    const cabCountH = Math.max(1, Math.ceil(reqHmm / cabH));
    const builtWmm = cabCountW * cabW;
    const builtHmm = cabCountH * cabH;
    const totalCabs = cabCountW * cabCountH;

    const modPerCabW = Math.round(cabW / modW);
    const modPerCabH = Math.round(cabH / modH);
    const modPerCab = modPerCabW * modPerCabH;
    const totalMods = totalCabs * modPerCab;

    const pxW = Math.round(builtWmm / pitch);
    const pxH = Math.round(builtHmm / pitch);
    const totalPixels = pxW * pxH;

    const areaSqft = (builtWmm * builtHmm) / (MM_PER_FT * MM_PER_FT);
    const ppp = micro ? db.meta.pixelsPerPortMicro : db.meta.pixelsPerPortMini;
    const ports = Math.max(1, Math.ceil(totalPixels / ppp));

    // ---- pricing (shared) ----
    const pr = priceForPitch(product, pitch);
    const screenCost = round(pr.rate * areaSqft);
    const screenGst = round((screenCost * pr.gst) / 100);

    const ctrlCost = controllerPrice(db, ports, micro);
    const ctrlGstPct = db.meta.controllerGst;
    const ctrlGst = round((ctrlCost * ctrlGstPct) / 100);

    const iRate = installRate(db, areaSqft);
    const installCost = round(iRate * Math.ceil(areaSqft));
    const installGstPct = db.meta.installGst;
    const installGst = round((installCost * installGstPct) / 100);

    const lines = [
      { item: "LED Display", rate: pr.rate, rateUnit: "/sqft", qty: areaSqft.toFixed(1) + " sqft", amount: screenCost, gstPct: pr.gst, gst: screenGst },
      { item: "Video Controller", rate: ctrlCost, rateUnit: " /system", qty: ports + " port(s)", amount: ctrlCost, gstPct: ctrlGstPct, gst: ctrlGst },
      { item: "Installation", rate: iRate, rateUnit: "/sqft", qty: Math.ceil(areaSqft) + " sqft", amount: installCost, gstPct: installGstPct, gst: installGst },
    ];

    let curve = null;
    if (params.mode === "curved") {
      const chordMm = reqWmm;
      const R = radiusFrom(params.curveMode, {
        chordMm, sagittaMm: params.sagittaMm, radiusMm: params.radiusMm,
        presetFactor: PRESETS[params.preset] || PRESETS.signature,
      });
      const sag = R - Math.sqrt(Math.max(0, R * R - (chordMm * chordMm) / 4));
      const m = curveMetrics({ chordMm, screenHmm: reqHmm, R, cabW, curveType: params.curveType || "outer", sag });

      // curve-fabrication surcharge (editable in XML)
      const surPct = db.meta.curveSurchargePct || 0;
      const surcharge = round((screenCost * surPct) / 100);
      const surchargeGst = round((surcharge * pr.gst) / 100);
      lines.push({ item: "Curve Fabrication", rate: surPct, rateUnit: "%", qty: "curve work", amount: surcharge, gstPct: pr.gst, gst: surchargeGst });

      // structure + electrical (ported from original engine)
      const totalWeight = totalCabs * (params.cabWeightKg || 14);
      const avgPower = totalCabs * (modPerCab * 25);
      const maxPower = totalCabs * (modPerCab * 70);
      const recommendedSupply = Math.ceil((maxPower * 1.25) / 1000);
      const vertPosts = Math.ceil(builtWmm / 960) + 1;
      const vertPostLen = (builtHmm + 600) / 1000;
      const horizRails = Math.ceil(builtHmm / 960) + 1;
      const horizRailLen = m.arcLen / 1000;
      const strutLen = m.isOuter ? (sag * 6) / 1000 : 0;
      const steelWeightKg = Math.round((vertPosts * vertPostLen + horizRails * horizRailLen + strutLen) * 12);

      curve = {
        chordMm, R, sag, surPct, surcharge, surchargeGst,
        totalWeight, avgPower, maxPower, recommendedSupply, steelWeightKg,
        vertPosts, horizRails, ...m,
        curveType: params.curveType || "outer",
      };
    }

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const totalGst = lines.reduce((s, l) => s + l.gst, 0);
    const grandTotal = subtotal + totalGst;

    return {
      mode: params.mode, micro, sku: pr.sku, pitch,
      product: { id: product.id, series: product.series, type: product.type },
      cab, cabW, cabH, modW, modH,
      reqWmm, reqHmm, builtWmm, builtHmm,
      builtWft: mmToFt(builtWmm), builtHft: mmToFt(builtHmm),
      cabCountW, cabCountH, totalCabs,
      modPerCabW, modPerCabH, modPerCab, totalMods,
      pxW, pxH, totalPixels, areaSqft, ports,
      lines, subtotal, totalGst, grandTotal,
      curve,
    };
  }

  /* ---------- smart fit-finder ----------
     For a given product + requested width/height (ft), evaluates every
     cabinet × {native, rotated} and returns the best NEAREST (≤ input) and
     best OPTIMAL (≥ input) fits by minimum total waste. */
  function findFits(params, db) {
    const product = getProduct(db, params.productId);
    if (!product) return null;
    const reqW = ftToMm(parseFloat(params.widthFt) || 0);
    const reqH = ftToMm(parseFloat(params.heightFt) || 0);
    if (reqW <= 0 || reqH <= 0) return { nearest: null, optimal: null };

    let bestOpt = null, bestNear = null;
    product.cabinets.forEach((cab, cabIndex) => {
      const orientations = cab.w === cab.h ? ["native"] : ["native", "rotated"];
      orientations.forEach((orientation) => {
        const cw = orientation === "rotated" ? cab.h : cab.w;
        const ch = orientation === "rotated" ? cab.w : cab.h;

        const ncWup = Math.max(1, Math.ceil(reqW / cw));
        const ncHup = Math.max(1, Math.ceil(reqH / ch));
        const builtW = ncWup * cw, builtH = ncHup * ch;
        const wasteUp = (builtW - reqW) + (builtH - reqH);
        const optRec = { cabIndex, orientation, cabW: cw, cabH: ch, cabLabel: cab.label,
                         cabCountW: ncWup, cabCountH: ncHup, builtWmm: builtW, builtHmm: builtH, waste: wasteUp };
        if (!bestOpt || wasteUp < bestOpt.waste) bestOpt = optRec;

        const ncWdn = Math.floor(reqW / cw);
        const ncHdn = Math.floor(reqH / ch);
        if (ncWdn >= 1 && ncHdn >= 1) {
          const builtWdn = ncWdn * cw, builtHdn = ncHdn * ch;
          const wasteDn = (reqW - builtWdn) + (reqH - builtHdn);
          const nearRec = { cabIndex, orientation, cabW: cw, cabH: ch, cabLabel: cab.label,
                            cabCountW: ncWdn, cabCountH: ncHdn, builtWmm: builtWdn, builtHmm: builtHdn, waste: wasteDn };
          if (!bestNear || wasteDn < bestNear.waste) bestNear = nearRec;
        }
      });
    });
    return { nearest: bestNear, optimal: bestOpt };
  }

  function quoteRef(date) {
    const d = date || new Date();
    const yr = d.getFullYear();
    const seq = Math.floor((d.getMonth() * 31 + d.getDate()) * 13 + (d.getHours() * 60 + d.getMinutes())) % 9999 + 1;
    return "VR-" + yr + "-" + String(seq).padStart(4, "0");
  }

  return {
    MM_PER_FT, ftToMm, mmToFt, fmtINR, PRESETS,
    parseDbXml, getProduct, isMicro,
    priceForPitch, controllerPrice, installRate,
    radiusFrom, curveMetrics, computeQuote, findFits, quoteRef,
  };
});
