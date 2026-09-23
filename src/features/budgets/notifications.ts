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
 *
 * The native module is loaded lazily (never a top-level import): Expo Go
 * (SDK 53+) removed remote-push registration, and merely *importing*
 * `expo-notifications` throws at load there. Requiring it inside try/catch
 * keeps the app running — alerts degrade to in-app banners.
 */
import type * as NotificationsType from 'expo-notifications';
import Constants from 'expo-constants';

import { dictionaryFor, fill } from '@/i18n/dictionaries';
import type { Language } from '@/i18n/locale';

let cached: typeof NotificationsType | null | undefined;

/**
 * The native module, or `null` where it cannot load (Expo Go, Jest).
 *
 * Expo Go is detected *before* touching the module: Metro logs a module-load
 * error to LogBox before rethrowing, so a try/catch around `require` alone
 * still flashes the redbox in dev. Skipping the require entirely keeps Expo
 * Go clean; alerts degrade to in-app banners there.
 */
function notifications(): typeof NotificationsType | null {
  if (cached !== undefined) return cached;
  if (Constants.appOwnership === 'expo') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as typeof NotificationsType;
  } catch {
    cached = null;
  }
  return cached;
}

let handlerInstalled = false;

/** Foreground presentation: banner + list, no sound, no badge. */
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;

  try {
    notifications()?.setNotificationHandler({
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
    const mod = notifications();
    if (!mod) return 'denied';
    const settings = await mod.getPermissionsAsync();
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
    const mod = notifications();
    if (!mod) return false;
    const result = await mod.requestPermissionsAsync();
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
    const mod = notifications();
    if (!mod) return false;
    await mod.scheduleNotificationAsync({
      content: { title: input.title, body: input.body },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy for a fired threshold (C6: rendered in the OS language — the caller
 * passes the active language; default keeps the historic id-ID behaviour so
 * existing callers and tests are unaffected until they migrate).
 */
export function alertCopy(
  input: {
    categoryName: string;
    threshold: 'warning_80' | 'exceeded_100';
    spent: string;
    limit: string;
  },
  lang: Language = 'id',
): { title: string; body: string } {
  const copy = dictionaryFor(lang).budgets.alert;
  const params = {
    categoryName: input.categoryName,
    spent: input.spent,
    limit: input.limit,
  };
  if (input.threshold === 'exceeded_100') {
    return {
      title: fill(copy.exceededTitle, params),
      body: fill(copy.exceededBody, params),
    };
  }
  return {
    title: fill(copy.warningTitle, params),
    body: fill(copy.warningBody, params),
  };
}
