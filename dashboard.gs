/* =============================================================================
   PIXEL QUOTE MAX — Board Dashboard (Google Apps Script)
   -----------------------------------------------------------------------------
   Standalone Apps Script web app. Deploy as:
     - Execute as: USER ACCESSING the web app
     - Who has access: Anyone with Google account
   so that Session.getActiveUser().getEmail() returns the verified visitor email
   (Google does the auth; no OAuth client ID needed).

   Reads leads from the same spreadsheet your doPost writes to.
   Renders an embedded SVG-chart dashboard. No external libraries.

   See dashboard-deploy.md for step-by-step deployment.
   ============================================================================= */

// === EDIT THESE TWO CONSTANTS ===
const SHEET_ID = 'PASTE_YOUR_LEADS_SHEET_ID_HERE';
const ALLOWED_EMAILS = [
  'email1@example.com',
  'email2@example.com',
  'email3@example.com',
  'email4@example.com',
  'email5@example.com',
];
const COMPANY = 'Visual Rhyme Pvt. Ltd.';

// =============================================================================

function doGet(e) {
  const visitor = (Session.getActiveUser().getEmail() || '').toLowerCase();
  const allowSet = ALLOWED_EMAILS.map(function(x){ return String(x).toLowerCase().trim(); });
  if (!visitor) return renderDenied('Sign in to a Google account to access this dashboard.');
  if (allowSet.indexOf(visitor) === -1) return renderDenied('Your account (' + visitor + ') is not authorised. Contact Visual Rhyme.');

  const data = readLeads();
  const html = renderDashboard(visitor, data);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Visual Rhyme — Board Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------------- Sheet read ---------------- */
function readLeads() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheets()[0]; // assumes leads are in the first sheet
  const last = sh.getLastRow();
  if (last < 2) return { rows: [], totals: { count: 0, value: 0, avg: 0 }, byWeek: {}, byMode: {}, byProduct: {} };

  const rng = sh.getRange(2, 1, last - 1, 6).getValues(); // Date | Name | Phone | Config | Grand Total | Ref
  const rows = [];
  let totalValue = 0;
  const byWeek = {};
  const byMode = { flat: 0, curved: 0, other: 0 };
  const byProduct = {};

  rng.forEach(function(r){
    const date = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
    const name = String(r[1] || '');
    const phone = String(r[2] || '');
    const config = String(r[3] || '');
    const total = Number(r[4]) || 0;
    const ref = String(r[5] || '');

    rows.push({ date: date, name: name, phone: phone, config: config, total: total, ref: ref });
    totalValue += total;

    // week bucket (YYYY-Www, Monday-based)
    const monday = new Date(date); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0,0,0,0);
    const wk = Utilities.formatDate(monday, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    byWeek[wk] = (byWeek[wk] || 0) + 1;

    // mode
    const cl = config.toLowerCase();
    if (cl.indexOf('flat') === 0 || cl.indexOf(' flat ') > -1) byMode.flat++;
    else if (cl.indexOf('curved') === 0 || cl.indexOf(' curved ') > -1) byMode.curved++;
    else byMode.other++;

    // product family — match by series substring
    const fam = (cl.indexOf('reyansh outdoor') > -1) ? 'Reyansh Outdoor'
              : (cl.indexOf('reyansh indoor')  > -1) ? 'Reyansh Indoor'
              : (cl.indexOf('leynna')          > -1) ? 'Leynna MicroLED'
              : 'Other';
    byProduct[fam] = (byProduct[fam] || 0) + 1;
  });

  rows.sort(function(a,b){ return b.date - a.date; });
  return {
    rows: rows,
    totals: { count: rows.length, value: totalValue, avg: rows.length ? totalValue / rows.length : 0 },
    byWeek: byWeek, byMode: byMode, byProduct: byProduct
  };
}

/* ---------------- Renderers ---------------- */
function renderDenied(msg) {
  const html =
    '<!doctype html><meta charset="utf-8"><title>Access denied</title>' +
    '<style>body{margin:0;background:#06001A;color:#F5EFE6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}' +
    '.card{max-width:440px;background:#0F0826;border:1px solid #2A1F3D;border-radius:14px;padding:32px;text-align:center}' +
    'h1{font-family:Georgia,serif;margin:0 0 12px;color:#9d20d6;font-size:22px}p{margin:8px 0;line-height:1.5;color:#c89dd9}</style>' +
    '<div class="card"><h1>Visual Rhyme — Board Dashboard</h1><p>' + escapeHtml(msg) + '</p></div>';
  return HtmlService.createHtmlOutput(html);
}

function renderDashboard(visitor, data) {
  const T = data.totals;
  const sortedWeeks = Object.keys(data.byWeek).sort();
  const recentRows = data.rows.slice(0, 10);
  const tz = Session.getScriptTimeZone();

  const css = [
    '*{box-sizing:border-box}',
    'body{margin:0;background:#06001A;color:#F5EFE6;font-family:-apple-system,Manrope,system-ui,sans-serif;padding:18px 22px}',
    '.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #2A1F3D;padding-bottom:12px;margin-bottom:18px;flex-wrap:wrap;gap:12px}',
    '.head h1{font-family:Fraunces,Georgia,serif;font-size:26px;margin:0;font-weight:600}',
    '.head .sub{font-size:11px;letter-spacing:3px;color:#9d20d6;font-weight:700;text-transform:uppercase}',
    '.user{font-size:12px;color:#c89dd9;font-family:ui-monospace,monospace;text-align:right}',
    '.hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:18px}',
    '.stat{background:#0F0826;border:1px solid #2A1F3D;border-left:3px solid #9d20d6;border-radius:12px;padding:14px 18px}',
    '.stat .lab{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#c89dd9;opacity:.7;font-weight:700}',
    '.stat .val{font-family:Fraunces,Georgia,serif;font-size:28px;color:#F5EFE6;margin-top:4px;font-weight:600}',
    '.stat .val em{color:#E5B454;font-style:normal}',
    '.row{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px}',
    '.row.full{grid-template-columns:1fr}',
    '@media(max-width:780px){.row{grid-template-columns:1fr}}',
    '.panel{background:#0F0826;border:1px solid #2A1F3D;border-radius:12px;padding:16px}',
    '.panel h2{font-family:Fraunces,Georgia,serif;font-size:15px;margin:0 0 12px;font-weight:500;color:#F5EFE6}',
    'table{width:100%;border-collapse:collapse;font-size:12px}',
    'th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #2A1F3D}',
    'th{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#c89dd9;opacity:.65;font-weight:700}',
    'td{color:#F5EFE6}.td-r{text-align:right;font-family:ui-monospace,monospace}.td-d{color:#c89dd9;font-family:ui-monospace,monospace}',
    '.foot{text-align:center;margin-top:18px;font-size:10px;color:#c89dd9;opacity:.55;letter-spacing:1px}',
  ].join('');

  const html =
    '<!doctype html><meta charset="utf-8"><title>VR Board Dashboard</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>' + css + '</style>' +
    '<div class="head">' +
      '<div><div class="sub">Visual Rhyme</div><h1>Board Dashboard</h1></div>' +
      '<div class="user">Signed in · ' + escapeHtml(visitor) + '<br>' + Utilities.formatDate(new Date(), tz, 'dd MMM yyyy · HH:mm') + '</div>' +
    '</div>' +
    '<div class="hero">' +
      statCard('Total leads', String(T.count)) +
      statCard('Pipeline value', '₹' + fmtINR(T.value)) +
      statCard('Avg quote', '₹' + fmtINR(Math.round(T.avg))) +
    '</div>' +
    '<div class="row">' +
      panel('Leads over time (weekly)', renderWeeklyBars(sortedWeeks, data.byWeek)) +
      panel('Mode mix', renderModeDonut(data.byMode)) +
    '</div>' +
    '<div class="row full">' +
      panel('Product mix', renderProductBars(data.byProduct)) +
    '</div>' +
    '<div class="row full">' +
      panel('Recent 10 leads', renderRecentTable(recentRows, tz)) +
    '</div>' +
    '<div class="foot">© ' + (new Date()).getFullYear() + ' ' + COMPANY + ' · Powered by Microtronix Solution</div>';
  return html;
}

/* ---------------- Chart helpers (inline SVG, no libs) ---------------- */
function statCard(lab, val) {
  return '<div class="stat"><div class="lab">' + escapeHtml(lab) + '</div><div class="val">' + escapeHtml(val) + '</div></div>';
}
function panel(title, body) {
  return '<div class="panel"><h2>' + escapeHtml(title) + '</h2>' + body + '</div>';
}
function renderWeeklyBars(weeks, byWeek) {
  if (!weeks.length) return '<div style="color:#c89dd9;opacity:.6;padding:20px 0;text-align:center">No leads yet.</div>';
  const lastN = weeks.slice(-12);
  const counts = lastN.map(function(w){ return byWeek[w] || 0; });
  const max = Math.max.apply(null, counts.concat([1]));
  const w = 600, h = 180, pad = 28, bw = (w - pad*2) / lastN.length;
  const bars = lastN.map(function(wk, i){
    const c = counts[i], bh = (c / max) * (h - pad*2);
    const x = pad + i*bw + 4, y = h - pad - bh;
    const lab = wk.slice(5); // MM-DD
    return '<rect x="' + x + '" y="' + y + '" width="' + (bw-8) + '" height="' + bh + '" fill="#9d20d6" rx="3"/>' +
           '<text x="' + (x + (bw-8)/2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" fill="#F5EFE6" font-family="ui-monospace,monospace">' + c + '</text>' +
           '<text x="' + (x + (bw-8)/2) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="9" fill="#c89dd9" font-family="ui-monospace,monospace">' + lab + '</text>';
  }).join('');
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block">' + bars + '</svg>';
}
function renderModeDonut(byMode) {
  const flat = byMode.flat || 0, curved = byMode.curved || 0, other = byMode.other || 0;
  const total = flat + curved + other;
  if (!total) return '<div style="color:#c89dd9;opacity:.6;padding:20px 0;text-align:center">No data yet.</div>';
  const cx = 90, cy = 90, r = 70, stroke = 22;
  const arc = function(start, len, color){
    const a0 = start * 2 * Math.PI - Math.PI/2;
    const a1 = (start + len) * 2 * Math.PI - Math.PI/2;
    const large = len > 0.5 ? 1 : 0;
    const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
    const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
    return '<path d="M ' + x0 + ' ' + y0 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 + '" stroke="' + color + '" stroke-width="' + stroke + '" fill="none" stroke-linecap="butt"/>';
  };
  let acc = 0;
  const fPart = flat/total, cPart = curved/total, oPart = other/total;
  const svg =
    '<svg viewBox="0 0 320 180" style="width:100%;height:auto;max-width:320px;display:block;margin:0 auto">' +
      arc(acc, fPart, '#9d20d6') + (function(){ acc += fPart; return ''; })() +
      arc(acc, cPart, '#E5B454') + (function(){ acc += cPart; return ''; })() +
      arc(acc, oPart, '#793494') +
      '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dy="-2" font-family="Fraunces,Georgia,serif" font-size="22" fill="#F5EFE6">' + total + '</text>' +
      '<text x="' + cx + '" y="' + (cy+15) + '" text-anchor="middle" font-size="9" fill="#c89dd9" letter-spacing="1.5">LEADS</text>' +
      legend(200, 60, '#9d20d6', 'Flat', flat, total) +
      legend(200, 88, '#E5B454', 'Curved', curved, total) +
      legend(200, 116, '#793494', 'Other', other, total) +
    '</svg>';
  return svg;
}
function legend(x,y,color,lab,n,total){
  const pct = total ? Math.round(n/total*100) : 0;
  return '<rect x="' + x + '" y="' + (y-9) + '" width="10" height="10" fill="' + color + '" rx="2"/>' +
         '<text x="' + (x+16) + '" y="' + y + '" font-size="11" fill="#F5EFE6">' + lab + '</text>' +
         '<text x="' + (x+90) + '" y="' + y + '" font-size="11" fill="#c89dd9" font-family="ui-monospace,monospace" text-anchor="end">' + n + ' · ' + pct + '%</text>';
}
function renderProductBars(byProduct) {
  const entries = Object.keys(byProduct).map(function(k){ return { k:k, v:byProduct[k] }; })
                                       .sort(function(a,b){ return b.v - a.v; });
  if (!entries.length) return '<div style="color:#c89dd9;opacity:.6;padding:20px 0;text-align:center">No data yet.</div>';
  const max = Math.max.apply(null, entries.map(function(e){ return e.v; }).concat([1]));
  const w = 600, rowH = 26, h = entries.length * rowH + 10;
  const rows = entries.map(function(e, i){
    const bw = (e.v / max) * (w - 200);
    const y = i*rowH + 16;
    return '<text x="0" y="' + y + '" font-size="12" fill="#F5EFE6">' + escapeHtml(e.k) + '</text>' +
           '<rect x="160" y="' + (y-12) + '" width="' + bw + '" height="16" fill="#9d20d6" rx="3"/>' +
           '<text x="' + (160 + bw + 6) + '" y="' + y + '" font-size="11" fill="#c89dd9" font-family="ui-monospace,monospace">' + e.v + '</text>';
  }).join('');
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block">' + rows + '</svg>';
}
function renderRecentTable(rows, tz) {
  if (!rows.length) return '<div style="color:#c89dd9;opacity:.6;padding:20px 0;text-align:center">No leads yet.</div>';
  const body = rows.map(function(r){
    return '<tr>' +
      '<td class="td-d">' + Utilities.formatDate(r.date, tz, 'dd MMM · HH:mm') + '</td>' +
      '<td>' + escapeHtml(r.name) + '</td>' +
      '<td class="td-d">' + escapeHtml(r.phone) + '</td>' +
      '<td>' + escapeHtml(r.config) + '</td>' +
      '<td class="td-r">₹' + fmtINR(r.total) + '</td>' +
      '<td class="td-d">' + escapeHtml(r.ref) + '</td>' +
    '</tr>';
  }).join('');
  return '<table><thead><tr><th>When</th><th>Name</th><th>Phone</th><th>Config</th><th>Total</th><th>Ref</th></tr></thead><tbody>' + body + '</tbody></table>';
}

/* ---------------- Utils ---------------- */
function fmtINR(n){
  n = Math.round(Number(n) || 0);
  const s = String(Math.abs(n));
  // Indian numbering: last three digits grouped, then groups of two
  const tail = s.slice(-3);
  const head = s.slice(0, -3);
  const grouped = head ? head.replace(/(\d)(?=(\d\d)+$)/g, '$1,') + ',' + tail : tail;
  return (n < 0 ? '-' : '') + grouped;
}
function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
