/**
 * Analytics empty state (AC #7): a range with no transactions must show this,
 * never a chart full of NaN/Infinity. Kept deliberately quiet — it is a
 * resting state, not an error.
 */
import { EmptyStateCard } from '@/components/empty-state-card';

export function AnalyticsEmptyState({
  testID = 'analytics-empty',
}: {
  testID?: string;
}) {
  return (
    <EmptyStateCard
      testID={testID}
      icon="insights"
      title="Belum ada data"
      description="Tidak ada transaksi pada rentang ini. Coba rentang lain atau catat transaksi baru."
    />
  );
}
