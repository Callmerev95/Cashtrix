/**
 * Tactile feedback (B1, ADR-0016).
 *
 * `expo-haptics` is a new native module (same preview rebuild as AI6
 * `expo-audio`): the JS bundle carries it, but the native side may be
 * missing (Expo Go before the rebuild, Jest, a stale binary). Every tap
 * lazy-loads the module in a try/catch and swallows all failures — a
 * convenience buzz must never crash or block the action it celebrates
 * (same lesson as netinfo/D4 and lock/B4). Call sites fire and forget.
 *
 * Wiring map (ADR-0016): save success → `tapSave`, undo snackbar →
 * `tapUndo`, budget threshold crossing → `tapThreshold`, record
 * start/stop → `tapRecord`, lock/MFA toggles → `tapToggle`, AI prefill
 * landing → `tapPrefill`.
 */
import { recordImpactStyle, type RecordPhase } from './domain';

/** Duck-typed surface — kept minimal so a version bump cannot break the app. */
type HapticsModule = {
  notificationAsync?: (type?: string) => Promise<void>;
  impactAsync?: (style?: string) => Promise<void>;
  selectionAsync?: () => Promise<void>;
  NotificationFeedbackType?: {
    Success?: string;
    Warning?: string;
  };
  ImpactFeedbackStyle?: {
    Light?: string;
    Medium?: string;
    Heavy?: string;
  };
};

function haptics(): HapticsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-haptics') as HapticsModule;
  } catch {
    return null;
  }
}

async function fire(
  run: (mod: HapticsModule) => Promise<unknown>,
): Promise<void> {
  const mod = haptics();
  if (!mod) return;
  try {
    await run(mod);
  } catch {
    // Best-effort: never throw, never block.
  }
}

/** Save committed (transaction, split row, budget): success notification. */
export async function tapSave(): Promise<void> {
  await fire((mod) =>
    mod.notificationAsync
      ? mod.notificationAsync(mod.NotificationFeedbackType?.Success)
      : Promise.resolve(),
  );
}

/** Undo snackbar appears: medium impact. */
export async function tapUndo(): Promise<void> {
  await fire((mod) =>
    mod.impactAsync
      ? mod.impactAsync(mod.ImpactFeedbackStyle?.Medium)
      : Promise.resolve(),
  );
}

/** Budget threshold crossed upward (warning/exceeded): warning notification. */
export async function tapThreshold(): Promise<void> {
  await fire((mod) =>
    mod.notificationAsync
      ? mod.notificationAsync(mod.NotificationFeedbackType?.Warning)
      : Promise.resolve(),
  );
}

/** Voice recording starts (heavy) or stops (light). */
export async function tapRecord(phase: RecordPhase = 'start'): Promise<void> {
  const style = recordImpactStyle(phase);
  await fire((mod) => {
    const table = mod.ImpactFeedbackStyle;
    const arg =
      style === 'heavy'
        ? table?.Heavy
        : style === 'medium'
          ? table?.Medium
          : table?.Light;
    return mod.impactAsync ? mod.impactAsync(arg) : Promise.resolve();
  });
}

/** Lock / MFA toggle flips: light impact. */
export async function tapToggle(): Promise<void> {
  await fire((mod) =>
    mod.impactAsync
      ? mod.impactAsync(mod.ImpactFeedbackStyle?.Light)
      : Promise.resolve(),
  );
}

/** AI prefill lands in the form: soft selection tick. */
export async function tapPrefill(): Promise<void> {
  await fire((mod) =>
    mod.selectionAsync ? mod.selectionAsync() : Promise.resolve(),
  );
}
