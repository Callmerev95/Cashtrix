/**
 * Reanimated capability gate (P1b lesson).
 *
 * Requiring `react-native-reanimated` does NOT prove it works: in Jest the
 * module loads but its hooks are undefined (no bridge, no worklets
 * runtime), and the first call throws mid-render — which is exactly how
 * P1b broke the navigation suite while unit tests stayed green (different
 * file, different registry state, same trap). Every lazy twin loader must
 * pass this gate first; device (real hooks) is the only YES.
 *
 * This module never imports reanimated itself, so it is safe to require
 * from anywhere, including Jest-touched files.
 */
const REQUIRED_HOOKS = [
  'useSharedValue',
  'useAnimatedStyle',
  'useAnimatedProps',
  'useAnimatedReaction',
  'withTiming',
  'withSpring',
  'withDelay',
  'createAnimatedComponent',
] as const;

export function reanimatedUsable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-reanimated') as Record<
      string,
      unknown
    > | null;
    if (!mod) return false;
    return REQUIRED_HOOKS.every((name) => typeof mod[name] === 'function');
  } catch {
    return false;
  }
}
