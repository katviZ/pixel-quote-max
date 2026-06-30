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
      const p = numKeys(attrs("<x " + head + ">"), ["moduleW","moduleH","brightnessNits","refreshHz","bitDepth","viewingAngleDeg","contrastStatic","contrastDynamic","colorGamutSrgbPct","colorGamutRec2020Pct","maxPowerSqm","avgPowerSqm","warrantyYears","cabinetDepthMm","moduleDepthMm","lifespanHours","opTempMin","opTempMax","vdMultiplier"]);
      p.cabinets = []; p.pitches = [];
      body.replace(/<cabinet\b[^>]*\/>/g, (t) => { p.cabinets.push(numKeys(attrs(t), ["w","h","weight"])); return t; });
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

  /* MCB sizing ladder — peak current A → recommended single-phase MCB rating.
     Conservative, gives 25–60% headroom over peak draw at each tier.
     Source: standard Indian Hager/L&T/Schneider single-phase residential MCB tiers
     (BS EN 60898). Above 63A → industrial 3-phase territory; we cap there. */
  function currentToMCB(amp) {
    if (amp <= 16) return "20A";
    if (amp <= 25) return "32A";
    if (amp <= 32) return "40A";
    if (amp <= 40) return "50A";
    if (amp <= 50) return "63A";
    return "63A · 3-phase recommended";
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

    // Round to µm to kill float-drift from ft↔mm round-trips. (3600/304.8)×304.8
    // in JS = 3600.0000000000005, which makes ceil() jump from 6 to 7 cabinets.
    // 1µm tolerance is 1000× smaller than any physically meaningful spec.
    const reqWmm = Math.round(ftToMm(params.widthFt) * 1000) / 1000;
    const reqHmm = Math.round(ftToMm(params.heightFt) * 1000) / 1000;

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
    const areaSqm = (builtWmm * builtHmm) / 1e6;
    const ppp = micro ? db.meta.pixelsPerPortMicro : db.meta.pixelsPerPortMini;
    const ports = Math.max(1, Math.ceil(totalPixels / ppp));

    // ---- tech / engineering derivatives (shared, used by PDF + screen) ----
    const diagInches = Math.sqrt(builtWmm*builtWmm + builtHmm*builtHmm) / 25.4;
    const gcd = (a,b)=> b===0 ? a : gcd(b, a%b);
    const g = gcd(pxW || 1, pxH || 1);
    const aspectRatio = `${Math.round((pxW||1)/g)}:${Math.round((pxH||1)/g)}`;
    const pixelDensitySqm = pitch > 0 ? Math.round(1e6 / (pitch * pitch)) : 0;
    const vdMul = product.vdMultiplier != null ? product.vdMultiplier : 1.0;
    const minViewingDistanceM = +(pitch * vdMul).toFixed(2);

    // cabinet weight: explicit param > cab attr > sensible default
    const perCabWeightKg = (params.cabWeightKg != null && params.cabWeightKg !== "" && !isNaN(+params.cabWeightKg))
      ? +params.cabWeightKg : (cab.weight != null ? cab.weight : (micro ? 5 : 14));
    const screenWeightKg = Math.round(totalCabs * perCabWeightKg);

    // ---- electrical (for BOTH flat & curved now) ----
    // datasheet figures: avgPowerSqm = sustained content, maxPowerSqm = ≤100% white.
    // PEAK_FACTOR = peak (all-white) / sustained avg for LED display content.
    // Industry rule-of-thumb is ~3× — drives MCB sizing (peak trips breakers,
    // not sustained avg). Editable here; not a magic number elsewhere in the file.
    const PEAK_FACTOR = 3;
    const AC_VOLTAGE = 220; // India single-phase nominal for MCB current calc
    const avgPowerW = Math.round(areaSqm * (product.avgPowerSqm || 0));
    const maxPowerW = Math.round(areaSqm * (product.maxPowerSqm || 0));
    const peakPowerW = Math.round(avgPowerW * PEAK_FACTOR); // = avg × 3, conservative
    const peakCurrentA = +(peakPowerW / AC_VOLTAGE).toFixed(1);
    const mcbRating = currentToMCB(peakCurrentA);
    const recommendedSupplyKw = Math.max(1, Math.ceil((peakPowerW * 1.25) / 1000));

    // ---- structural (for BOTH flat & curved) ----
    // Auto-derive vertical support count from width — same rule as the curved
    // branch below ("a post every ~960mm, plus one for the endcap").
    // Allows user override via params.nVerticalSupports later if needed.
    const nVerticalSupports = (params.nVerticalSupports != null && +params.nVerticalSupports >= 2)
      ? Math.round(+params.nVerticalSupports)
      : Math.ceil(builtWmm / 960) + 1;
    // Estimated fabrication structure weight (curved gets its own steelWeightKg
    // computed from steel-tube geometry below). For flat: industry rule ~55% of
    // cabinet weight covers vertical posts, horizontal rails, brackets, base.
    const flatSteelWeightKg = Math.round(screenWeightKg * 0.55);
    // TUBE_WORKING_LOAD is for the VR-standard 40mm OD × 2.5mm steel tube;
    // verify before quoting spans > 4m.
    const TUBE_WORKING_LOAD_KG = 250;
    const TUBE_SPEC = "40mm OD × 2.5mm wall steel";

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

      // structure (steel + curve mounting)
      const vertPosts = Math.ceil(builtWmm / 960) + 1;
      const vertPostLen = (builtHmm + 600) / 1000;
      const horizRails = Math.ceil(builtHmm / 960) + 1;
      const horizRailLen = m.arcLen / 1000;
      const strutLen = m.isOuter ? (sag * 6) / 1000 : 0;
      const steelWeightKg = Math.round((vertPosts * vertPostLen + horizRails * horizRailLen + strutLen) * 12);

      curve = {
        chordMm, R, sag, surPct, surcharge, surchargeGst,
        // legacy keys kept for compatibility with existing PrintSheet code
        totalWeight: screenWeightKg, avgPower: avgPowerW, maxPower: maxPowerW,
        recommendedSupply: recommendedSupplyKw, steelWeightKg,
        vertPosts, horizRails, ...m,
        curveType: params.curveType || "outer",
      };
    }

    // ---- structural load + safety (unified for flat & curved) ----
    // Picks the right steel-weight basis: curved screens have their own
    // tube-geometry-derived steelWeightKg; flat uses the 55% rule.
    const structuralSteelKg = curve ? curve.steelWeightKg : flatSteelWeightKg;
    const totalSystemKg = screenWeightKg + structuralSteelKg;
    const loadPerSupportKg = Math.round((totalSystemKg / Math.max(1, nVerticalSupports)) * 10) / 10;
    // Safety factor = rated working load ÷ actual load (×1.05 for tube self-weight).
    // SF ≥ 2 is the comfort zone; below 1.5 → add supports or upgrade tube.
    const safetyFactor = +(TUBE_WORKING_LOAD_KG / Math.max(0.1, loadPerSupportKg * 1.05)).toFixed(1);

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const totalGst = lines.reduce((s, l) => s + l.gst, 0);
    const grandTotal = subtotal + totalGst;

    const tech = {
      displayTech: product.displayTech || null, ledType: product.ledType || null,
      brightnessNits: product.brightnessNits || null, refreshHz: product.refreshHz || null,
      bitDepth: product.bitDepth || null, viewingAngleDeg: product.viewingAngleDeg || null,
      contrastStatic: product.contrastStatic || null, contrastDynamic: product.contrastDynamic || null,
      colorGamutSrgbPct: product.colorGamutSrgbPct || null, colorGamutRec2020Pct: product.colorGamutRec2020Pct || null,
      ipRating: product.ipRating || null, cabinetDepthMm: product.cabinetDepthMm || null,
      moduleDepthMm: product.moduleDepthMm || null, lifespanHours: product.lifespanHours || null,
      warrantyYears: product.warrantyYears || null,
      opTempMin: product.opTempMin != null ? product.opTempMin : null,
      opTempMax: product.opTempMax != null ? product.opTempMax : null,
    };

    return {
      mode: params.mode, micro, sku: pr.sku, pitch,
      product: { id: product.id, series: product.series, type: product.type },
      cab, cabW, cabH, modW, modH,
      reqWmm, reqHmm, builtWmm, builtHmm,
      builtWft: mmToFt(builtWmm), builtHft: mmToFt(builtHmm),
      cabCountW, cabCountH, totalCabs,
      modPerCabW, modPerCabH, modPerCab, totalMods,
      pxW, pxH, totalPixels, areaSqft, areaSqm, ports,
      diagInches, aspectRatio, pixelDensitySqm, minViewingDistanceM,
      perCabWeightKg, screenWeightKg, avgPowerW, maxPowerW, recommendedSupplyKw,
      // electrical (Phase 1 — peak + MCB)
      peakPowerW, peakCurrentA, mcbRating, peakFactor: PEAK_FACTOR, acVoltage: AC_VOLTAGE,
      // structural (Phase 1 — load + safety, unified flat & curved)
      nVerticalSupports, structuralSteelKg, totalSystemKg, loadPerSupportKg, safetyFactor,
      tubeWorkingLoadKg: TUBE_WORKING_LOAD_KG, tubeSpec: TUBE_SPEC,
      tech,
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
    // Manual-mode lock: when the user has explicitly picked a cabinet (and
    // orientation), the fit cards must stay on THAT cabinet — not silently
    // jump to a different one the algorithm happens to prefer.
    const lockedCabIndex = (params.manualCab && params.cabIndex != null) ? +params.cabIndex : null;
    const lockedOrientation = (params.manualCab && params.orientation) ? params.orientation : null;
    product.cabinets.forEach((cab, cabIndex) => {
      if (lockedCabIndex != null && cabIndex !== lockedCabIndex) return;
      // Module-based builds (modules-on-frame) are a deliberate construction
      // choice — AUTO never picks them. User must select via Manual override.
      if (cab.type === "module" && lockedCabIndex == null) return;
      const orientations = cab.w === cab.h ? ["native"] : ["native", "rotated"];
      orientations.forEach((orientation) => {
        if (lockedOrientation && orientation !== lockedOrientation) return;
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
    priceForPitch, controllerPrice, installRate, currentToMCB,
    radiusFrom, curveMetrics, computeQuote, findFits, quoteRef,
  };
});
