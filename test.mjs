/* Headless QC for the Pixel Quote Max engine.  Run: node test.mjs */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PQM = require("./engine.js");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};
const approx = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;
const noNaN = (obj, path = "root") => {
  for (const k in obj) {
    const v = obj[k];
    if (typeof v === "number" && !isFinite(v)) { console.log("  ✗ NaN/Inf at " + path + "." + k); fail++; }
    else if (v && typeof v === "object") noNaN(v, path + "." + k);
  }
};

const xml = readFileSync(new URL("./pixel-data.xml", import.meta.url), "utf8");
const db = PQM.parseDbXml(xml);

console.log("\n── 1 · XML database parsing ──");
ok("4 products parsed (outdoor, indoor, cosmo, sapphire)", db.products.length === 4, "got " + db.products.length);
ok("meta.curveSurchargePct = 15", db.meta.curveSurchargePct === 15);
ok("meta.pixelsPerPortMini = 650000", db.meta.pixelsPerPortMini === 650000);
ok("install tiers = 3", db.install.length === 3);
ok("mini controller tiers = 6", db.controllers.mini.length === 6);
ok("micro controller tiers = 5", db.controllers.micro.length === 5);
const outdoor = PQM.getProduct(db, "outdoor");
ok("outdoor has 4 pitches", outdoor.pitches.length === 4);
ok("outdoor has 5 cabinets (module + 4)", outdoor.cabinets.length === 5);
ok("outdoor cabinet2 = 960x960 (after 320×160 module & 640 added)", outdoor.cabinets[2].w === 960 && outdoor.cabinets[2].h === 960);
ok("outdoor module = 320x160", outdoor.moduleW === 320 && outdoor.moduleH === 160);
ok("microled detected as micro", PQM.isMicro(PQM.getProduct(db, "microled")));

console.log("\n── 2 · Price lookups ──");
ok("P4 outdoor rate = 5500", PQM.priceForPitch(outdoor, 4).rate === 5500);
ok("P2.5 outdoor gst = 18", PQM.priceForPitch(outdoor, 2.5).gst === 18);
const interp = PQM.priceForPitch(outdoor, 3.5);
ok("interp P3.5 = 6375 (between 7250 & 5500)", interp.rate === 6375, "got " + interp.rate);
ok("mini ctrl 2 ports = 25000", PQM.controllerPrice(db, 2, false) === 25000);
ok("micro ctrl 4 ports = 150000", PQM.controllerPrice(db, 4, true) === 150000);
ok("install <50sqft = 300", PQM.installRate(db, 40) === 300);
ok("install 100sqft = 200", PQM.installRate(db, 100) === 200);
ok("install 500sqft = 150", PQM.installRate(db, 500) === 150);

console.log("\n── 3 · FLAT quote (outdoor P4, 12×8 ft, 960² cab) ──");
const flat = PQM.computeQuote(
  { mode: "flat", productId: "outdoor", pitch: 4, widthFt: 12, heightFt: 8, cabIndex: 2 }, db);
noNaN(flat, "flat");
ok("cabCountW = 4", flat.cabCountW === 4, "got " + flat.cabCountW);
ok("cabCountH = 3", flat.cabCountH === 3, "got " + flat.cabCountH);
ok("totalCabs = 12", flat.totalCabs === 12);
ok("builtW = 3840mm", flat.builtWmm === 3840);
ok("modPerCab = 18 (3×6)", flat.modPerCab === 18, "got " + flat.modPerCab);
ok("pxW = 960", flat.pxW === 960, "got " + flat.pxW);
ok("area ≈ 119.0 sqft", approx(flat.areaSqft, 119.04, 0.1), "got " + flat.areaSqft.toFixed(2));
ok("ports = 2", flat.ports === 2, "got " + flat.ports);
ok("3 price lines (no curve)", flat.lines.length === 3);
ok("no curve block", flat.curve === null);
ok("subtotal = Σ line amounts", flat.subtotal === flat.lines.reduce((s, l) => s + l.amount, 0));
ok("totalGst = Σ line gst", flat.totalGst === flat.lines.reduce((s, l) => s + l.gst, 0));
ok("grandTotal = subtotal + gst", flat.grandTotal === flat.subtotal + flat.totalGst);
ok("LED cost = rate×area", flat.lines[0].amount === Math.round(5500 * flat.areaSqft));
console.log("     → built " + flat.builtWft.toFixed(1) + "×" + flat.builtHft.toFixed(1) + "ft, " +
  flat.totalPixels.toLocaleString() + "px, grand total " + PQM.fmtINR(flat.grandTotal));

console.log("\n── 4 · CURVED quote (outdoor P4, 16×8 ft, signature, outer) ──");
const curved = PQM.computeQuote(
  { mode: "curved", productId: "outdoor", pitch: 4, widthFt: 16, heightFt: 8, cabIndex: 2,
    curveMode: "preset", preset: "signature", curveType: "outer", cabWeightKg: 14 }, db);
noNaN(curved, "curved");
ok("curve block present", !!curved.curve);
ok("4 price lines (incl. curve)", curved.lines.length === 4);
ok("curve surcharge line present", curved.lines[3].item === "Curve Fabrication");
ok("surcharge = 15% of LED cost", curved.curve.surcharge === Math.round(curved.lines[0].amount * 0.15),
  "got " + curved.curve.surcharge);
ok("R > 0", curved.curve.R > 0);
ok("sag > 0", curved.curve.sag > 0);
ok("arc length ≥ chord", curved.curve.arcLen >= curved.curve.chordMm - 0.01,
  "arc " + curved.curve.arcLen.toFixed(0) + " vs chord " + curved.curve.chordMm.toFixed(0));
ok("R = 2.5 × width (signature)", approx(curved.curve.R, curved.curve.chordMm * 2.5, 1));
ok("verdict is a known label", ["EXCELLENT", "VERY GOOD", "ACCEPTABLE", "FACETED", "SEVERE"].includes(curved.curve.verdict));
ok("recommended supply > 0 kW", curved.curve.recommendedSupply > 0);
ok("steel weight > 0", curved.curve.steelWeightKg > 0);
ok("grandTotal = subtotal + gst", curved.grandTotal === curved.subtotal + curved.totalGst);
console.log("     → R " + (curved.curve.R / 1000).toFixed(2) + "m, sag " + curved.curve.sag.toFixed(0) +
  "mm, verdict " + curved.curve.verdict + ", grand total " + PQM.fmtINR(curved.grandTotal));

console.log("\n── 5 · Curve modes (radius & sagitta) ──");
const byRadius = PQM.computeQuote(
  { mode: "curved", productId: "indoor", pitch: 2.5, widthFt: 16, heightFt: 9, cabIndex: 0,
    curveMode: "radius", radiusMm: 8000, curveType: "inner" }, db);
ok("radius mode honours R", approx(byRadius.curve.R, 8000, 0.01), "got " + byRadius.curve.R);
const bySag = PQM.computeQuote(
  { mode: "curved", productId: "indoor", pitch: 2.5, widthFt: 16, heightFt: 9, cabIndex: 0,
    curveMode: "sagitta", sagittaMm: 457, curveType: "outer" }, db);
// verify sagitta round-trips: sag computed back from derived R should match input
ok("sagitta mode round-trips (≈457mm)", approx(bySag.curve.sag, 457, 2), "got " + bySag.curve.sag.toFixed(1));

console.log("\n── 6 · Edge cases ──");
const tiny = PQM.computeQuote({ mode: "flat", productId: "microled", pitch: 1.25, widthFt: 0.5, heightFt: 0.5, cabIndex: 0 }, db);
noNaN(tiny, "tiny");
ok("tiny screen still ≥1 cabinet", tiny.cabCountW >= 1 && tiny.cabCountH >= 1);
ok("tiny screen ≥1 port", tiny.ports >= 1);
const big = PQM.computeQuote({ mode: "flat", productId: "outdoor", pitch: 6.67, widthFt: 60, heightFt: 30, cabIndex: 2 }, db);
noNaN(big, "big");
ok("big screen uses install 150 tier", big.lines[2].rate === 150);
ok("quoteRef format VR-YYYY-####", /^VR-\d{4}-\d{4}$/.test(PQM.quoteRef()));

console.log("\n── 7 · Smart fit-finder ──");
const fits1 = PQM.findFits({ productId:"outdoor", widthFt:12, heightFt:8 }, db);
ok("outdoor 12x8: optimal exists", !!fits1.optimal);
ok("outdoor 12x8: nearest exists", !!fits1.nearest);
ok("optimal waste <= nearest waste*2", fits1.optimal.waste <= fits1.nearest.waste*2 + 1, "opt "+fits1.optimal.waste.toFixed(0)+" near "+fits1.nearest.waste.toFixed(0));
ok("optimal built >= requested W", fits1.optimal.builtWmm >= 12*304.8 - 0.01);
ok("nearest built <= requested W", fits1.nearest.builtWmm <= 12*304.8 + 0.01);
console.log("     → opt: cab " + fits1.optimal.cabLabel + " (" + fits1.optimal.orientation + "), " + fits1.optimal.cabCountW + "x" + fits1.optimal.cabCountH);
console.log("     → near: cab " + fits1.nearest.cabLabel + " (" + fits1.nearest.orientation + "), " + fits1.nearest.cabCountW + "x" + fits1.nearest.cabCountH);

// Force a case where rotation matters: input narrow + tall to make 960x1280 rotated potentially preferred
const fits2 = PQM.findFits({ productId:"outdoor", widthFt:4.2, heightFt:6.3 }, db);
ok("4.2x6.3: both fits returned", !!fits2.optimal && !!fits2.nearest);
console.log("     → rotation-test opt: " + fits2.optimal.cabLabel + " (" + fits2.optimal.orientation + "), built " + fits2.optimal.builtWmm + "x" + fits2.optimal.builtHmm);

// Tiny input → nearest may be null (no cabinet fits below)
const fits3 = PQM.findFits({ productId:"outdoor", widthFt:0.5, heightFt:0.5 }, db);
ok("tiny 0.5x0.5: optimal still works", !!fits3.optimal);
ok("tiny 0.5x0.5: nearest is null (below smallest)", fits3.nearest === null);

// Rotation in computeQuote: square cabinet should be identical native vs rotated
const rNat = PQM.computeQuote({ mode:"flat", productId:"outdoor", pitch:4, widthFt:12, heightFt:8, cabIndex:1, orientation:"native" }, db);
const rRot = PQM.computeQuote({ mode:"flat", productId:"outdoor", pitch:4, widthFt:12, heightFt:8, cabIndex:1, orientation:"rotated" }, db);
ok("square cab native==rotated (grand total)", rNat.grandTotal === rRot.grandTotal);

// Non-square rotation actually swaps dims (960×1280 is now cab index 3)
const a = PQM.computeQuote({ mode:"flat", productId:"outdoor", pitch:4, widthFt:12, heightFt:8, cabIndex:3, orientation:"native" }, db);
const b = PQM.computeQuote({ mode:"flat", productId:"outdoor", pitch:4, widthFt:12, heightFt:8, cabIndex:3, orientation:"rotated" }, db);
ok("non-square cab rotation changes built size", a.builtWmm !== b.builtWmm || a.builtHmm !== b.builtHmm);

console.log("\n── 8 · Tech / power / weight derivatives ──");
const tflat = PQM.computeQuote({ mode:"flat", productId:"outdoor", pitch:4, widthFt:12, heightFt:8, cabIndex:2 }, db);
ok("diagonal > 0", tflat.diagInches > 0, "got "+tflat.diagInches);
ok("aspect ratio is X:Y", /^\d+:\d+$/.test(tflat.aspectRatio), "got "+tflat.aspectRatio);
ok("pixel density per sqm = 62,500 for P4", tflat.pixelDensitySqm === 62500, "got "+tflat.pixelDensitySqm);
ok("min viewing distance = 4m for outdoor P4 (vdMul 1.0)", tflat.minViewingDistanceM === 4, "got "+tflat.minViewingDistanceM);
ok("screen weight uses cab.weight (14kg × 12 cabs = 168)", tflat.screenWeightKg === 168, "got "+tflat.screenWeightKg);
ok("avg power for flat > 0 (Outdoor 500 W/sqm)", tflat.avgPowerW > 0);
ok("max power > avg power", tflat.maxPowerW > tflat.avgPowerW);
ok("recommended supply >= 1 kW", tflat.recommendedSupplyKw >= 1);
ok("tech.brightnessNits = 5500", tflat.tech.brightnessNits === 5500);
ok("tech.refreshHz = 3840", tflat.tech.refreshHz === 3840);
ok("tech.ipRating = IP65", tflat.tech.ipRating === "IP65");
console.log("     → outdoor P4 12x8: diag "+tflat.diagInches.toFixed(1)+"\", "+tflat.aspectRatio+", "+tflat.pixelDensitySqm+" px/sqm, "+tflat.screenWeightKg+"kg, "+tflat.recommendedSupplyKw+"kW supply");

console.log("\n── 9 · Phase 1: peak power + MCB + structural ──");
ok("peakPowerW = avgPowerW × 3", tflat.peakPowerW === tflat.avgPowerW * 3, "got "+tflat.peakPowerW+" vs "+(tflat.avgPowerW*3));
ok("peakCurrentA = peakPowerW / 220 (1 dp)", Math.abs(tflat.peakCurrentA - tflat.peakPowerW/220) < 0.1);
ok("mcbRating returns a string", typeof tflat.mcbRating === "string" && /\dA/.test(tflat.mcbRating));
ok("nVerticalSupports ≥ 2 (from width ÷ 960 + 1)", tflat.nVerticalSupports >= 2);
ok("structuralSteelKg > 0 (flat = 55% of screen)", tflat.structuralSteelKg > 0);
ok("totalSystemKg = screen + steel", tflat.totalSystemKg === tflat.screenWeightKg + tflat.structuralSteelKg);
ok("loadPerSupportKg > 0", tflat.loadPerSupportKg > 0);
ok("safetyFactor > 0", tflat.safetyFactor > 0);
ok("tubeSpec exposed", tflat.tubeSpec === "40mm OD × 2.5mm wall steel");
ok("tubeWorkingLoadKg = 250", tflat.tubeWorkingLoadKg === 250);
console.log("     → flat outdoor P4 12x8: peak "+tflat.peakPowerW+"W ("+tflat.peakCurrentA+"A → "+tflat.mcbRating+"), supports "+tflat.nVerticalSupports+", load/pt "+tflat.loadPerSupportKg+"kg, SF "+tflat.safetyFactor);

// Curved screen reuses its OWN steelWeightKg (not the flat 55% estimate)
const tcurved = PQM.computeQuote({ mode:"curved", productId:"outdoor", pitch:4, widthFt:16, heightFt:8, cabIndex:2, curveMode:"preset", preset:"signature", curveType:"outer", cabWeightKg:14 }, db);
ok("curved structuralSteelKg matches curve.steelWeightKg", tcurved.structuralSteelKg === tcurved.curve.steelWeightKg);
ok("curved loadPerSupportKg > 0", tcurved.loadPerSupportKg > 0);
console.log("     → curved 16x8: steel "+tcurved.structuralSteelKg+"kg, load/pt "+tcurved.loadPerSupportKg+"kg, SF "+tcurved.safetyFactor+", "+tcurved.mcbRating);

// MCB ladder spot-checks
ok("currentToMCB(10) = 20A", PQM.currentToMCB(10) === "20A");
ok("currentToMCB(20) = 32A", PQM.currentToMCB(20) === "32A");
ok("currentToMCB(30) = 40A", PQM.currentToMCB(30) === "40A");
ok("currentToMCB(55) → 3-phase", /3-phase/.test(PQM.currentToMCB(55)));

console.log("\n── 10 · Phase 2 bugfix: findFits manual-mode lock ──");
const cosmoAuto = PQM.findFits({ productId:"microled", widthFt:11, heightFt:8 }, db);
const cosmoMan0N = PQM.findFits({ productId:"microled", widthFt:11, heightFt:8, manualCab:true, cabIndex:0, orientation:"native" }, db);
const cosmoMan1R = PQM.findFits({ productId:"microled", widthFt:11, heightFt:8, manualCab:true, cabIndex:1, orientation:"rotated" }, db);
ok("auto mode: optimal exists", !!(cosmoAuto && cosmoAuto.optimal));
ok("manual cab=0/native: optimal locked to cabIndex 0", cosmoMan0N.optimal && cosmoMan0N.optimal.cabIndex === 0);
ok("manual cab=0/native: optimal orientation = native", cosmoMan0N.optimal && cosmoMan0N.optimal.orientation === "native");
ok("manual cab=0/native: nearest also locked", cosmoMan0N.nearest && cosmoMan0N.nearest.cabIndex === 0 && cosmoMan0N.nearest.orientation === "native");
ok("manual cab=1/rotated: optimal locked to cabIndex 1, rotated", cosmoMan1R.optimal && cosmoMan1R.optimal.cabIndex === 1 && cosmoMan1R.optimal.orientation === "rotated");
console.log("     → cosmo 11x8: auto picked "+cosmoAuto.optimal.cabLabel+"/"+cosmoAuto.optimal.orientation+" · manual locked cab0/native → "+cosmoMan0N.optimal.cabLabel+"/"+cosmoMan0N.optimal.orientation);

// Card-price honesty: nearest vs optimal must produce DIFFERENT quotes when
// they correspond to different built dimensions (round-down vs round-up).
// This is the bug Katviz caught — both cards showed ₹35,69,240 because the
// price was being computed against the user's input dims, not the fit's built dims.
const nearFit = cosmoMan0N.nearest, optFit = cosmoMan0N.optimal;
const qNear = PQM.computeQuote({ mode:"flat", productId:"microled", pitch:1.25,
  widthFt:nearFit.builtWmm/304.8, heightFt:nearFit.builtHmm/304.8,
  cabIndex:nearFit.cabIndex, orientation:nearFit.orientation, cabWeightKg:5 }, db);
const qOpt = PQM.computeQuote({ mode:"flat", productId:"microled", pitch:1.25,
  widthFt:optFit.builtWmm/304.8, heightFt:optFit.builtHmm/304.8,
  cabIndex:optFit.cabIndex, orientation:optFit.orientation, cabWeightKg:5 }, db);
ok("card prices DIFFER when nearest vs optimal have different cab counts",
   qNear.grandTotal !== qOpt.grandTotal,
   "near="+PQM.fmtINR(qNear.grandTotal)+" opt="+PQM.fmtINR(qOpt.grandTotal));
ok("near quote built matches near fit", qNear.totalCabs === nearFit.cabCountW * nearFit.cabCountH);
ok("opt quote built matches opt fit", qOpt.totalCabs === optFit.cabCountW * optFit.cabCountH,
   "qOpt="+qOpt.totalCabs+" ("+qOpt.cabCountW+"×"+qOpt.cabCountH+") vs fit="+(optFit.cabCountW*optFit.cabCountH)+" ("+optFit.cabCountW+"×"+optFit.cabCountH+") builtMm="+optFit.builtWmm+"×"+optFit.builtHmm+" → ft "+(optFit.builtWmm/304.8).toFixed(8)+"×"+(optFit.builtHmm/304.8).toFixed(8));
console.log("     → cosmo 11x8 manual cab0/native: nearest "+nearFit.cabCountW+"×"+nearFit.cabCountH+" = "+PQM.fmtINR(qNear.grandTotal)+" · optimal "+optFit.cabCountW+"×"+optFit.cabCountH+" = "+PQM.fmtINR(qOpt.grandTotal));

console.log("\n────────────────────────────");
console.log(`  RESULT: ${pass} passed, ${fail} failed`);
console.log("────────────────────────────\n");
process.exit(fail ? 1 : 0);
