/* ============================================================
   6-SIDE ROOM QUOTE BUILDER — Kunal Bhai / Panther Studios
   Reuses the live engine.js so every figure is calculator-exact.
   Emits a brand-identical, print-ready A4 HTML: 6 per-side
   summaries + one combined room total.
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const E = require_(path.join(__dir, "engine.js"));
function require_(p){ const m={exports:{}}; new Function("module","exports", fs.readFileSync(p,"utf8"))(m,m.exports); return m.exports; }

const db = E.parseDbXml(fs.readFileSync(path.join(__dir, "pixel-data.xml"), "utf8"));

/* ---- option configs (each = one identical side, ×6) ---- */
const OPTIONS = {
  "1": { wh:14, project:"6 Phase Room", ref:"VR-2026-2831", out:"kunal-panther-6side", pdf:"6-Phase-Room-Panther-Studios-6Side-Quote" },
  "2": { wh:12, project:"6 Phase Room (Option 2)", ref:"VR-2026-2837", out:"kunal-panther-6side-opt2", pdf:"6-Phase-Room-Panther-Studios-6Side-Quote-Option2" },
};
const OPT = OPTIONS[process.argv[2] || "1"];

const SIDES = 6;
const side = E.computeQuote({ mode:"flat", productId:"indoor", pitch:2.5, widthFt:OPT.wh, heightFt:OPT.wh, cabIndex:0 }, db);

const meta = { project:OPT.project, client:"Kunal Bhai, Panther Studios", ref:OPT.ref, date:"03 Jun 2026" };

/* ---- combined room totals ---- */
const room = {
  lines: side.lines.map(l => ({ ...l, amount: l.amount*SIDES, gst: l.gst*SIDES })),
  subtotal: side.subtotal*SIDES,
  totalGst: side.totalGst*SIDES,
  grandTotal: side.grandTotal*SIDES,
  totalCabs: side.totalCabs*SIDES,
  totalMods: side.totalMods*SIDES,
  totalPixels: side.totalPixels*SIDES,
  areaSqft: side.areaSqft*SIDES,
  ports: side.ports*SIDES,
};

const fmt = E.fmtINR;
const num = (n,d=0)=> Number(n).toLocaleString("en-IN",{maximumFractionDigits:d,minimumFractionDigits:d});

/* ============================================================
   Elevation drawing — ported 1:1 from index.html ElevationDrawing
   ============================================================ */
function elevationSVG(r){
  const C={navyLight:"#0F0826",magenta:"#9d20d6",lavender:"#c89dd9",cream:"#F5EFE6",amber:"#E5B454",line:"#2A1F3D",purple:"#793494"};
  const W=560,H=320,pad=30, aspect=r.builtWmm/r.builtHmm;
  let dW=W-2*pad, dH=dW/aspect; if(dH>H-2*pad-40){dH=H-2*pad-40;dW=dH*aspect;}
  const x0=(W-dW)/2,y0=44, cpw=dW/r.cabCountW, cph=dH/r.cabCountH;
  let cabs="";
  for(let row=0; row<r.cabCountH; row++) for(let c=0; c<r.cabCountW; c++){
    const x=x0+c*cpw, y=y0+row*cph, idx=row*r.cabCountW+c+1;
    let inner="";
    for(let j=0;j<r.modPerCabW-1;j++){ const lx=x+((j+1)*cpw)/r.modPerCabW; inner+=`<line x1="${lx}" y1="${y}" x2="${lx}" y2="${y+cph}" stroke="${C.lavender}" stroke-width="0.4" opacity="0.5"/>`; }
    for(let j=0;j<r.modPerCabH-1;j++){ const ly=y+((j+1)*cph)/r.modPerCabH; inner+=`<line x1="${x}" y1="${ly}" x2="${x+cpw}" y2="${ly}" stroke="${C.lavender}" stroke-width="0.4" opacity="0.5"/>`; }
    const lbl = cpw>34 ? `<text x="${x+cpw/2}" y="${y+cph/2+3}" text-anchor="middle" font-size="9" fill="${C.cream}" font-family="var(--mo)" opacity="0.85">C${idx}</text>` : "";
    cabs+=`<g><rect x="${x}" y="${y}" width="${cpw}" height="${cph}" fill="url(#cg)" stroke="${C.magenta}" stroke-width="0.8"/>${inner}${lbl}</g>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    <defs><pattern id="grid2" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="${C.line}" stroke-width="0.5" opacity="0.4"/></pattern>
    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C.purple}" stop-opacity="0.45"/><stop offset="100%" stop-color="${C.magenta}" stop-opacity="0.25"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="${C.navyLight}"/><rect width="${W}" height="${H}" fill="url(#grid2)"/>
    <text x="${pad}" y="24" font-size="10" fill="${C.lavender}" opacity="0.7" font-weight="600" letter-spacing="2">FRONT ELEVATION · VIEWER PERSPECTIVE</text>
    <rect x="${x0-2}" y="${y0-2}" width="${dW+4}" height="${dH+4}" fill="none" stroke="${C.amber}" stroke-width="1.5"/>
    ${cabs}
    <text x="${x0+dW/2}" y="${y0+dH+22}" text-anchor="middle" font-size="10" fill="${C.lavender}" font-family="var(--mo)">&#8592; ${num(r.builtWmm)} mm &#183; ${r.cabCountW} cab &#215; ${r.modPerCabW} mod &#8594;</text>
    <text x="${x0-10}" y="${y0+dH/2}" text-anchor="middle" font-size="10" fill="${C.lavender}" font-family="var(--mo)" transform="rotate(-90 ${x0-10} ${y0+dH/2})">${num(r.builtHmm)} mm &#183; ${r.cabCountH} &#215; ${r.modPerCabH}</text>
  </svg>`;
}

/* ---- small builders ---- */
const row = (k,v,accent)=>`<div class="row"><span class="rk">${k}</span><span class="rv"${accent?` style="color:${accent}"`:""}>${v}</span></div>`;
const mg="#9d20d6";

function sidePanel(r, n){
  return `<div class="side avoid-break">
    <div class="side-h"><span class="side-tag">SIDE ${n} OF ${SIDES}</span><span class="side-total">${fmt(r.grandTotal)}<span class="side-total-sub"> incl. GST</span></span></div>
    <div class="draw">${elevationSVG(r)}</div>
    <div class="spec">
      <div>
        <div class="sh">Configuration</div>
        ${row("Product", r.product.series)}
        ${row("Type / SKU", r.sku)}
        ${row("Pixel pitch", r.pitch+" mm")}
        ${row("Requested size", `${num(r.reqWmm/304.8,2)} &#215; ${num(r.reqHmm/304.8,2)} ft`)}
        ${row("Built size", `${num(r.builtWft,2)} &#215; ${num(r.builtHft,2)} ft`, mg)}
        ${row("Cabinet", r.cab.label)}
      </div>
      <div>
        <div class="sh">Build Quantities</div>
        ${row("Cabinets (W &#215; H)", `${r.cabCountW} &#215; ${r.cabCountH} = ${r.totalCabs}`, mg)}
        ${row("Modules / cabinet", `${r.modPerCabW} &#215; ${r.modPerCabH} = ${r.modPerCab}`)}
        ${row("Total modules", num(r.totalMods))}
        ${row("Pixel resolution", `${num(r.pxW)} &#215; ${num(r.pxH)} px`)}
        ${row("Active area", `${num(r.areaSqft,1)} sqft`)}
        ${row("Controller ports", String(r.ports))}
      </div>
    </div>
    <table class="pt side-pt"><tbody>
      <tr><td>LED Display</td><td class="r">${fmt(r.lines[0].amount)}</td><td class="r mut">+${fmt(r.lines[0].gst)} GST</td></tr>
      <tr><td>Video Controller (${r.ports} ports)</td><td class="r">${fmt(r.lines[1].amount)}</td><td class="r mut">+${fmt(r.lines[1].gst)} GST</td></tr>
      <tr><td>Installation</td><td class="r">${fmt(r.lines[2].amount)}</td><td class="r mut">+${fmt(r.lines[2].gst)} GST</td></tr>
      <tr class="sub"><td>Side subtotal</td><td class="r">${fmt(r.subtotal)}</td><td class="r mut">+${fmt(r.totalGst)} GST</td></tr>
    </tbody></table>
  </div>`;
}

const fullTable = (r)=>`<table class="pt"><thead><tr><th>Item</th><th>Rate</th><th>Qty (&#215;6)</th><th class="r">Amount</th><th class="r">GST%</th><th class="r">GST</th></tr></thead>
  <tbody>
    <tr><td>LED Display</td><td>${fmt(side.lines[0].rate)}/sqft</td><td>${num(r.areaSqft,1)} sqft</td><td class="r">${fmt(r.lines[0].amount)}</td><td class="r">${r.lines[0].gstPct}%</td><td class="r">${fmt(r.lines[0].gst)}</td></tr>
    <tr><td>Video Controller</td><td>Per system</td><td>${r.ports} port(s)</td><td class="r">${fmt(r.lines[1].amount)}</td><td class="r">${r.lines[1].gstPct}%</td><td class="r">${fmt(r.lines[1].gst)}</td></tr>
    <tr><td>Installation</td><td>${fmt(side.lines[2].rate)}/sqft</td><td>${num(Math.ceil(side.areaSqft)*SIDES)} sqft</td><td class="r">${fmt(r.lines[2].amount)}</td><td class="r">${r.lines[2].gstPct}%</td><td class="r">${fmt(r.lines[2].gst)}</td></tr>
  </tbody>
  <tfoot>
    <tr class="ft"><td colspan="3">Subtotal (6 sides)</td><td class="r">${fmt(r.subtotal)}</td><td></td><td class="r">${fmt(r.totalGst)}</td></tr>
    <tr class="gt"><td colspan="3">Grand Total — full room (incl. GST)</td><td colspan="3" class="r">${fmt(r.grandTotal)}</td></tr>
  </tfoot></table>`;

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>6 Phase Room — 6-Side LED Quotation · Visual Rhyme</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  :root{--magenta:#9d20d6;--ink:#1A1208;--muted:#6B5E4A;--bd:#E4DCCB;
        --fr:'Fraunces',Georgia,serif;--mn:'Manrope',system-ui,sans-serif;--mo:'JetBrains Mono',ui-monospace,monospace;}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:#d9d4cb;color:var(--ink);font-family:var(--mn);}
  .sheet{max-width:794px;margin:0 auto;background:#fff;padding:26px 30px 30px;}
  @media screen{.sheet{margin:20px auto;box-shadow:0 8px 40px rgba(0,0,0,.25);}}
  /* header */
  .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--magenta);padding-bottom:12px;}
  .hd-l{display:flex;align-items:center;gap:12px;}
  .hd-l img{height:46px;width:auto;display:block;}
  .eyebrow{font-size:10px;letter-spacing:4px;color:var(--magenta);font-weight:700;text-transform:uppercase;}
  .title{font-family:var(--fr);font-size:25px;font-weight:600;margin-top:3px;line-height:1.05;}
  .hd-r{text-align:right;font-family:var(--mo);font-size:11px;color:var(--muted);}
  .hd-r .proj{font-size:14px;color:var(--ink);font-weight:700;}
  /* room banner */
  .banner{display:flex;justify-content:space-between;align-items:stretch;gap:14px;margin-top:16px;border:1px solid var(--bd);border-radius:8px;overflow:hidden;}
  .banner .b-l{padding:14px 18px;flex:1;}
  .banner .b-r{background:var(--magenta);color:#fff;padding:14px 22px;display:flex;flex-direction:column;justify-content:center;text-align:right;min-width:230px;}
  .b-r .lab{font-size:10px;letter-spacing:2px;text-transform:uppercase;opacity:.85;}
  .b-r .val{font-family:var(--mo);font-size:27px;font-weight:700;line-height:1.05;margin-top:2px;}
  .b-r .sub2{font-size:10px;opacity:.85;margin-top:3px;font-family:var(--mo);}
  .mini{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 16px;}
  .mini .m .mk{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);font-weight:700;}
  .mini .m .mv{font-family:var(--mo);font-size:14px;font-weight:600;margin-top:1px;}
  .sec{font-size:11px;letter-spacing:2px;color:var(--magenta);font-weight:700;text-transform:uppercase;margin:20px 0 8px;}
  /* side panel */
  .side{border:1px solid var(--bd);border-radius:8px;padding:12px 14px;margin-bottom:12px;}
  .side-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
  .side-tag{font-size:11px;letter-spacing:2px;font-weight:800;color:var(--magenta);text-transform:uppercase;}
  .side-total{font-family:var(--mo);font-size:17px;font-weight:800;color:var(--ink);}
  .side-total-sub{font-size:9px;font-weight:600;color:var(--muted);letter-spacing:.5px;}
  .draw{border:1px solid var(--bd);border-radius:6px;overflow:hidden;}
  .spec{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:10px;}
  .sh{font-size:10px;letter-spacing:2px;color:var(--magenta);font-weight:700;text-transform:uppercase;margin-bottom:5px;}
  .row{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--bd);}
  .rk{font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;color:var(--muted);font-weight:600;}
  .rv{font-family:var(--mo);font-size:12px;font-weight:600;color:var(--ink);}
  /* tables */
  .pt{width:100%;border-collapse:collapse;margin-top:6px;}
  .pt th{padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--bd);font-weight:700;}
  .pt td{padding:7px 8px;font-size:12px;border-bottom:1px solid var(--bd);color:var(--ink);}
  .pt .r{text-align:right;font-family:var(--mo);font-weight:600;}
  .pt th.r{text-align:right;}
  .pt .mut{color:var(--muted);font-weight:500;font-size:10.5px;}
  .side-pt{margin-top:10px;}
  .side-pt td{padding:5px 8px;border-bottom:1px dotted var(--bd);}
  .side-pt .sub td{font-weight:800;border-top:1.5px solid var(--bd);border-bottom:none;}
  .pt tfoot .ft td{font-weight:700;border-top:2px solid var(--bd);font-size:12.5px;}
  .pt tfoot .gt td{font-weight:800;font-size:16px;color:var(--magenta);border:none;padding-top:10px;}
  .notes{margin-top:16px;font-size:10.5px;line-height:1.6;color:var(--muted);}
  .notes strong{color:var(--ink);}
  .foot{margin-top:16px;padding-top:10px;border-top:1px solid var(--bd);font-size:9.5px;color:var(--muted);text-align:center;letter-spacing:.5px;line-height:1.6;}
  .pg-break{break-before:page;}
  .avoid-break{break-inside:avoid;}
  @media print{ html,body{background:#fff;} .sheet{margin:0;max-width:none;box-shadow:none;padding:0;} @page{size:A4 portrait;margin:13mm;} }
</style></head>
<body><div class="sheet">
  <div class="hd avoid-break">
    <div class="hd-l">
      <img src="logo.png" alt="Visual Rhyme"/>
      <div>
        <div class="eyebrow">Visual Rhyme Pvt. Ltd.</div>
        <div class="title">Pixel Quote Max — 6-Side Room Quotation</div>
      </div>
    </div>
    <div class="hd-r">
      <div class="proj">${meta.project}</div>
      <div>${meta.client}</div>
      <div>${meta.ref}</div>
      <div>${meta.date}</div>
    </div>
  </div>

  <div class="banner avoid-break">
    <div class="b-l">
      <div class="sh" style="margin-bottom:8px">Room Overview — 6 Identical Sides</div>
      <div class="mini">
        <div class="m"><div class="mk">Sides</div><div class="mv">${SIDES} × ${num(side.builtWft,1)}×${num(side.builtHft,1)} ft</div></div>
        <div class="m"><div class="mk">Product</div><div class="mv">${side.product.series}</div></div>
        <div class="m"><div class="mk">SKU / Pitch</div><div class="mv">${side.sku}</div></div>
        <div class="m"><div class="mk">Total active area</div><div class="mv">${num(room.areaSqft,1)} sqft</div></div>
        <div class="m"><div class="mk">Total cabinets</div><div class="mv">${num(room.totalCabs)}</div></div>
        <div class="m"><div class="mk">Total modules</div><div class="mv">${num(room.totalMods)}</div></div>
        <div class="m"><div class="mk">Total pixels</div><div class="mv">${num(room.totalPixels)}</div></div>
        <div class="m"><div class="mk">Controller ports</div><div class="mv">${num(room.ports)}</div></div>
      </div>
    </div>
    <div class="b-r">
      <div class="lab">Grand Total · Full Room</div>
      <div class="val">${fmt(room.grandTotal)}</div>
      <div class="sub2">incl. GST · ${SIDES} sides · ${fmt(side.grandTotal)} per side</div>
    </div>
  </div>

  <div class="sec">Per-Side Breakdown</div>
  ${Array.from({length:SIDES},(_,i)=>sidePanel(side,i+1)).join("\n")}

  <div class="sec pg-break">Combined Quotation — All ${SIDES} Sides</div>
  <div class="avoid-break">${fullTable(room)}</div>

  <div class="notes avoid-break"><strong>Notes:</strong> Pricing reflects 6 identical sides (each ${num(side.builtWft,2)} × ${num(side.builtHft,2)} ft built, ${side.sku}). ACP, scaffolding, H-frame priced as actual. Quote valid 7 working days. All prices inclusive of GST as itemised. Transportation, fabrication & electrical work charged additional unless specified. Controllers quoted per side; a centralised controller layout may reduce port count on final engineering.</div>
  <div class="foot">
    VISUAL RHYME PVT. LTD. · 913, Avirat Silver Radiance 4, SG Hwy, Gota, Ahmedabad-382481 · visualrhyme.digital<br/>
    © ${new Date().getFullYear()} Visual Rhyme Pvt. Ltd. · Kathan Mehta · All rights reserved. This is a tool and can contain errors — verify before ordering.
  </div>
</div></body></html>`;

const out = path.join(__dir, OPT.out + ".html");
fs.writeFileSync(out, html, "utf8");
console.log("Wrote", out, "| PDF target:", OPT.pdf);
console.log("Per side grand:", fmt(side.grandTotal), "| Room grand:", fmt(room.grandTotal));
console.log("Room: cabs", room.totalCabs, "area", num(room.areaSqft,1), "ports", room.ports, "pixels", num(room.totalPixels));
