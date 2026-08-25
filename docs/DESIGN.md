# Dark Product Landing — Design System

A reusable style for dark, high-contrast product landing pages: fintech, crypto,
developer tools, anything that wants to feel precise rather than friendly.

Derived by measuring a reference implementation during a clone study. The
**structural rules here are generic craft** — surface ladders, fluid type,
panel composition, motion curves. The specific brand hue and wordmark are not
yours to ship; swap them in `tokens.css` before any project goes public.

---

## How to use this in a new project

Copy two files into the new repo:

```
css/tokens.css      → the variables
docs/DESIGN.md      → this file
```

Then point Claude Code at it. Paste this at the start of a session:

> Read `docs/DESIGN.md` and `css/tokens.css`. Build using that system — use the
> tokens, don't invent new colors or spacing values. My accent is `#XXXXXX`.
> Inter for type (400/500/600 only), Phosphor for icons.

The two dependencies, in the `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/bold/style.css">
```

That is the whole workflow. The tokens do the enforcing; this doc explains the
decisions behind them so the output does not drift.

---

## The five rules that make it work

If you remember nothing else:

1. **One accent, everything else greyscale.** A single saturated colour against a
   near-black ladder. Two accents kill it.
2. **Every heading is weight 400.** Hierarchy comes from size and letter-spacing,
   never from weight. No 300, no 700.
3. **Borders are light at very low alpha** — `rgba(239,245,235,0.1)` — never a
   solid grey. Solid borders make dark UI look cheap.
4. **Radii are large.** 28px on cards, 76.8px on the big panel. Timid radii read
   as unstyled.
5. **Sections have no divider lines.** Space separates them. Adding rules between
   sections is the fastest way to make this look like a template.

---

## Colour

### The surface ladder

Dark UI fails when backgrounds jump. Five steps, each a small lift:

| Token | Use |
|---|---|
| `--canvas` | page background |
| `--canvas-deep` | footer, full-bleed sections |
| `--surface-1` | cards, panels |
| `--surface-2` | hovered / nested cards |
| `--surface-3` | chips, badges, inset controls |

An embedded app mockup gets its **own colder ladder** (`--app-bg`, `--app-card`,
`--app-line`). This is the trick that makes a screenshot-style mockup read as a
separate product surface instead of just another card.

### Ink

Three weights only: `--ink` (headings), `--ink-soft` (body), `--ink-muted`
(labels, meta). Need a fourth? Use `opacity` on an existing one — placeholder
text at `0.48`, de-emphasised links at `0.62`.

---

## Typography

**Inter**, weight 400 throughout. It is the right pick here because its tall
x-height stays legible at the 10–12px label sizes this system leans on, and its
tabular/slashed-zero figures handle addresses and numerics cleanly.

### Loading it

Load **only 400, 500, 600**. This system has no light or bold display type, and
every extra weight is a separate download.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
```

`display=swap` matters — without it the page renders invisible text while the
font loads. The two `preconnect` hints save a round trip on first paint.

Self-hosting is better for production (no third-party request, no layout shift).
Grab the variable font from [rsms.me/inter](https://rsms.me/inter/) and:

```css
@font-face {
  font-family: Inter;
  font-style: normal;
  font-weight: 100 900;          /* one file covers the whole range */
  font-display: swap;
  src: url("/fonts/InterVariable.woff2") format("woff2");
}
```

### Base rule

```css
body {
  font-family: var(--font-sans);
  font-feature-settings: var(--font-features);   /* cv05, cv08, calt */
  -webkit-font-smoothing: antialiased;
}
```

`cv05`/`cv08` give Inter's single-storey `l` and slashed zero — worth having when
the page shows wallet addresses, hashes, or IDs. Add `font-variant-numeric:
tabular-nums` **only** to figures in columns that must align; on a free-flowing
address it just makes the line wider.

### The scale

| Token | Size | Line height | Tracking |
|---|---|---|---|
| `--text-hero` | `clamp(2rem, 4vw, 3.4rem)` | 1.05 | −0.03em |
| `--text-h2` | 2.25rem | 1.05 | normal |
| `--text-h3` | `clamp(1.55rem, 1.7vw, 2rem)` | 1.08 | −0.02em |
| `--text-lead` | 1.125rem | 1.6 | normal |
| `--text-body` | 0.875rem | 1.55 | normal |
| `--text-label` | 0.6875rem | 1 | **+0.12em**, uppercase |

**The tracking rule:** tighten as type grows, open up as it shrinks. Big display
type gets negative tracking; small uppercase labels get generous positive
tracking. This single habit does most of the work.

Only two things are fluid (`clamp`) — the hero and the card title. Everything
else is fixed and steps down at the breakpoint. Making every size fluid produces
mush.

---

## Icons

**[Phosphor](https://phosphoricons.com)** — `@phosphor-icons/web`. It pairs well
with Inter: same geometric construction, consistent stroke, and it ships six
weights so icons can sit at the same visual weight as the text next to them.

### Loading

Icons are a webfont mapped through Unicode's Private Use Area. Link **one
stylesheet per weight you actually use**:

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css">
```

URL pattern: `…/@phosphor-icons/web@<VERSION>/src/<WEIGHT>/style.css`

Or via npm, importing only what you need:

```sh
npm install @phosphor-icons/web
```

```js
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/fill";
```

> **Do not** load all six weights with the bare `<script>` tag — that pulls in
> roughly 3MB of fonts. Pick one, maybe two.

### Usage

```html
<i class="ph ph-arrow-up-right"></i>          <!-- regular -->
<i class="ph-bold ph-wallet"></i>
<i class="ph-fill ph-circle"></i>
```

Weight classes: `.ph` (regular), `.ph-thin`, `.ph-light`, `.ph-bold`,
`.ph-fill`, `.ph-duotone`. Regular is the odd one — it's `.ph`, not
`.ph-regular`.

### Which weight

| Context | Weight |
|---|---|
| Body copy, inline links | `.ph` regular |
| Nav, buttons, UI chrome | `.ph-bold` — holds up at small sizes |
| Filled states, active tabs, bullets | `.ph-fill` |
| Large feature/marketing accents | `.ph-duotone` (uses the accent well) |

Pick **one** weight as the default across the interface and treat the others as
exceptions. Mixed icon weights on the same screen look like an accident.

### Styling

They're text, so size with `font-size` and colour with `color`:

```css
.nav__icon { font-size: var(--icon-md); color: var(--ink-soft); }
.feature__icon { font-size: var(--icon-xl); color: var(--accent); }
```

To align an icon optically with a text label, put both in a flex row — never
nudge with `vertical-align`:

```css
.with-icon { display: inline-flex; align-items: center; gap: 0.5em; }
```

Using `em` for the gap keeps the spacing proportional as the text scales.

> **Never override** `font-family`, `font-style`, `font-weight`, `font-variant`,
> or `text-transform` on an icon element — it renders unprintable characters
> instead of the glyph. The same goes for `::before` (and `::after` on duotone),
> which is where the glyph is injected.

### Accessibility

An `<i>` icon is invisible to assistive tech, which is correct when it is
decorative — but a screen reader will announce nothing at all for an icon-only
button:

```html
<!-- decorative: the label carries the meaning -->
<button><i class="ph-bold ph-plus" aria-hidden="true"></i> New index</button>

<!-- icon-only: the button needs its own name -->
<button aria-label="Close"><i class="ph-bold ph-x" aria-hidden="true"></i></button>
```

Mark every icon `aria-hidden="true"`, and give icon-only controls an
`aria-label`. Keep the 44px minimum touch target regardless of icon size.

### Brand marks

Phosphor covers common brand glyphs (`ph-x-logo`, `ph-github-logo`,
`ph-discord-logo`), which is enough for a footer. For a product's own logo, use
inline SVG — a webfont glyph cannot carry brand colour or multi-path artwork.

---

## Layout

```css
.container {
  width: 100%;
  max-width: var(--container);   /* 80%, → 95% under 768px */
  margin-inline: auto;
  padding-inline: 0;
}
```

A **percentage container, not a fixed max-width.** It holds the same margin
ratio at every width instead of stranding a 1200px column in the middle of a
wide monitor.

Section rhythm: `padding-block: var(--space-section)` (8rem → 4.5rem on mobile).
No borders between sections.

Breakpoints: **1024px** and **768px**. Two is enough.

---

## Signature patterns

### 1. Floating nav pill

Not a full-width bar — a compact pill centred at the top, over the content.

```css
.nav {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 14px 12px 28px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--nav-bg);
  backdrop-filter: var(--nav-blur);
  transition: background 420ms ease, border-color 420ms ease, box-shadow 420ms ease;
}
.nav.is-scrolled {
  background: var(--nav-bg-scrolled);
  border-color: var(--line-strong);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 8px 24px rgba(0, 0, 0, 0.18);
}
```

Toggle `.is-scrolled` with **hysteresis** so it cannot flicker on one boundary:

```js
const SHRINK_AT = 80, EXPAND_AT = 16;
let compact = scrollY >= SHRINK_AT, frame = 0;

addEventListener('scroll', () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const y = Math.max(0, scrollY);
    if (!compact && y >= SHRINK_AT) compact = true;
    else if (compact && y <= EXPAND_AT) compact = false;
    else return;
    nav.classList.toggle('is-scrolled', compact);
  });
}, { passive: true });
```

### 2. Slide-swap button

Two layers clipped by the pill. The label leaves upward as the icon arrives.

```html
<a class="swap-btn" href="/app">
  <span class="swap-btn__text">App</span>
  <span class="swap-btn__hover" aria-hidden="true"><svg>…</svg></span>
</a>
```

```css
.swap-btn { position: relative; width: 121px; height: 41px; overflow: hidden;
            border: 1px solid rgba(239, 245, 235, 0.32); border-radius: var(--radius-pill); }

.swap-btn__text,
.swap-btn__hover {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  transition: transform var(--dur-base) var(--ease-swap), opacity var(--dur-base) ease;
}
.swap-btn__hover { transform: translateY(100%); opacity: 0; }

.swap-btn:hover .swap-btn__text,
.swap-btn:focus-visible .swap-btn__text { transform: translateY(-100%); opacity: 0; }

.swap-btn:hover .swap-btn__hover,
.swap-btn:focus-visible .swap-btn__hover { transform: translateY(0); opacity: 1; }

.swap-btn:hover, .swap-btn:focus-visible {
  background: var(--ink); color: var(--canvas-deep); border-color: var(--ink);
}
```

Always bind `:focus-visible` alongside `:hover`, or keyboard users get nothing.

### 3. The rounded panel footer

The pattern that makes the footer feel designed: a band of artwork, then a dark
panel with large rounded top corners floating over it, inset from both edges.

```css
.footer { position: relative; min-height: 785px; overflow: hidden; }

.footer__art { position: absolute; inset: 0; overflow: hidden; }
.footer__art img {
  position: absolute; top: 50%; left: 0;
  width: 100%; height: 333%;          /* oversized… */
  transform: translateY(-50%);        /* …and centred, so only its middle shows */
  object-fit: cover;
  opacity: 0.84;
  filter: saturate(0.88) brightness(0.72) contrast(1.06);
}

.footer__panel {
  position: absolute; right: 26px; bottom: 0; left: 26px;
  display: flex; flex-direction: column;
  padding: 57.6px 64px 44.8px;
  border-top: 1px solid var(--line);
  border-radius: var(--radius-panel) var(--radius-panel) 0 0;
  background: rgba(4, 5, 4, 0.98);
}
```

Two things carry it: the **oversized, vertically-centred artwork** (you see a
calm middle band, never the busy edges) and the **desaturating filter** so the
image never competes with the text.

On mobile return the panel to normal flow (`position: relative; margin: 220px 12px 0`)
so it grows with its content.

### 4. Product mockup in a window

Instead of a screenshot, rebuild a simplified UI in HTML inside a bordered panel:

```css
.window {
  border: 1px solid var(--app-line);
  border-radius: var(--radius-surface);
  background: var(--surface-1);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}
```

Inside it, drop to the app ladder and a **much smaller type scale** — 10–17px,
where the page uses 14–36px. That size contrast is what sells it as a screen
inside a page. Make one card clickable to swap scenes; a mockup that responds
beats a static image.

### 5. Radial logo ring

Position items on a circle with two custom properties and no per-item maths:

```css
.tile {
  --a: 0deg;                    /* angle */
  --r: 272px;                   /* radius */
  position: absolute; top: 50%; left: 50%;
  margin: -35.5px 0 0 -35.5px;  /* half the tile size */
  transform: rotate(var(--a)) translateY(calc(-1 * var(--r))) rotate(calc(-1 * var(--a)));
}
.tile:nth-child(2) { --a: 40deg; }
.tile:nth-child(3) { --a: 80deg; }
```

The trailing counter-rotation keeps each tile upright while it sits on the ring.
Use two concentric radii for more than ~9 items.

> **Trap:** `translateY(-50%)` resolves against the *element's own* height, not
> the ring. Percentages collapse the ring toward the centre — always use a length.

---

## Motion

Two curves, and that is all:

- `--ease-out` — things entering or settling (reveals, collapses)
- `--ease-swap` — things trading places (the slide-swap button)

Durations: `150ms` hovers, `350ms` state changes, `700ms` scroll reveals.

Scroll reveal, in full:

```css
.animate { opacity: 0; transform: translateY(18px);
           transition: opacity var(--dur-slow) ease, transform var(--dur-slow) var(--ease-out); }
.animate.is-visible { opacity: 1; transform: none; }
```

```js
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-visible');
    io.unobserve(e.target);           // reveal once, then stop observing
  });
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

document.querySelectorAll('.animate').forEach((el) => io.observe(el));
```

Stagger siblings with `transition-delay: 100ms` on the second item. More than
~150ms of stagger feels slow.

**Always close with the reduced-motion escape hatch:**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important;
                           transition-duration: 0.001ms !important; }
  .animate { opacity: 1; transform: none; }
}
```

---

## Accessibility baseline

Non-negotiable, and cheap to keep:

- A skip link as the first focusable element
- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }` — the
  accent doubles as the focus colour
- Every `:hover` affordance also bound to `:focus-visible`
- Decorative images `alt=""`; decorative layers `aria-hidden="true"`
- When swapping scenes, sync `aria-hidden` on both — visually hidden is not
  hidden to a screen reader
- Dialogs: focus the close button on open, restore focus on close, `Esc` closes
- Minimum 44px touch targets

Contrast check: `--ink-muted` on `--canvas` is the weakest pair in the system.
It passes for large/incidental text but **not** for small body copy — use
`--ink-soft` for anything a user must read.

---

## Checklist before calling a page done

- [ ] No horizontal overflow at 1280px **and** 375px
- [ ] Zero console errors, zero broken images
- [ ] Every heading is weight 400
- [ ] One accent only
- [ ] No borders between sections
- [ ] Only the Inter weights you use are loaded (400/500/600)
- [ ] Only the Phosphor weights you use are loaded — never all six
- [ ] One default icon weight; every icon `aria-hidden`, icon-only buttons labelled
- [ ] Reduced-motion block present
- [ ] Keyboard: tab through the whole page, every stop visible
- [ ] Wide content (tables, code) scrolls in its own container, not the body
