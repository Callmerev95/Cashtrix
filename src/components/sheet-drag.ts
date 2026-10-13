import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  type GestureResponderEvent,
} from 'react-native';

import { tapToggle } from '@/features/haptics/api';

/**
 * Shared sheet-drag driver (P3b close-out).
 *
 * LESSON (Oct 2026, quick-action handle saga): the PanResponder negotiation
 * chain is dead for touches starting on plain views inside a Modal on this
 * build (probe: C0B0M0G0 — the card was never even asked; capture did not
 * save it). Raw `onTouch*` handlers are plain event bubbling — they arrive
 * with no responder status, no negotiation, no stealing — so one mechanism
 * serves both origins (bare handle and button rows). Never use PanResponder
 * for claim-from-nothing in a Modal here; steer from `onTouch*` directly.
 *
 * Attach the returned handlers to the drag surface ONLY (the whole card
 * when it has no scroller, the handle strip when it wraps a ScrollView —
 * the voice sheet keeps its scroll). Taps stay with Pressable: with no
 * movement nothing engages.
 *
 * The ref is read/written inside gesture handlers only, never during
 * render (react-hooks/refs). Hosts unmount the sheet on close, so stale
 * tracks self-clean every open.
 */
export const SHEET_DRAG_CLOSE_DY = 90;
export const SHEET_DRAG_CLOSE_VELOCITY = 0.7;
/** Below this slop = an ordinary touch, not a drag (taps pass through). */
export const SHEET_DRAG_SLOP = 8;

/** Pure seam: when a release means close. */
export function shouldCloseSheet(dy: number, vy: number): boolean {
  return dy > SHEET_DRAG_CLOSE_DY || vy > SHEET_DRAG_CLOSE_VELOCITY;
}

/** Pure seam: when movement counts as a drag (tap + horizontal pass). */
export function shouldClaimSheetDrag(dy: number, dx: number): boolean {
  return Math.abs(dy) > SHEET_DRAG_SLOP && Math.abs(dy) > Math.abs(dx);
}

/**
 * Pure seam: release velocity px/ms from px distance and ms duration.
 * Same ballpark as PanResponder's vy (an ordinary flick ≈ 1+), so the
 * shared close threshold applies unchanged.
 */
export function sheetFlingVelocity(dyPx: number, dtMs: number): number {
  if (!(dtMs > 0)) return 0;
  return dyPx / dtMs;
}

export function useSheetDrag(onClose: () => void): {
  dragY: Animated.Value;
  /** True selama animasi keluar: kartu tak lagi menerima sentuhan. */
  closing: boolean;
  /** Kembalikan kartu ke posisi diam (untuk sheet yang tetap mount). */
  reset: () => void;
  onTouchStart: (event: GestureResponderEvent) => void;
  onTouchMove: (event: GestureResponderEvent) => void;
  onTouchEnd: (event: GestureResponderEvent) => void;
  onTouchCancel: () => void;
} {
  // Frame-entrance-_layout pattern (passes react-hooks/refs): the Animated
  // value lives in state, not in a render-written ref.
  const [dragY] = useState(() => new Animated.Value(0));
  const [closing, setClosing] = useState(false);
  // Sheet yang tetap mount (voice: cuma visible=false) memakai ini tiap
  // dibuka kembali — tanpa reset, dragY nyangkut di luar layar (exit
  // animation kemarin) dan closing nyangkut true (pointerEvents none).
  // Sheet yang unmount tiap tutup (quick-action host) tak butuh ini.
  const reset = useCallback(() => {
    dragY.setValue(0);
    setClosing(false);
  }, [dragY]);
  const track = useRef<{
    startX: number;
    startY: number;
    startT: number;
    engaged: boolean;
    dead: boolean;
  } | null>(null);

  function onTouchStart(event: GestureResponderEvent) {
    // Multi-touch is not a drag: cancel this gesture.
    if (event.nativeEvent.touches.length > 1) {
      track.current = null;
      return;
    }
    const touch = event.nativeEvent.touches[0];
    if (!touch) {
      track.current = null;
      return;
    }
    track.current = {
      startX: touch.pageX,
      startY: touch.pageY,
      startT: Date.now(),
      engaged: false,
      dead: false,
    };
  }

  function onTouchMove(event: GestureResponderEvent) {
    const t = track.current;
    if (!t) return;
    const touch = event.nativeEvent.touches[0];
    if (!touch) return;
    const dx = touch.pageX - t.startX;
    const dy = touch.pageY - t.startY;
    if (!t.engaged && !t.dead) {
      if (shouldClaimSheetDrag(dy, dx)) {
        t.engaged = true;
      } else if (Math.abs(dx) > SHEET_DRAG_SLOP) {
        // Horizontal-dominant: not the sheet's business, ignore the rest.
        t.dead = true;
        return;
      } else {
        return;
      }
    }
    if (!t.engaged) return;
    dragY.setValue(Math.max(0, dy));
  }

  function settle(endY: number | null) {
    const t = track.current;
    track.current = null;
    if (!t || !t.engaged || endY === null) {
      if (t?.engaged) {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      }
      return;
    }
    const dy = endY - t.startY;
    const vy = sheetFlingVelocity(dy, Date.now() - t.startT);
    if (shouldCloseSheet(dy, vy)) {
      // Keluar mulus (fix glitch lompat-naik): JANGAN reset dragY ke 0 —
      // reset instan + animasi tutup native Modal adalah tabrakan yang
      // terlihat sebagai "naik dulu baru turun". Lanjutkan meluncur ke
      // luar layar, baru unmount: animasi tutup native tak terlihat karena
      // kartu sudah di luar viewport. Animasi buka tetap bawaan OS.
      void tapToggle();
      setClosing(true);
      Animated.timing(dragY, {
        toValue: Math.max(dy, Dimensions.get('window').height),
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onClose());
    } else {
      Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
    }
  }

  function onTouchEnd(event: GestureResponderEvent) {
    const touch = event.nativeEvent.changedTouches[0];
    settle(touch ? touch.pageY : null);
  }

  function onTouchCancel() {
    settle(null);
  }

  return {
    dragY,
    closing,
    reset,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}
