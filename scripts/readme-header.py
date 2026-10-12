import math, sys, pathlib

out = pathlib.Path(sys.argv[1])
font_dir = pathlib.Path(sys.argv[2]).as_uri()

W, H = 1280, 400
CX, CY = 968, 352          # foot of the gnomon
R_IN, R_OUT = 214, 262     # hour ring
LAT = math.radians(42)     # horizontal-dial latitude, sets the hour-line spacing
AMBER, INK, LINE, MUTED = "#FFB70A", "#0D0D0F", "#2C2C31", "#77777F"
LOCK_HOUR = 3              # 3 pm: the hour the shadow rests on

def ang(h):                # hours from noon -> angle from the noon line
    a = math.atan(math.sin(LAT) * math.tan(math.radians(15 * abs(h)))) if abs(h) < 6 else math.pi / 2
    return math.copysign(a, h)

def pt(h, r):              # morning hours fall on the left, afternoon on the right
    a = ang(h)
    return CX + r * math.sin(a), CY - r * math.cos(a)

ROMAN = {-6: "VI", -5: "VII", -4: "VIII", -3: "IX", -2: "X", -1: "XI", 0: "XII",
         1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI"}

s = []
def arc(r, h0, h1, **kw):
    x0, y0 = pt(h0, r); x1, y1 = pt(h1, r)
    attrs = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    s.append(f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 0 1 {x1:.1f} {y1:.1f}" fill="none" {attrs}/>')

# elapsed sector: from sunrise to the locktime hour
x0, y0 = pt(-6, R_IN); x1, y1 = pt(LOCK_HOUR, R_IN)
s.append(f'<path d="M{CX} {CY} L{x0:.1f} {y0:.1f} A{R_IN} {R_IN} 0 0 1 {x1:.1f} {y1:.1f} Z" fill="url(#elapsed)"/>')

arc(R_IN, -6, 6, stroke=LINE, stroke_width=1.5)
arc(R_OUT, -6, 6, stroke=LINE, stroke_width=1.5)

for h in range(-6, 7):
    on = h == LOCK_HOUR
    x0, y0 = pt(h, 58); x1, y1 = pt(h, R_IN)
    if not on:
        s.append(f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" stroke="{LINE}" stroke-width="1.5"/>')
    lx, ly = pt(h, (R_IN + R_OUT) / 2)
    rot = math.degrees(ang(h))
    if abs(h) == 6:        # lift the end numerals clear of the base line
        ly -= 16
    s.append(f'<text x="{lx:.1f}" y="{ly:.1f}" transform="rotate({rot:.1f} {lx:.1f} {ly:.1f})" class="num" '
             f'fill="{AMBER if on else MUTED}">{ROMAN[h]}</text>')
    if h < 6:              # half-hour tick
        tx0, ty0 = pt(h + .5, R_IN); tx1, ty1 = pt(h + .5, R_IN - 10)
        s.append(f'<line x1="{tx0:.1f}" y1="{ty0:.1f}" x2="{tx1:.1f}" y2="{ty1:.1f}" stroke="{LINE}" stroke-width="1.5"/>')

# shadow: a thin wedge from the gnomon foot to the locktime hour
a = ang(LOCK_HOUR); ex, ey = pt(LOCK_HOUR, R_IN)
nx, ny = math.cos(a), math.sin(a)
s.append(f'<path d="M{CX - 4} {CY} L{ex:.1f} {ey:.1f} L{CX + 14} {CY} Z" fill="{AMBER}"/>')
s.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="5" fill="{AMBER}"/>')

# gnomon, after the Sundial mark: a right triangle standing on the dial
s.append(f'<path d="M{CX - 46} {CY} L{CX + 14} {CY} L{CX + 14} {CY - 78} Z" fill="#F4F4F5"/>')
s.append(f'<line x1="{CX - 262}" y1="{CY}" x2="{CX + 262}" y2="{CY}" stroke="{LINE}" stroke-width="1.5"/>')

dial = "\n".join(s)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs>
  <radialGradient id="elapsed" gradientUnits="userSpaceOnUse" cx="{CX}" cy="{CY}" r="{R_IN}">
    <stop offset="0" stop-color="{AMBER}" stop-opacity=".30"/>
    <stop offset="1" stop-color="{AMBER}" stop-opacity=".05"/>
  </radialGradient>
  <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="{CX}" cy="{CY}" r="520">
    <stop offset="0" stop-color="{AMBER}" stop-opacity=".10"/>
    <stop offset="1" stop-color="{AMBER}" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="card"><rect width="{W}" height="{H}" rx="20"/></clipPath>
</defs>
<g clip-path="url(#card)">
  <rect width="{W}" height="{H}" fill="{INK}"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>
  {dial}

  <path d="M72 112 L94 112 L94 84 Z" fill="{AMBER}"/>
  <text x="108" y="108" class="eyebrow">SUNDIAL PROTOCOL</text>
  <text x="68" y="212" class="title">btc-locker</text>
  <text x="72" y="258" class="tag">Timelock scripts, transactions and yield distribution</text>
  <text x="72" y="288" class="tag">for Bitcoin staking.</text>
  <text x="72" y="340" class="code"><tspan fill="{AMBER}">&lt;locktime&gt;</tspan> OP_CHECKLOCKTIMEVERIFY OP_DROP &lt;pubkey&gt; OP_CHECKSIG</text>
</g>
</svg>'''

html = f'''<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fira+Mono:wght@400;500&display=block" rel="stylesheet">
<style>
@font-face {{ font-family: Galano; font-weight: 700; src: url("{font_dir}/GalanoGrotesqueBold.otf"); }}
@font-face {{ font-family: Galano; font-weight: 500; src: url("{font_dir}/GalanoGrotesqueMedium.otf"); }}
@font-face {{ font-family: Galano; font-weight: 400; src: url("{font_dir}/GalanoGrotesqueRegular.otf"); }}
html, body {{ margin: 0; background: transparent; }}
svg {{ display: block; }}
.title {{ font: 700 92px Galano; fill: #F4F4F5; letter-spacing: -2px; }}
.eyebrow {{ font: 500 15px Galano; fill: #A1A1AA; letter-spacing: 3.5px; }}
.tag {{ font: 400 21px Galano; fill: #B4B4BC; }}
.code {{ font: 400 14.5px "Fira Mono", Consolas, monospace; fill: #6F6F78; }}
.num {{ font: 500 15px "Fira Mono", Consolas, monospace; text-anchor: middle; dominant-baseline: central; }}
</style>
{svg}'''
out.write_text(html, encoding="utf-8")
