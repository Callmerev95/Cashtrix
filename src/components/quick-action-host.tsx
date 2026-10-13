import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { QuickActionSheet } from './quick-action-sheet';
import {
  dismissQuickActions,
  getQuickActionsSnapshot,
  pickQuickAction,
  subscribeQuickActions,
} from './quick-action-store';

/**
 * Single app-wide quick-action sheet host (P3b-2 Tahap 1).
 *
 * Mounted once at the app root (sibling of the navigator, same class as
 * LockOverlay): the core-Modal sheet lives in its own window, so one host
 * covers every route — tabs and root-level screens alike. Context-free
 * (locale comes from the OS, haptics already fired) so provider ordering
 * cannot matter.
 */
export function QuickActionSheetHost() {
  const request = useSyncExternalStore(
    subscribeQuickActions,
    getQuickActionsSnapshot,
  );
  if (!request) return <View collapsable={false} />;
  return (
    <QuickActionSheet
      open
      title={request.title}
      actions={request.actions}
      cancelLabel={request.cancelLabel}
      onPick={pickQuickAction}
      onClose={dismissQuickActions}
    />
  );
}
