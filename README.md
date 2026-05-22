# Pixel Quote Max

One calculator for **flat *and* curved** LED jobs — full engineering + instant costing, with a
print-ready PDF quote. Built for Visual Rhyme Pvt. Ltd. by merging Pixel Quote Pro (flat sales)
and the Curved LED Calculator (curved engineering) into a single deployable tool.

## Files
| File | Purpose |
|---|---|
| `index.html` | The app (single page, React via CDN — no build step). |
| `engine.js` | All the maths (pricing + geometry). Pure, unit-tested. |
| `pixel-data.xml` | **The price/product database. Edit this to change prices.** |
| `test.mjs` | Headless calculation tests (`node test.mjs`). |
| `README.md` | This file. |

## Run it
- **Quick look:** double-click `index.html`. It runs offline using a built-in copy of the price
  list (the on-screen note will say "offline fallback").
- **Proper / deployed:** serve the folder over HTTP so it reads the live `pixel-data.xml`:
  - Local: `npx serve .` (or any static server), then open the shown URL.
  - **GitHub Pages:** push this folder to a repo / branch and enable Pages — same as the curved
    calculator deploy. The app will fetch `pixel-data.xml` automatically.

## Using it
1. Pick **Flat** or **Curved** (top bar).
2. Choose product, pixel pitch, cabinet; enter width × height in **feet**.
3. Curved adds: curve type (outer/inner), curve intensity (preset / sagitta / radius), cabinet weight.
4. Read live results in the right column; quotation builds automatically.
5. **Export PDF** → browser print dialog → "Save as PDF". Drawings are included in both modes.
6. Optional URL deep-links: `?mode=curved&w=16&h=8&product=outdoor` · `?sheet=1` shows the PDF sheet on screen.

## Editing prices (the database)
Open `pixel-data.xml`. Everything is plain attributes:
- `<pitch pp="4" rate="5500" gst="18" .../>` — `rate` is **₹ per sqft**, `gst` is the GST %.
- `<tier maxPorts="2" price="25000"/>` — video-controller price by port count.
- `<tier maxArea="50" rate="300"/>` — installation ₹/sqft by total area.
- `<meta curveSurchargePct="15" .../>` — **curve-fabrication surcharge %** (currently 15%; change anytime).
- `moduleW/moduleH` and cabinet `w/h` are millimetres.

After editing, refresh the page (and re-deploy if hosted). **Also update the matching block inside
`index.html`** (the `<script id="fallback-db">`) if you want the offline/double-click copy to match.

## How the numbers work (so a quote can be defended)
- **Area** = built size (rounded **up** to whole cabinets) → `rate × area` = LED cost.
- **Controller** priced by ports = `ceil(total pixels / pixels-per-port)` (650k mini / 500k micro).
- **Install** = ₹/sqft tier × area. GST applied per line as catalogued.
- **Curved** adds the engineering layer (radius, sagitta, arc, per-joint gap + verdict, steel & power
  estimates) and a **curve-fabrication surcharge** line on top of the flat price.

> Structural/steel/power figures are pre-engineering estimates for scoping only. Final design must be
> stamped by a licensed structural engineer (IS 875 Pt 3 for wind in India). This disclaimer is printed
> on every curved PDF.

## Tests
```
node test.mjs        # 51 calculation checks — run after editing engine.js or pixel-data.xml
```
