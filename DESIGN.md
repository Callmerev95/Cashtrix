# Cashtrix — Design System

**Name:** Obsidian Luxury (Minimalist Obsidian)
**Source:** Stitch project `Cashtrix` (`projects/16569655893689994`), design system asset `assets/4b61549b44c64e5f9f2b2ef2437c18dd` v1
**Mode:** Dark only · Mobile-first (390px canvas)
**Style:** Minimalism with Luminous Glass Accents — discreet, private-wealth aesthetic. Deep obsidian depths, tactile card surfaces, subtle champagne-gold glows, disciplined alignment. No consumer fintech gimmicks; red is reserved for expense amounts only (never destructive actions).

---

## 1. Color Palette — Minimalist Obsidian (Canonical)

These are the source-of-truth tokens. All UI must reference them.

### Core tokens

| Token | Value | Usage |
|---|---|---|
| `background` | `#0A0A0A` | Pure black canvas. Full app background. Zero light bleed on OLED. |
| `surface-card` | `#1C1C1E` | Layer 1 — primary cards, summary modules, bottom sheets, nav bar (75% alpha + blur). |
| `surface-elevated` | `#2C2C2E` | Layer 2 — interactive sub-cards, inputs, segmented wells, icon avatars, active chips. |
| `border` | `#2C2C2E` | Hairline 1px dividers and card outlines (Layer 1 border = this color). |
| `border-strong` | `#3A3A3C` | Hairline borders on Layer 2 elements (modals, inputs, active segments). |
| `accent` | `#D4AF37` | Champagne gold. **Reserved:** primary CTAs, net values, active nav/segment states, key data highlights, progress fills, soft glows. |
| `accent-soft` | `#F3E5AB` | Secondary stop in gold gradients (progress fill end, hover sheen). |
| `gain` | `#30D158` | Income green. Income amounts only. |
| `loss` | `#FF6B62` | Expense red. Expense amounts only — never for destructive actions (those stay `error`). |
| `text-primary` | `#E5E5E5` | Muted warm white. Headings, body copy, transaction names, combined total. |
| `text-secondary` | `#8E8E93` | Cool grey. Timestamps, metadata, inactive labels, disabled states. |
| `text-on-accent` | `#0A0A0A` | Obsidian text on gold fills (primary buttons). |

### Semantic rules

- **Income** = `#30D158` (green, `currency-md`, no prefix — the colour alone distinguishes it).
- **Expense** = `#FF6B62` (red) with a leading `-` marking the direction (amended post-V5: previously muted white, never red — overturned per owner review of the preview build).
- **Net** (income − expense) = `#D4AF37` (gold, `currency-md`).
- **Combined total** (Dashboard hero) stays `#E5E5E5` muted white.
- **Error** = `#FFB4AB` on `#93000A` container (reserved for destructive actions only — never for expense amounts).
- Gold is never used for: page backgrounds, body text, expense amounts, or large flat fills >1 card per viewport.
- Highlighted card borders: gradient `#D4AF37` (top-left) → `#2C2C2E` (bottom-right), or `#D4AF37` at 15% opacity.

### Stitch / Material-3 mapping — drift, not the source of truth

> **DECISION (locked):** The canonical `#0A0A0A` canvas and `#1C1C1E` card are the approved palette. Stitch **cannot** store them, because Stitch derives all Material-3 tonal tokens server-side from a seed color and only accepts seed overrides (`overridePrimaryColor` / `Secondary` / `Tertiary` / `Neutral`). Writing `namedColors` directly is rejected by the API. As a result every Stitch-rendered screen contains derived greys, not the canonical hexes.
>
> **Therefore: do not color-pick from the Stitch screens.** Port from the canonical table in §1. The table below exists only to explain *why* the screens look slightly off and what each derived token roughly corresponds to.

| Canonical | Stitch token | Hex rendered (drift) |
|---|---|---|
| `background` | `background` / `surface` / `surface-dim` | `#131313` |
| `surface-card` | `surface-container-low` | `#1C1B1B` |
| — (intermediate) | `surface-container` | `#201F1F` |
| `surface-elevated` | `surface-container-high` | `#2A2A2A` |
| — (strongest) | `surface-container-highest` / `surface-variant` | `#353534` |
| — (deepest, insets) | `surface-container-lowest` | `#0E0E0E` |
| `accent` | `primary-container` | `#D4AF37` ✓ exact |
| `accent-soft` | `primary` / `primary-fixed` / `primary-fixed-dim` | `#F2CA50` / `#FFE088` / `#E9C349` |
| `text-primary` | `on-surface` / `on-background` | `#E5E2E1` |
| `text-secondary` | `secondary` / `outline` | `#C8C6C8` / `#99907C` |
| `border` | `outline-variant` / `secondary-container` | `#4D4635` / `#474649` |

Frequency in generated screens confirms the hierarchy (canvas `#131313` 28×, borders `#474649` 22×, text `#E5E2E1` 21×, gold `#D4AF37` 7×). Gold is the only canonical value Stitch reproduces exactly.

**Known font drift:** the Stitch design system (`assets/4b61549b44c64e5f9f2b2ef2437c18dd` v2) currently declares `currency-display` / `currency-md` / `currency-sm` in **Public Sans**, because the API rejected `JETBRAINS_MONO` for the label slot during the canonical-color update. This is accepted drift: **JetBrains Mono remains the approved currency typeface here**, and must be restored during implementation. Do not follow Stitch on this point.

**What was applied to Stitch:** seed overrides only — `overrideNeutralColor: #0a0a0a`, `overrideSecondaryColor: #1c1c1e`, `overridePrimaryColor: #d4af37`, `overrideTertiaryColor: #2c2c2e`, plus `colorMode: DARK`, `roundness: ROUND_FULL`, `colorVariant: FIDELITY`. Existing screens were intentionally left untouched.

---

## 2. Typography

- **Inter** — all structural text (headings, body, labels, inputs).
- **JetBrains Mono** — monetary values only (fixed-width prevents jitter during live updates; institutional precision).

### Type scale

| Token | Font | Size / LH | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `display-lg` | Inter | 40 / 48 | 600 | -0.02em | Desktop hero numbers (rare) |
| `display-lg-mobile` | Inter | 32 / 40 | 600 | -0.02em | Screen hero (net worth, page titles) |
| `headline-lg` | Inter | 28 / 36 | 600 | -0.01em | Major section titles |
| `headline-md` | Inter | 22 / 28 | 500 | -0.01em | Screen titles |
| `headline-sm` | Inter | 18 / 24 | 500 | — | Card titles, active segment labels |
| `body-lg` | Inter | 16 / 24 | 400 | — | Button labels, emphasized body |
| `body-md` | Inter | 14 / 20 | 400 | — | Transaction names, default body |
| `body-sm` | Inter | 12 / 16 | 400 | — | Timestamps, metadata, captions |
| `label-uppercase` | Inter | 11 / 16 | 600 | 0.12em, uppercase | Section kickers, micro-labels |
| `currency-display` | JetBrains Mono | 32 / 40 | 500 | -0.03em | Hero balance, amount entry |
| `currency-md` | JetBrains Mono | 18 / 24 | 500 | -0.02em | Transaction amounts, KPI values |
| `currency-sm` | JetBrains Mono | 14 / 20 | 400 | — | Inline figures, small metrics |

### Observed usage (generated screens)

`body-sm` (56×) and `body-md` (42×) dominate list-heavy screens; `label-uppercase` (40×) is the primary structural separator — sections are divided by tracked uppercase kickers, not heavy divider lines. `currency-md` (22×) for all row amounts. `display-lg-mobile` for hero balances only.

---

## 3. Layout & Spacing

4px base rhythm. Tokens:

| Token | Value | Usage |
|---|---|---|
| `space-xs` | 4px | Icon-to-label offsets, badge padding |
| `space-sm` | 8px | Chip gaps, title-to-tag gaps |
| `space-md` / `gutter` | 16px | Default inner padding, grid gutters |
| `space-lg` | 24px | Hero card padding |
| `space-xl` | 32px | Section separation |
| `margin` | 20px | Screen outer margin (all sides) |

### Padding rules

- **Screen:** 20px horizontal margin (`px-margin`); scrollable views end with ≥96px bottom padding (`pb-28`) + `env(safe-area-inset-bottom)` so the floating nav never occludes content.
- **Hero cards:** 24px (`p-space-lg`).
- **Standard cards / list rows / inputs:** 16px (`p-space-md`).
- **Chips / badges / icon wells:** 8px (`p-space-sm`).
- **Tap targets:** minimum 44px height (nav items, buttons 52px).

### Structure

- Single-column vertical flow, 4-column mobile grid; single content wrapper, no max-width constraint on mobile.
- Cards stack with 12–16px gaps; sections separated by `label-uppercase` kicker + `space-xl`.
- Floating bottom navigation bar (not tab bar): 4 items + central FAB, frosted glass (`#1C1C1E` @ 75% + `backdrop-blur-xl`), 1px `#2C2C2E` top hairline.
- FAB: 56px, gradient gold (`from-primary-container to-primary`), shadow `0 0 24px rgba(212,175,55,0.2)`, obsidian `add` icon.

---

## 4. Elevation & Depth

Depth = tonal layering + hairline edges + diffuse gold glow (never heavy drop shadows).

| Layer | Surface | Border |
|---|---|---|
| L0 canvas | `#0A0A0A` | — |
| L1 cards / sheets | `#1C1C1E` | 1px `#2C2C2E` |
| L2 inputs / modals / active chips | `#2C2C2E` | 1px `#3A3A3C` |

**Gold glow catalog (from generated screens):**

- Hero card ambient: `0 8px 32px -4px rgba(212,175,55,0.08)`
- Active segment pill: `0 2px 12px rgba(212,175,55,0.28)`
- Progress bar fill: `0 0 12px rgba(242,202,80,0.5)`
- Chart bars: `0 0 16px rgba(242,202,80,0.35)`
- Decorative ambience: radial gold blobs at 10% opacity, `blur-2xl`
- Frosted surfaces: `backdrop-blur-xl` (9×) / `backdrop-blur-md`

**Radius scale:**

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 8px | Minor elements (rare) |
| `rounded` (DEFAULT) | 16px | Inputs, buttons |
| `rounded-2xl` | 20px | Standard cards (30× in screens) |
| `rounded-lg` | 24px | Large cards, sheets (27×) |
| `rounded-3xl` | 32px | Hero cards (6×) |
| `rounded-full` | 9999px | Badges, chips, pills, progress, avatars (142× — dominant) |

---

## 5. Components

### Buttons
- **Primary:** solid/gradient gold (`from #D4AF37` → `#F2CA50`), obsidian text `#0A0A0A`, 52px height, radius 16px, `shadow-md`, hover `brightness-105`, tap `scale(0.99)`.
- **Secondary:** `#2C2C2E` fill, `#E5E5E5` text, 1px `#3A3A3C` border.
- **Ghost:** transparent, gold text, no border.

### Inputs
- `#1C1C1E` fill, 1px `#2C2C2E` outline, radius 16px, 16px padding.
- Focus: border → `#D4AF37` @ 60% + faint gold ambient shadow.
- Currency entry: `currency-display` (32px Mono), stationary gold currency glyph.

### Cards
- L1 container, 20–24px padding, 1px `#2C2C2E` border, radius 20–32px.
- Highlight variants: gradient border gold→`#2C2C2E`, or radial gold ambience blob behind.

### Transaction rows
- 16px vertical padding, 1px `#2C2C2E` divider.
- Left: circular `#2C2C2E` icon well (Material Symbols Outlined, 20px, monochrome or gold).
- Center: name `body-md` `#E5E5E5` + timestamp `body-sm` `#8E8E93`.
- Right: `currency-md` — income `#30D158`, expense `#FF6B62`.

### Chips / segmented control
- Well: `#1C1C1E`, 4px inner padding, `rounded-full`.
- Active: `#2C2C2E` (or gold fill on filters) + glow `0 2px 12px rgba(212,175,55,0.28)`.
- Filter chips active: gold border + gold text.

### Progress
- Track: `#2C2C2E`, rounded caps.
- Fill: gradient `#D4AF37` → `#F3E5AB` with `0 0 12px rgba(242,202,80,0.5)` glow; ring variant adds `rgba(212,175,55,0.25)` blur ring.

### Navigation
- Floating bar: frosted `#1C1C1E`/75 + blur, icon 24px `#8E8E93` inactive / gold active, central gradient-gold FAB.
- Icon library: Material Symbols Outlined.

---

## 6. Screen Inventory & Layout Notes

| Screen | Title | Key structure |
|---|---|---|
| **Login** (`2b91c004…`) | "Welcome Back" | Centered stack on `#0A0A0A`; logo, headline-lg, inputs (L2), full-width gold primary button, ghost tertiary link. |
| **Register** (`fd14555b…`) | "Cashtrix" | Same auth pattern as Login; stacked inputs, gold CTA. |
| **Dashboard** (`cf457859…`) | "Good evening, Evelyn" | Greeting + notification icon → hero balance card (gradient gold border, `currency-display`) → quick-action tray (4-column) → transaction list → floating nav + FAB. 780×2284. |
| **Add Transaction** (`647011f9…`) | "Add Expense" | Segmented Expense/Income toggle (gold active pill) → large `currency-display` amount entry → category grid (circular `#2C2C2E` wells) → date/note inputs → gold CTA pinned at base. 780×1982. |
| **Analytics** (`43c228fd…`) | "Financial Intelligence" | Segmented range pills → donut/spend wheel (gold gradient + glow) → bar chart (gold gradient bars, `0 0 16px` glow) → category breakdown rows. 780×3200. |
| **Budgets** (`bd97d810…`) | "Budget Architecture" | Progress rings/bars per budget (gold fill, `#2C2C2E` track), L1 cards 24px padding, deepest screen (780×3608). |
| **Profile** (`0659499e…`) | "Evelyn Vance" | Avatar (generated obsidian portrait) + gold `verified_user` → settings list (L1 cards, row pattern) → sign-out. 780×3564. |
| **Logo** (`afc82fe0…`) | — | 120×120 SVG: `#141416` squircle (rx 30), gold gradient stroke `#F9E498 → #D4AF37 → #997A15`, radial gold glow 15%, "C" + arrow mark. |

---

## 7. Golden Rules

1. Gold is a scalpel, not a paintbrush — CTA, income, active state, one highlight per viewport.
2. Expenses stay in `#E5E5E5`; red only for destructive confirmation.
3. Depth = tone + hairline + glow; no drop-shadow stacking.
4. Numbers in JetBrains Mono, everything else Inter.
5. Section labels in `label-uppercase` kickers instead of divider lines.
6. Every scrollable screen leaves room for the floating nav (≥96px + safe-area inset).
