import { tapToggle } from '@/features/haptics/api';

/**
 * Quick-action request store (P3b-2 prep, Tahap 1).
 *
 * `showQuickActions()` stays a fire-and-forget function at the call sites
 * (same signature as P3b-1 — the 5 surfaces do not change), but instead of
 * opening the stiff native `Alert` it publishes a request that the single
 * `QuickActionSheetHost` (mounted once at the app root) renders as a themed
 * bottom sheet. Module-level + `useSyncExternalStore`: no context, no
 * provider ordering, no gesture code.
 */
export type QuickAction = {
  /** Visible label (already localised at the call site). */
  label: string;
  /** Material icon name shown in the option row. */
  icon?: string;
  /** Destructive options render red on the danger surface. */
  destructive?: boolean;
  /** Existing handler — runs only when the user picks this option. */
  run: () => void;
};

export type QuickActionRequest = {
  title: string;
  actions: QuickAction[];
  cancelLabel: string;
};

let current: QuickActionRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((notify) => notify());
}

export function subscribeQuickActions(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function getQuickActionsSnapshot(): QuickActionRequest | null {
  return current;
}

export function showQuickActions(
  title: string,
  actions: QuickAction[],
  cancelLabel: string,
): void {
  void tapToggle();
  current = { title, actions, cancelLabel };
  emit();
}

export function dismissQuickActions(): void {
  if (!current) return;
  current = null;
  emit();
}

/** Run the option, then close — the sheet never lingers over the target. */
export function pickQuickAction(action: QuickAction): void {
  current = null;
  emit();
  action.run();
}
