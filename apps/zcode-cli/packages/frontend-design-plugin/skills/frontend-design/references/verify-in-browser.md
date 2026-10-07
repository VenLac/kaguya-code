# Verify in the browser

Step 6. Measure the rendered page. Reading the CSS is not enough: selector conflicts, opacity, animations, fallback fonts and what sits behind text only show up once the page is rendered.

The audit below is plain JavaScript. It needs no install and works in any browser tool that can evaluate script in the page.

## What it reports

| Type | Meaning | Typical fix |
| --- | --- | --- |
| `low-contrast` | Computed text color against the effective background is under 4.5:1 (3:1 for large text) | Fix the *winning* rule; see "Reading the results" |
| `contrast-unverified` | Background is a gradient or image; ratio is near the limit | Check by eye at the worst spot; add a scrim or solid fill |
| `tiny-text` | Font size under 12px | Raise it, or confirm it is purely decorative |
| `invisible-text` | Fill is transparent and there is no text stroke | Give it a fill or remove it |
| `horizontal-scroll`, `text-past-viewport` | Page or text extends beyond the viewport width | Fix widths, `min-width`, wrapping, or the overflowing element |
| `short-last-line` | A multi-line block ends with 1–2 characters (often a Chinese word split) | Adjust width, `text-wrap`, or break deliberately |
| `no-h1`, `h1-below-fold`, `no-action-in-first-view`, `no-supporting-text-in-first-view` | The first view lacks a headline, a visible action, or supporting text | Rework the first view |
| `hiddenByAnimation` (a count) | Text still at opacity 0 when measured (scroll reveals) | Informational: those elements were measured as if shown; make sure content is visible without the animation |

`firstView` also lists the h1, the actions in view, and `h1.heightShare` (the fraction of the viewport height the h1 occupies). These are facts for you to judge against the style; they are not pass/fail by themselves.

## How to run it

### With a browser tool (for example `browser-use`)

1. Open the page and set the viewport: first 1440×900, then 390×844.
2. Evaluate the function below in the page, then evaluate `await designAudit()` and read the JSON.
3. Fix, reload, run again at both widths.

### With headless Chrome (when no browser tool is available)

Chrome headless enforces a minimum window width of about 500px, so it cannot reproduce 390px exactly; use a browser tool or device emulation for true mobile checks, and use headless for desktop and for an approximate narrow check.

Append the audit to a copy of the page, write the result into the DOM, and dump it:

```
node -e '
const fs=require("fs");
const page=fs.readFileSync(process.argv[1],"utf8");
const js=fs.readFileSync(process.argv[2],"utf8");
const inj="<pre id=\"__audit\" hidden></pre><script>"+js+"\naddEventListener(\"load\",()=>setTimeout(async()=>{const r=await designAudit();document.getElementById(\"__audit\").textContent=JSON.stringify(r)},500));</script></body>";
fs.writeFileSync(process.argv[3],page.replace("</body>",inj));
' PAGE.html AUDIT.js /tmp/page-audited.html

google-chrome-stable --headless=new --no-sandbox --disable-gpu --virtual-time-budget=20000 \
  --window-size=1440,900 --dump-dom file:///tmp/page-audited.html
```

Save the audit function below as `AUDIT.js`. The JSON is inside `<pre id="__audit">` in the dumped DOM. Screenshots: `--screenshot=out.png` with the same flags.

Notes: virtual time may not fire scroll observers, so content hidden by scroll animations is reported in `hiddenByAnimation` and measured as if shown. Fonts loaded from the network may be missing offline; the audit measures whatever actually rendered.

## Reading the results

- **`low-contrast` on a control inside a container** (nav, header, toolbar): suspect a descendant selector from the container winning over the component's own color. Fix the specificity, not just the color value.
- **`low-contrast` on an outlined or ghost glyph**: the audit measures the text stroke. Decorative glyphs may be acceptable; if the glyph is meant to be read (a section number a visitor needs), raise it.
- **`low-contrast` on separators such as `/` or `·`**: usually decorative; fine to leave if nothing depends on them.
- **`tiny-text` on tracked caps labels**: acceptable only for non-essential metadata. If the label tells the visitor something they need, enlarge it.
- **Several of the same type**: fix the token or the shared rule once, not each element.
- **A finding you decide to keep**: state it in one line in your report ("`.sep` slashes at 2.2:1 are decorative").

Do not report the design as done while unexplained `low-contrast`, `horizontal-scroll`, `no-h1`, `h1-below-fold` or `no-action-in-first-view` remain.

## The audit function

```js
/* Design audit: run in the rendered page (browser tool evaluate, or injected). Returns a JSON-able report. */
async function designAudit(opts) {
  opts = Object.assign({ scroll: true, maxIssues: 60 }, opts || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Trigger scroll-reveal animations first, otherwise hidden text is measured as invisible.
  if (opts.scroll) {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += Math.max(300, innerHeight * 0.7)) { scrollTo(0, y); await sleep(120); }
    scrollTo(0, 0); await sleep(250);
  }

  // Any CSS color (hex, rgb, oklch, color-mix, ...) -> sRGB [r,g,b,a] via a 1x1 canvas.
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const toRGBA = (css) => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (fg, bg) => {
    const a = fg[3]; return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  // Effective background: composite ancestor backgrounds until opaque. Gradient/image => unverified.
  const bgOf = (el) => {
    const stack = []; let unverified = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") unverified = true;
      const c = toRGBA(cs.backgroundColor);
      if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return { color: base, unverified };
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity) || 0; return o; };
  const visible = (el, r) => {
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const label = (el) => {
    const id = el.id ? "#" + el.id : ""; const cls = (typeof el.className === "string" && el.className.trim()) ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + id + cls;
  };

  const issues = []; const push = (type, el, detail) => { if (issues.length < opts.maxIssues) issues.push(Object.assign({ type, el: label(el) }, detail)); };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textEls = 0; let hiddenByAnimation = 0;
  while (walker.nextNode()) {
    const t = walker.currentNode; if (!t.nodeValue.trim()) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (!visible(el, r)) continue;
    textEls++;
    const cs = getComputedStyle(el);
    const opRaw = opacityOf(el);
    const text = t.nodeValue.trim().slice(0, 28);
    // Elements still animating in (scroll reveals) are measured as if fully shown, and counted separately.
    if (opRaw < 0.05) hiddenByAnimation++;
    const op = opRaw < 0.05 ? 1 : opRaw;
    const px = parseFloat(cs.fontSize); const weight = parseInt(cs.fontWeight, 10) || 400;
    let fgRaw = toRGBA(cs.color); fgRaw[3] *= op;
    // Hollow/outlined text: transparent fill + text stroke -> measure the stroke colour instead.
    const strokeW = parseFloat(cs.webkitTextStrokeWidth) || 0;
    let hollow = false;
    if (fgRaw[3] < 0.05) {
      if (strokeW > 0) { fgRaw = toRGBA(cs.webkitTextStrokeColor); fgRaw[3] *= op; hollow = true; }
      else { push("invisible-text", el, { text, note: "fill is transparent and there is no stroke" }); continue; }
    }
    const bg = bgOf(el); const fg = over(fgRaw, bg.color);
    const cr = ratio(fg, bg.color);
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (cr < need) push("low-contrast", el, { text, ratio: +cr.toFixed(2), need, fontSize: px, color: hollow ? cs.webkitTextStrokeColor + " (stroke)" : cs.color, bgUnverified: bg.unverified || undefined });
    else if (bg.unverified && cr < need + 1.5) push("contrast-unverified", el, { text, ratio: +cr.toFixed(2), note: "gradient/image background; check by eye" });
    if (px < 12) push("tiny-text", el, { text, fontSize: px });
  }

  // Horizontal overflow
  const docOverflow = document.documentElement.scrollWidth - innerWidth;
  if (docOverflow > 1) issues.push({ type: "horizontal-scroll", overflowPx: docOverflow });
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect(); if (!visible(el, r)) continue;
    if (r.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed" && r.width < innerWidth * 3 && el.children.length === 0 && (el.textContent || "").trim()) {
      push("text-past-viewport", el, { right: Math.round(r.right), viewport: innerWidth });
    }
  }

  // CJK: last line of a multi-line block is only 1-2 characters (usually a word split in the middle)
  const cjk = /[㐀-鿿]/;
  for (const el of document.querySelectorAll("h1,h2,h3,h4,p,li,blockquote")) {
    const r = el.getBoundingClientRect(); if (!visible(el, r)) continue;
    const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && cjk.test(n.nodeValue));
    if (!tn.length || el.textContent.length > 300) continue;
    const lines = new Map(); const rng = document.createRange();
    for (const n of el.querySelectorAll("*").length ? [el] : [el]) {
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const node = w.currentNode;
        for (let i = 0; i < node.nodeValue.length; i++) {
          if (!node.nodeValue[i].trim()) continue;
          rng.setStart(node, i); rng.setEnd(node, i + 1);
          const b = rng.getBoundingClientRect(); if (!b.width) continue;
          const key = Math.round(b.top / 4); lines.set(key, (lines.get(key) || 0) + 1);
        }
      }
    }
    const keys = [...lines.keys()].sort((a, b) => a - b);
    if (keys.length > 1 && lines.get(keys[keys.length - 1]) <= 2 && el.textContent.trim().length > 6) {
      push("short-last-line", el, { text: el.textContent.trim().slice(0, 28), lastLineChars: lines.get(keys[keys.length - 1]), lines: keys.length });
    }
  }

  // First view: what a visitor sees without scrolling
  const inView = (el) => { const r = el.getBoundingClientRect(); return visible(el, r) && r.bottom > 0 && r.top < innerHeight && opacityOf(el) > 0.05; };
  const h1 = document.querySelector("h1");
  const actions = [...document.querySelectorAll("a[href],button,[role=button]")].filter((e) => inView(e) && e.textContent.trim());
  const firstView = {
    viewport: innerWidth + "x" + innerHeight,
    h1: h1 ? { text: h1.textContent.trim().slice(0, 40), inView: inView(h1), bottom: Math.round(h1.getBoundingClientRect().bottom), heightShare: +(h1.getBoundingClientRect().height / innerHeight).toFixed(2) } : null,
    actionsInView: actions.slice(0, 8).map((e) => e.textContent.trim().slice(0, 20)),
    bodyTextBlocksInView: [...document.querySelectorAll("p,li,h2,h3")].filter(inView).length,
  };
  if (!h1) issues.push({ type: "no-h1" });
  if (h1 && !firstView.h1.inView) issues.push({ type: "h1-below-fold" });
  if (!firstView.actionsInView.length) issues.push({ type: "no-action-in-first-view" });
  if (firstView.bodyTextBlocksInView === 0) issues.push({ type: "no-supporting-text-in-first-view", note: "heading/value proposition not supported by any text in the first view" });

  const counts = {}; issues.forEach((i) => { counts[i.type] = (counts[i.type] || 0) + 1; });
  return { textElementsChecked: textEls, hiddenByAnimation, firstView, counts, issues };
}
```
