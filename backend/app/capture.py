"""Page capture: a shared Chromium, deterministic page loads, full-page screenshot plus a DOM snapshot."""
import asyncio
import io

import numpy as np
from PIL import Image
from playwright.async_api import async_playwright, Browser

MAX_HEIGHT = 8000

FREEZE_CSS = """*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;
transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}
::-webkit-scrollbar{display:none!important} html{scrollbar-width:none!important}"""

SETTLE_JS = """async (maxH) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // walk down the page to trigger lazy-loaded content, then return to the top
  const step = Math.max(400, Math.floor(innerHeight * 0.9));
  for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxH); y += step) { scrollTo(0, y); await sleep(60); }
  scrollTo(0, 0);
  document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
  const imgs = [...document.images].filter(i => !i.complete);
  await Promise.race([Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))), sleep(3000)]);
  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(2000)]);
  document.querySelectorAll('video').forEach(v => { try { v.pause(); v.currentTime = 0; } catch (e) {} });
  await sleep(150);
}"""

# One record per *painted* element (has own text, is a replaced element, or paints a background/border/shadow).
DOM_JS = """(maxH) => {
  const SKIP = new Set(['script','style','noscript','template','head','meta','link','br','wbr','title','source','track']);
  const REPLACED = new Set(['img','svg','video','canvas','iframe','input','textarea','select','picture','object','embed']);
  const DYNAMIC = new Set(['video','canvas','iframe','object','embed']);
  const fixedCache = new Map();
  const isFixed = (el) => {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (fixedCache.has(el)) return fixedCache.get(el);
    const p = getComputedStyle(el).position;
    const v = p === 'fixed' || p === 'sticky' || isFixed(el.parentElement);
    fixedCache.set(el, v); return v;
  };
  const seg = (e) => {
    const cls = [...e.classList].filter(c => !/\\d{3,}|^css-|^sc-|^_/.test(c)).slice(0, 3);
    return e.tagName.toLowerCase() + (e.id && !/\\d{3,}/.test(e.id) ? '#' + e.id : '') + (cls.length ? '.' + cls.join('.') : '');
  };
  const keyOf = (el) => { const parts = []; let e = el;
    for (let i = 0; i < 5 && e && e !== document.body; i++, e = e.parentElement) parts.push(seg(e));
    return parts.join('<'); };
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const hex = (c) => c;
  const AD = /(^|[\\s_-])(ad|ads|advert|advertisement|gpt-ad|dfp|adslot|ad-slot|sponsor|sponsored|taboola|outbrain|promoted)([\\s_-]|$)/i;
  const adCache = new Map();
  const isAd = (el) => { let e = el;
    for (let i = 0; i < 4 && e && e !== document.body; i++, e = e.parentElement) {
      if (adCache.has(e)) return adCache.get(e);
      const idc = (e.id || '') + ' ' + (typeof e.className === 'string' ? e.className : '');
      if (AD.test(idc) || e.hasAttribute('data-ad') || e.hasAttribute('data-google-query-id')) { adCache.set(el, true); return true; }
    }
    adCache.set(el, false); return false; };
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) continue;
    if (tag !== 'svg' && el.closest('svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const x1 = r.left + scrollX, y1 = r.top + scrollY;
    if (y1 > maxH || r.bottom + scrollY < 0 || r.right < 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0) continue;
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    own = own.replace(/\\s+/g, ' ').trim();
    if (tag === 'input' || tag === 'textarea') own = (el.value || el.placeholder || '').slice(0, 120);
    const bgImg = s.backgroundImage !== 'none';
    const bg = s.backgroundColor;
    const hasBg = bg && bg !== 'transparent' && !/rgba\\(.*,\\s*0\\)$/.test(bg);
    const bw = parseFloat(s.borderTopWidth) + parseFloat(s.borderRightWidth) + parseFloat(s.borderBottomWidth) + parseFloat(s.borderLeftWidth);
    const hasBorder = bw > 0 && s.borderTopStyle !== 'none';
    const shadow = s.boxShadow !== 'none';
    if (!(own.length || REPLACED.has(tag) || bgImg || hasBg || hasBorder || shadow)) continue;
    let src = '';
    if (tag === 'img') src = el.currentSrc || el.src || '';
    else if (tag === 'svg') src = 'svg:' + hash(el.innerHTML);
    else if (tag === 'video' || tag === 'iframe') src = el.currentSrc || el.src || '';
    out.push({
      k: keyOf(el), sel: seg(el), tag,
      r: [Math.round(x1), Math.round(y1), Math.round(x1 + r.width), Math.round(y1 + r.height)],
      text: own.slice(0, 160), src: src.slice(0, 300), bgi: bgImg ? s.backgroundImage.slice(0, 300) : '',
      st: { color: s.color, background: s.backgroundColor, 'font-size': s.fontSize, 'font-weight': s.fontWeight,
            'font-family': s.fontFamily.split(',')[0].replace(/["']/g, ''), 'border-color': hasBorder ? s.borderTopColor : '',
            'border-width': hasBorder ? s.borderTopWidth : '', 'border-radius': s.borderTopLeftRadius, opacity: s.opacity,
            'text-decoration': s.textDecorationLine, 'box-shadow': shadow ? s.boxShadow.slice(0, 80) : '' },
      f: isFixed(el), dyn: DYNAMIC.has(tag) || isAd(el), op: tag.includes('-') || !!el.shadowRoot,
    });
    if (out.length >= 6000) break;
  }
  return { els: out, w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
}"""


class Capturer:
    def __init__(self, concurrency: int = 4):
        self._pw = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()
        self.sem = asyncio.Semaphore(concurrency)

    async def browser(self) -> Browser:
        async with self._lock:
            if self._browser is None or not self._browser.is_connected():
                if self._pw is None:
                    self._pw = await async_playwright().start()
                self._browser = await self._pw.chromium.launch(args=["--font-render-hinting=none", "--disable-lcd-text",
                                                                    "--force-color-profile=srgb", "--hide-scrollbars"])
            return self._browser

    async def close(self):
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    async def capture(self, url: str, width: int, loads: int, inject: str | None = None, meta: dict | None = None,
                      headers: dict | None = None):
        """Load `url` `loads` times in one context. Returns [(rgb uint8 array, dom dict)].
        `headers` are extra HTTP headers for every request (e.g. a preview-protection bypass)."""
        browser = await self.browser()
        async with self.sem:
            height = 900 if width >= 768 else 800
            ctx = await browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1,
                                            locale="en-US", timezone_id="America/Los_Angeles", reduced_motion="reduce",
                                            color_scheme="light", is_mobile=width < 768, has_touch=width < 768,
                                            extra_http_headers=headers or None)
            try:
                page = await ctx.new_page()
                results = []
                for _ in range(loads):
                    resp = await page.goto(url, wait_until="load", timeout=45000)
                    if resp is not None and resp.status >= 400:
                        raise RuntimeError(f"HTTP {resp.status} for {url}")
                    try:
                        await page.wait_for_load_state("networkidle", timeout=5000)
                    except Exception:
                        pass
                    await page.add_style_tag(content=FREEZE_CSS)
                    await page.evaluate(SETTLE_JS, MAX_HEIGHT)
                    if inject:   # test hook: mutate the page after it settles (used by the benchmark)
                        info = await page.evaluate(inject)
                        if meta is not None:
                            meta.setdefault("inject", []).append(info)
                        await page.wait_for_timeout(250)
                    dom = await page.evaluate(DOM_JS, MAX_HEIGHT)
                    png = await page.screenshot(full_page=True, animations="disabled", caret="hide")
                    img = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))[:MAX_HEIGHT]
                    results.append((img, dom))
                return results
            finally:
                await ctx.close()
