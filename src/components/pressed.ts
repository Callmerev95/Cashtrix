import type { ViewStyle } from 'react-native';

/**
 * Standard press feedback (device review: `scale(0.99)` sat below the
 * perception threshold and most controls had no feedback at all).
 *
 * Opacity — not scale — so the press reads even under the thumb: one value
 * everywhere, state-driven (no animation loop, R-19 safe, reduce-motion
 * safe). Usage: `style={({ pressed }) => [styles.x, pressed && pressedFeedback]}`.
 */
export const pressedFeedback: ViewStyle = {
  opacity: 0.7,
};

/**
 * Press-in delay for full-width rows/cards that live inside a scroller
 * (history rows, budget cards, wallet rows, inbox rows, settings rows).
 * A bare touch-down fires `pressed` even when the gesture becomes a scroll,
 * so scrolling over rows flashes them (device review: reads as a glitch).
 * Waiting this long means a scroll always claims the gesture first, while a
 * deliberate hold still dims. `onPress` timing is unaffected (fires on
 * release). Buttons/chips stay delay-free: those touches are almost always
 * real taps.
 *
 * Implemented as Pressable's `unstable_pressDelay` (RN 0.86 renamed
 * `delayPressIn`; the runtime maps it to the same press-in delay).
 */
export const PRESS_FEEDBACK_DELAY_MS = 150;
