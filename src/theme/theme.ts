/**
 * Cashtrix theme — the single source of truth for every design token.
 *
 * This is the ONLY file in the codebase allowed to contain hex colour
 * literals (PRD §4.5, AGENTS.md). Components consume these tokens; a lint
 * rule flags bare hex strings anywhere else.
 *
 * Values mirror `DESIGN.md` exactly ("Minimalist Obsidian"). The canonical
 * palette comes from DESIGN.md §1 — never colour-pick from Stitch screens
 * (they render M3-derived greys, see DESIGN.md §1 / D10).
 */

// ---------------------------------------------------------------------------
// Colour — DESIGN.md §1
// ---------------------------------------------------------------------------

export const palette = {
  /** Pure black canvas. Full app background. Zero light bleed on OLED. */
  background: '#0A0A0A',
  /** Layer 1 — primary cards, summary modules, bottom sheets, nav bar. */
  surfaceCard: '#1C1C1E',
  /** Layer 2 — interactive sub-cards, inputs, segmented wells, icon avatars. */
  surfaceElevated: '#2C2C2E',
  /** Hairline 1px dividers and Layer-1 card outlines. */
  border: '#2C2C2E',
  /** Hairline borders on Layer-2 elements (modals, inputs, active segments). */
  borderStrong: '#3A3A3C',
  /** Champagne gold. Reserved: CTAs, income, active states, highlights, fills. */
  accent: '#D4AF37',
  /** Secondary stop in gold gradients (progress fill end, hover sheen). */
  accentSoft: '#F3E5AB',
  /** Muted warm white. Headings, body, transaction names, expense amounts. */
  textPrimary: '#E5E5E5',
  /** Cool grey. Timestamps, metadata, inactive labels, disabled states. */
  textSecondary: '#8E8E93',
  /** Obsidian text on gold fills (primary buttons). */
  textOnAccent: '#0A0A0A',
  /** Floating nav glass — surface-card at 75% alpha over blur. */
  surfaceCardTranslucent: 'rgba(28, 28, 30, 0.75)',
  /** Error text on the error container. Destructive actions only. */
  error: '#FFB4AB',
  /** Error container. Destructive actions only. */
  errorContainer: '#93000A',
} as const;

/**
 * Semantic aliases — use these in UI code so intent is explicit and the
 * income/expense rules from DESIGN.md §1 cannot drift.
 */
export const colors = {
  ...palette,
  /** Income values render gold, currency-md, with a leading `+`. */
  income: palette.accent,
  /** Expenses stay muted white — never red (DESIGN.md §1 semantic rules). */
  expense: palette.textPrimary,
  /** Backdrop scrim for modals/sheets. */
  scrim: 'rgba(0, 0, 0, 0.6)',
  /** Gold at 15% opacity for highlighted card borders. */
  accentBorderSoft: 'rgba(212, 175, 55, 0.15)',
  /** Ambience blob fill — radial gold at 10% opacity. */
  accentAmbience: 'rgba(212, 175, 55, 0.10)',
} as const;

// ---------------------------------------------------------------------------
// Typography — DESIGN.md §2
// ---------------------------------------------------------------------------

/** Structural text. */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  /** Monetary values only — fixed width prevents jitter during live updates. */
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export type TypeToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600';
  letterSpacing: number;
  textTransform?: 'uppercase';
};

/** The 12 canonical type tokens from DESIGN.md §2. */
export const typography = {
  displayLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '600',
    letterSpacing: -0.8, // -0.02em
  },
  displayLgMobile: {
    fontFamily: fontFamily.semibold,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: -0.64, // -0.02em
  },
  headlineLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
    letterSpacing: -0.28, // -0.01em
  },
  headlineMd: {
    fontFamily: fontFamily.medium,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
    letterSpacing: -0.22, // -0.01em
  },
  headlineSm: {
    fontFamily: fontFamily.medium,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0,
  },
  bodyLg: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodyMd: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: 0,
  },
  labelUppercase: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 1.32, // 0.12em
    textTransform: 'uppercase',
  },
  currencyDisplay: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '500',
    letterSpacing: -0.96, // -0.03em
  },
  currencyMd: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: -0.36, // -0.02em
  },
  currencySm: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },
} as const satisfies Record<string, TypeToken>;

export type TypographyTokenName = keyof typeof typography;

/** Convenience aliases matching the DESIGN.md token names. */
export const type = {
  displayLg: typography.displayLg,
  displayLgMobile: typography.displayLgMobile,
  headlineLg: typography.headlineLg,
  headlineMd: typography.headlineMd,
  headlineSm: typography.headlineSm,
  bodyLg: typography.bodyLg,
  bodyMd: typography.bodyMd,
  bodySm: typography.bodySm,
  labelUppercase: typography.labelUppercase,
  currencyDisplay: typography.currencyDisplay,
  currencyMd: typography.currencyMd,
  currencySm: typography.currencySm,
} as const;

// ---------------------------------------------------------------------------
// Spacing — DESIGN.md §3 (4px base rhythm)
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  /** Alias: default grid gutter. */
  gutter: 16,
  lg: 24,
  xl: 32,
  /** Screen outer margin, all sides. */
  margin: 20,
} as const;

export const layout = {
  /** Screen horizontal margin. */
  screenMargin: spacing.margin,
  /** Hero card padding. */
  heroPadding: spacing.lg,
  /** Standard card / list-row / input padding. */
  cardPadding: spacing.md,
  /** Minimum bottom clearance so the floating nav never occludes content. */
  navClearance: 96,
  /** Minimum tap target. */
  minTapTarget: 44,
  /** Primary button height. */
  buttonHeight: 52,
  /** Central FAB diameter. */
  fabSize: 56,
  /** Floating nav bar height (excluding clearance). */
  navBarHeight: 64,
} as const;

// ---------------------------------------------------------------------------
// Radius — DESIGN.md §4
// ---------------------------------------------------------------------------

export const radius = {
  /** Minor elements (rare). */
  sm: 8,
  /** DEFAULT — inputs, buttons. */
  md: 16,
  /** Standard cards. */
  lg: 20,
  /** Large cards, sheets. */
  xl: 24,
  /** Hero cards. */
  xxl: 32,
  /** Badges, chips, pills, progress, avatars (dominant). */
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Elevation & glow — DESIGN.md §4
// ---------------------------------------------------------------------------

/**
 * Gold glow catalog. For RN consumers these are `boxShadow` strings on
 * New Architecture, or `shadowColor/…` values on the classic engine.
 */
export const shadows = {
  shadowColor: palette.accent,
  /** Hero card ambient. */
  heroAmbient: '0 8px 32px -4px rgba(212, 175, 55, 0.08)',
  /** Active segment pill. */
  activePill: '0 2px 12px rgba(212, 175, 55, 0.28)',
  /** Progress bar / ring fill. */
  progressGlow: '0 0 12px rgba(242, 202, 80, 0.50)',
  /** Chart bars. */
  chartBar: '0 0 16px rgba(242, 202, 80, 0.35)',
  /** FAB shadow. */
  fab: '0 0 24px rgba(212, 175, 55, 0.20)',
  /** Blur-ring glow around progress rings. */
  ringHalo: '0 0 0 8px rgba(212, 175, 55, 0.25)',
} as const;

/** Gradient stops, expressed for `expo-linear-gradient`. */
export const gradients = {
  /** Primary CTA — gradient gold. */
  primary: [palette.accent, '#F2CA50'] as const,
  /** Progress fill — gold → accent-soft. */
  progress: [palette.accent, palette.accentSoft] as const,
  /** Highlighted card border — gold (TL) → border (BR). */
  cardBorder: [palette.accent, palette.surfaceElevated] as const,
  /** Card surface fill — L1 to Canvas gradient */
  cardFill: [palette.surfaceCard, palette.background] as const,
  /** Horizontal fade for glows/overlays. */
  glow: ['rgba(212, 175, 55, 0.35)', 'rgba(212, 175, 55, 0)'] as const,
} as const;

/**
 * Distribution-chart ramp (pie slices + legend swatches, brightest first).
 *
 * Strictly fading in visual strength with rank: vivid gold → deep gold →
 * khaki → stone greys, so a 37/33/24/6 split reads at a glance. Anchored to
 * the Stitch Analytics reference (`stitch_cashtrix/cashtrix_analytics`), with
 * two deliberate deviations: Stitch's pale-champagne second stop is dropped
 * (it created a non-monotonic spike — rank 2 looked as strong as rank 0) and
 * the floor is raised (Stitch's darkest stop `#2A2A2A` vanishes against our
 * `#1C1C1E` cards, so the ramp ends at `#48484A`). Every stop is declared
 * here — the single file allowed hex literals — never color-picked ad hoc in
 * components.
 */
export const chartRamp = [
  '#F2CA50',
  '#D4AF37',
  '#B89B55',
  '#99907C',
  '#7E7869',
  '#66645E',
  '#585650',
  '#504E4A',
  '#48484A',
] as const;

// ---------------------------------------------------------------------------
// Aggregate theme
// ---------------------------------------------------------------------------

export const theme = {
  colors,
  palette,
  typography,
  type,
  fontFamily,
  spacing,
  layout,
  radius,
  shadows,
  gradients,
  chartRamp,
} as const;

export type Theme = typeof theme;
export type ColorName = keyof typeof colors;

export default theme;
