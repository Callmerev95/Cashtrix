/**
 * Analytics empty state (AC #7): a range with no transactions must show this,
 * never a chart full of NaN/Infinity. Kept deliberately quiet — it is a
 * resting state, not an error.
 */
import { EmptyStateCard } from '@/components/empty-state-card';
import { dictionaryFor, useLanguage } from '@/i18n';

export function AnalyticsEmptyState({
  testID = 'analytics-empty',
}: {
  testID?: string;
}) {
  // C6: copy follows the OS language (ADR-0008).
  const t = dictionaryFor(useLanguage());
  return (
    <EmptyStateCard
      testID={testID}
      icon="insights"
      title={t.analytics.empty.title}
      description={t.analytics.empty.body}
    />
  );
}
