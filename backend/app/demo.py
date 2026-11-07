"""Built-in demo shop ("Acme Supply") served at /demo/v1 and /demo/v2.

v2 contains planted regressions so a fresh install can show a realistic review:
  1. Shared CSS: primary CTA button colour changed      (style change on 3 pages -> one group)
  2. Home: promo banner inserted at the top             (added element + layout shift)
  3. Product: product photo missing                     (removed image)
  4. Pricing: CTA copy changed                          (text change)
  5. Cart: checkout button nudged out of alignment       (moved element)
Both versions also contain live noise that must NOT be reported:
  a ticking clock, a random "people viewing" counter, a rotating testimonial, and a random avatar colour.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

router = APIRouter()

PAGES = {"": "Home", "product": "Product", "pricing": "Pricing", "cart": "Cart"}


def _css(v2: bool) -> str:
    cta = "#d9480f" if v2 else "#4c6ef5"          # regression 1: brand colour drift
    cta_hover = "#c2410c" if v2 else "#4263eb"
    return f"""
*{{box-sizing:border-box}} body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2933;background:#f7f8fa;-webkit-font-smoothing:antialiased}}
a{{color:inherit;text-decoration:none}}
.promo{{background:#111827;color:#fff;text-align:center;padding:14px 0;font-size:15px;font-weight:600;letter-spacing:.2px}}
header{{background:#fff;border-bottom:1px solid #e5e7eb}}
.nav{{max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:28px;padding:18px 24px}}
.logo{{font-weight:800;font-size:20px;display:flex;align-items:center;gap:8px}}
.logo i{{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#4c6ef5,#15aabf);display:inline-block}}
.nav nav{{display:flex;gap:22px;font-size:15px;color:#52606d}} .nav nav a.active{{color:#111827;font-weight:600}}
.nav .right{{margin-left:auto;display:flex;align-items:center;gap:16px;font-size:14px;color:#52606d}}
.clock{{font-variant-numeric:tabular-nums;color:#7b8794}}
.avatar{{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px}}
main{{max-width:1120px;margin:0 auto;padding:40px 24px 64px}}
.btn{{display:inline-block;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px;border:1px solid transparent;cursor:pointer}}
.btn-primary{{background:{cta};color:#fff}} .btn-primary:hover{{background:{cta_hover}}}
.btn-ghost{{background:#fff;border-color:#d2d6dc;color:#1f2933}}
.hero{{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center;padding:24px 0 48px}}
.hero h1{{font-size:48px;line-height:1.08;margin:0 0 18px;letter-spacing:-1px}} .hero p{{font-size:18px;color:#52606d;line-height:1.6;margin:0 0 28px}}
.hero .actions{{display:flex;gap:12px}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px}}
.grid3{{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}}
.product h3{{margin:14px 0 6px;font-size:17px}} .price{{font-weight:700;font-size:18px}} .muted{{color:#7b8794;font-size:14px}}
.section-title{{font-size:28px;margin:48px 0 20px;letter-spacing:-.5px}}
.testimonial{{font-size:18px;line-height:1.6}} .testimonial footer{{margin-top:12px;color:#7b8794;font-size:14px}}
.viewing{{display:inline-flex;align-items:center;gap:8px;background:#fff4e6;color:#d9480f;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600}}
.pd{{display:grid;grid-template-columns:1fr 1fr;gap:48px}} .pd h1{{font-size:36px;margin:0 0 8px}}
.photo{{width:100%;aspect-ratio:1/1;border-radius:16px;display:block}}
.specs li{{padding:10px 0;border-bottom:1px solid #eef0f3;color:#52606d}}
.plans{{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:24px}}
.plan h3{{margin:0 0 8px}} .plan .amt{{font-size:40px;font-weight:800;margin:12px 0}} .plan ul{{padding-left:18px;color:#52606d;line-height:2}}
.plan.featured{{border:2px solid #4c6ef5}}
.cart-row{{display:flex;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid #eef0f3}} .cart-row .thumb{{width:64px;height:64px;border-radius:10px}}
.summary .line{{display:flex;justify-content:space-between;padding:8px 0;color:#52606d}} .summary .total{{font-weight:800;color:#111827;font-size:18px}}
.checkout{{display:block;text-align:center;margin-top:16px}}
footer.site{{border-top:1px solid #e5e7eb;background:#fff;padding:28px 0;color:#7b8794;font-size:14px}} footer.site .in{{max-width:1120px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between}}
@media (max-width:760px){{.hero,.pd{{grid-template-columns:1fr}} .grid3,.plans{{grid-template-columns:1fr}} .hero h1{{font-size:34px}} .nav nav{{display:none}}}}
"""


def _svg(kind: str, hue: int) -> str:
    shapes = {
        "pack": '<rect x="70" y="60" width="160" height="190" rx="28" fill="#fff" opacity=".9"/><rect x="100" y="40" width="100" height="40" rx="14" fill="#fff" opacity=".7"/>',
        "bottle": '<rect x="115" y="40" width="70" height="40" rx="10" fill="#fff" opacity=".7"/><rect x="95" y="80" width="110" height="180" rx="34" fill="#fff" opacity=".9"/>',
        "lamp": '<circle cx="150" cy="120" r="70" fill="#fff" opacity=".85"/><rect x="138" y="185" width="24" height="70" fill="#fff" opacity=".7"/>',
    }
    return (f'<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" class="photo">'
            f'<defs><linearGradient id="g{hue}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl({hue},70%,62%)"/>'
            f'<stop offset="1" stop-color="hsl({hue + 40},70%,48%)"/></linearGradient></defs>'
            f'<rect width="300" height="300" fill="url(#g{hue})"/>{shapes[kind]}</svg>')


NOISE_JS = """
<script>
(function(){
  var c=document.querySelector('.clock'); function t(){var d=new Date();c.textContent=d.toLocaleTimeString('en-US',{hour12:false});} t(); setInterval(t,1000);
  var v=document.querySelector('.viewing span'); if(v){v.textContent=(7+Math.floor(Math.random()*40))+' people viewing now';}
  var q=[["“Best purchase I made all year. Shipping was fast and the quality is unreal.”","Maya R., Portland"],
         ["“Customer support answered in four minutes. Four! I'm a customer for life.”","Devin K., Austin"],
         ["“The design is beautiful and it actually holds up to daily use.”","Sofia L., Chicago"]];
  var el=document.querySelector('.testimonial'); if(el){var p=q[Math.floor(Math.random()*q.length)]; el.querySelector('p').textContent=p[0]; el.querySelector('footer').textContent=p[1];}
  var a=document.querySelector('.avatar'); var cols=['#f03e3e','#ae3ec9','#1098ad','#37b24d','#f59f00']; a.style.background=cols[Math.floor(Math.random()*cols.length)];
})();
</script>"""


def _layout(ver: str, page: str, body: str) -> str:
    v2 = ver == "v2"
    links = "".join(f'<a href="/demo/{ver}/{p}" class="{"active" if p == page else ""}">{n}</a>' for p, n in PAGES.items())
    promo = '<div class="promo">Free shipping on every order this week only. Use code SHIPFREE</div>' if (v2 and page == "") else ""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acme Supply · {PAGES[page]}</title><style>{_css(v2)}</style></head><body>
{promo}
<header><div class="nav"><a class="logo" href="/demo/{ver}/"><i></i>Acme Supply</a><nav>{links}</nav>
<div class="right"><span class="clock">--:--:--</span><a href="/demo/{ver}/cart">Cart (2)</a><span class="avatar">JS</span></div></div></header>
<main>{body}</main>
<footer class="site"><div class="in"><span>© 2026 Acme Supply, Inc.</span><span>Made in San Francisco</span></div></footer>
{NOISE_JS}</body></html>"""


def _home(ver: str) -> str:
    items = [("Trail Pack 22L", "$129", "pack", 220), ("Insulated Bottle", "$34", "bottle", 160), ("Desk Lamp Mini", "$58", "lamp", 30)]
    cards = "".join(f'<a class="card product" href="/demo/{ver}/product">{_svg(k, h)}<h3>{n}</h3><div class="price">{p}</div>'
                    f'<div class="muted">Free returns · 2-year warranty</div></a>' for n, p, k, h in items)
    return f"""
<section class="hero"><div><span class="viewing">●<span>12 people viewing now</span></span>
<h1>Gear that keeps up with you.</h1><p>Thoughtfully designed everyday carry, built to last a decade and backed by people who answer the phone.</p>
<div class="actions"><a class="btn btn-primary" href="/demo/{ver}/product">Shop bestsellers</a><a class="btn btn-ghost" href="/demo/{ver}/pricing">Join Acme+</a></div></div>
<div>{_svg("pack", 220)}</div></section>
<h2 class="section-title">Bestsellers</h2><div class="grid3">{cards}</div>
<h2 class="section-title">What customers say</h2>
<div class="card testimonial"><p>…</p><footer>…</footer></div>"""


def _product(ver: str) -> str:
    photo = "" if ver == "v2" else _svg("pack", 220)           # regression 3: image missing
    return f"""
<div class="pd"><div>{photo}</div><div><span class="muted">Packs · Best seller</span><h1>Trail Pack 22L</h1>
<div class="price" style="font-size:26px;margin:8px 0 18px">$129</div>
<p style="color:#52606d;line-height:1.7">A weatherproof daypack with a padded laptop sleeve, magnetic sternum strap and a lifetime of adventures ahead.</p>
<ul class="specs" style="list-style:none;padding:0;margin:24px 0"><li>Capacity: 22 litres</li><li>Weight: 780 g</li><li>Recycled ripstop nylon</li><li>Fits 16" laptops</li></ul>
<a class="btn btn-primary" href="/demo/{ver}/cart">Add to cart</a> <a class="btn btn-ghost" href="#">Save</a></div></div>
<h2 class="section-title">What customers say</h2><div class="card testimonial"><p>…</p><footer>…</footer></div>"""


def _pricing(ver: str) -> str:
    cta = "Start trial" if ver == "v2" else "Start free trial"   # regression 4: copy change
    plans = [("Basic", "$0", ["Standard shipping", "30-day returns"], False),
             ("Acme+", "$9", ["Free 2-day shipping", "Early access drops", "Extended warranty"], True),
             ("Teams", "$49", ["Bulk ordering", "Invoice billing", "Dedicated manager"], False)]
    cards = "".join(f'<div class="card plan{" featured" if f else ""}"><h3>{n}</h3><div class="muted">per month</div><div class="amt">{a}</div>'
                    f'<ul>{"".join(f"<li>{x}</li>" for x in feats)}</ul>'
                    f'<a class="btn {"btn-primary" if f else "btn-ghost"}" href="#">{cta if f else "Choose " + n}</a></div>'
                    for n, a, feats, f in plans)
    return f'<h1 style="font-size:40px;margin:0 0 8px;letter-spacing:-1px">Simple membership</h1><p class="muted" style="font-size:17px">Cancel anytime. No hidden fees.</p><div class="plans">{cards}</div>'


def _cart(ver: str) -> str:
    nudge = ' style="margin-left:36px;margin-right:-36px"' if ver == "v2" else ""   # regression 5: misaligned button
    rows = "".join(f'<div class="cart-row"><svg class="thumb" viewBox="0 0 10 10"><rect width="10" height="10" fill="hsl({h},70%,58%)"/></svg>'
                   f'<div style="flex:1"><div style="font-weight:600">{n}</div><div class="muted">Qty 1</div></div><div class="price">{p}</div></div>'
                   for n, p, h in [("Trail Pack 22L", "$129.00", 220), ("Insulated Bottle", "$34.00", 160)])
    return f"""<h1 style="font-size:36px;margin:0 0 24px">Your cart</h1>
<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:32px"><div class="card">{rows}</div>
<div class="card summary"><div class="line"><span>Subtotal</span><span>$163.00</span></div><div class="line"><span>Shipping</span><span>Free</span></div>
<div class="line total"><span>Total</span><span>$163.00</span></div><a class="btn btn-primary checkout" href="#"{nudge}>Checkout</a></div></div>"""


RENDER = {"": _home, "product": _product, "pricing": _pricing, "cart": _cart}


@router.get("/demo/{ver}/", response_class=HTMLResponse)
@router.get("/demo/{ver}/{page}", response_class=HTMLResponse)
def demo_page(ver: str, page: str = ""):
    if ver not in ("v1", "v2") or page not in RENDER:
        raise HTTPException(404)
    return HTMLResponse(_layout(ver, page, RENDER[page](ver)), headers={"Cache-Control": "no-store"})


DEMO_PATHS = [{"path": "/", "name": "Home"}, {"path": "/product", "name": "Product"},
              {"path": "/pricing", "name": "Pricing"}, {"path": "/cart", "name": "Cart"}]
