/**
 * Haptics domain (B1, ADR-0016) — pure mappings, no native bridge.
 *
 * The only decision worth unit-testing is the record-phase → impact-style
 * map (start lands heavy, stop lands light); every other tap is a fixed
 * call owned by `api.ts`.
 */

export type RecordPhase = 'start' | 'stop';

export type ImpactStyle = 'light' | 'medium' | 'heavy';

/** Impact style for a record phase: start lands heavy, stop lands light. */
export function recordImpactStyle(phase: RecordPhase): ImpactStyle {
  return phase === 'stop' ? 'light' : 'heavy';
}
