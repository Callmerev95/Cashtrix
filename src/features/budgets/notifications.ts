/**
 * Local push for budget alerts (expo-notifications, PRD §2.3 Epic E).
 *
 * Two rules from the AC shape this module:
 *  - permission is requested **only when the first budget is created** — never
 *    on launch, never on every save;
 *  - the in-app alert always works: when permission is denied (or push throws),
 *    the budgets screen still renders the fired alert as a banner, so nothing
 *    is silently lost.
 *
 * Everything here is best-effort and never throws: a notification failure must
 * not break saving a transaction.
 */
import * as Notifications from 'expo-notifications';

let handlerInstalled = false;

/** Foreground presentation: banner + list, no sound, no badge. */
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Headless/Jest environments have no notification centre — in-app only.
  }
}

export type PushPermission = 'granted' | 'denied' | 'undetermined';

/** Current permission without prompting. Never throws. */
export async function getPushPermission(): Promise<PushPermission> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return 'granted';
    if (!settings.canAskAgain) return 'denied';
    return 'undetermined';
  } catch {
    return 'denied';
  }
}

/**
 * Asks for permission. Call only from the first-budget flow (AC #8) — the
 * caller decides *when*, this only performs the OS prompt. Never throws.
 */
export async function requestPushPermission(): Promise<boolean> {
  try {
    const result = await Notifications.requestPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}

/**
 * Fires the local push for a crossed threshold. Returns whether the system
 * accepted it — `false` simply means "in-app banner only". Never throws.
 */
export async function sendBudgetAlert(input: {
  title: string;
  body: string;
}): Promise<boolean> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: input.title, body: input.body },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Copy for a fired threshold (id-ID, the OS locale path is a v1.1 item). */
export function alertCopy(input: {
  categoryName: string;
  threshold: 'warning_80' | 'exceeded_100';
  spent: string;
  limit: string;
}): { title: string; body: string } {
  if (input.threshold === 'exceeded_100') {
    return {
      title: `Budget ${input.categoryName} terlampaui`,
      body: `Terpakai ${input.spent} dari ${input.limit}. Kurangi belanja kategori ini bulan ini.`,
    };
  }
  return {
    title: `Budget ${input.categoryName} hampir habis`,
    body: `Terpakai ${input.spent} dari ${input.limit} (≥80%).`,
  };
}
