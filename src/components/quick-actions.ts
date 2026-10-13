/**
 * Public quick-action API (P3b-1 signature, P3b-2 Tahap 1 skin).
 *
 * Call sites keep calling `showQuickActions(title, actions, cancel)` —
 * only the rendering moved from the native Alert to the themed sheet.
 */
export {
  dismissQuickActions,
  pickQuickAction,
  showQuickActions,
} from './quick-action-store';
export type { QuickAction, QuickActionRequest } from './quick-action-store';
