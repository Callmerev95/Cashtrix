/**
 * Theme token smoke test — guards the DESIGN.md contract.
 *
 * If a canonical value drifts (or a token is dropped), this test fails so
 * the regression is caught at unit level rather than in visual review.
 */
import {
  colors,
  fontFamily,
  layout,
  radius,
  spacing,
  typography,
} from '@/theme';

describe('theme — canonical colours (DESIGN.md §1)', () => {
  it('exposes the nine core palette tokens with canonical hex values', () => {
    expect(colors.background).toBe('#0A0A0A');
    expect(colors.surfaceCard).toBe('#1C1C1E');
    expect(colors.surfaceElevated).toBe('#2C2C2E');
    expect(colors.border).toBe('#2C2C2E');
    expect(colors.borderStrong).toBe('#3A3A3C');
    expect(colors.accent).toBe('#D4AF37');
    expect(colors.accentSoft).toBe('#F3E5AB');
    expect(colors.textPrimary).toBe('#E5E5E5');
    expect(colors.textSecondary).toBe('#8E8E93');
    expect(colors.textOnAccent).toBe('#0A0A0A');
  });

  it('keeps semantic rules: income gold, expense muted white, error reserved', () => {
    expect(colors.income).toBe(colors.accent);
    expect(colors.expense).toBe(colors.textPrimary);
    expect(colors.error).toBe('#FFB4AB');
    expect(colors.expense).not.toBe(colors.error);
  });
});

describe('theme — typography (DESIGN.md §2)', () => {
  it('defines exactly the 12 canonical type tokens', () => {
    expect(Object.keys(typography)).toHaveLength(12);
  });

  it('routes monetary tokens through JetBrains Mono, not Stitch drift', () => {
    expect(typography.currencyDisplay.fontFamily).toBe(
      fontFamily.monoMedium,
    );
    expect(typography.currencyMd.fontFamily).toBe(fontFamily.monoMedium);
    expect(typography.currencySm.fontFamily).toBe(fontFamily.mono);
  });

  it('routes structural tokens through Inter', () => {
    expect(typography.displayLgMobile.fontFamily).toBe(fontFamily.semibold);
    expect(typography.bodyMd.fontFamily).toBe(fontFamily.regular);
    expect(typography.labelUppercase.textTransform).toBe('uppercase');
  });
});

describe('theme — spacing, radius, layout (DESIGN.md §3–§4)', () => {
  it('uses the 4px rhythm and 20px screen margin', () => {
    expect(spacing).toMatchObject({
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      margin: 20,
    });
  });

  it('exposes the radius scale including the dominant full radius', () => {
    expect(radius).toMatchObject({
      sm: 8,
      md: 16,
      lg: 20,
      xl: 24,
      xxl: 32,
      full: 9999,
    });
  });

  it('reserves ≥96px nav clearance and 52px button / 44px tap targets', () => {
    expect(layout.navClearance).toBeGreaterThanOrEqual(96);
    expect(layout.buttonHeight).toBe(52);
    expect(layout.minTapTarget).toBe(44);
    expect(layout.fabSize).toBe(56);
  });
});
