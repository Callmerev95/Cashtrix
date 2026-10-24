/**
 * FIFO flush engine (OB2, issue #75).
 *
 * One row at a time, one outcome per row. A transport/5xx failure marks the
 * row retryable and stops the pass (the network is gone; hammering the rest
 * would only burn quota and produce 200 identical failures). A 4xx/constraint
 * refusal is terminal for that row and the pass continues, because the next
 * row may be perfectly valid.
 *
 * The transaction commits before its photos are uploaded (R1). Receipt
 * upload/link is best-effort: the money is already safe, so a photo failure
 * never turns a committed save into a failed queue row.
 */
import { createTransaction } from '@/features/transactions/api';
import {
  linkReceiptsToTransaction,
  uploadReceiptPhoto,
} from '@/features/receipts/api';
import { hasScanConsent, scanReceipt } from '@/features/receipts/scan';

import {
  isRetryableOutboxRow,
  outboxFailureFor,
  sortFifo,
  type OutboxRow,
} from './domain';
import { deleteOutboxPhoto } from './files';
import {
  deleteOutboxRow,
  listOutbox,
  updateOutboxStatus,
} from './outbox';

export type FlushResult = {
  sent: number;
  failed: number;
  /** True when a network failure stopped the pass early. */
  stopped: boolean;
};

async function uploadReceipts(
  userId: string,
  row: OutboxRow,
): Promise<{ ids: string[]; scanPaths: string[] }> {
  const ids = [...row.payload.receiptIds];
  const scanPaths: string[] = [];
  for (const path of row.payload.receiptPaths) {
    try {
      const uploaded = await uploadReceiptPhoto({
        userId,
        sourceUri: path,
        mime: 'image/jpeg',
      });
      ids.push(uploaded.id);
      scanPaths.push(uploaded.storagePath);
      deleteOutboxPhoto(path);
    } catch {
      // Keep the local file for the 7-day orphan sweep. The transaction is
      // already committed; a photo is proof, never the save itself.
    }
  }
  return { ids, scanPaths };
}

async function retryScans(storagePaths: string[]): Promise<void> {
  // R1's "retry OCR last": photos upload only after the transaction commits,
  // and the scan retry runs after upload. The transaction already carries the
  // user's amount, so the result is intentionally not applied — this only
  // re-runs the server path for a photo that never got scanned offline.
  // Entirely best-effort: a consent-storage failure must not turn a committed
  // save into a failed queue row.
  if (storagePaths.length === 0) return;
  try {
    if (!(await hasScanConsent())) return;
    await Promise.all(
      storagePaths.map((storagePath) =>
        scanReceipt({ storagePath }).catch(() => undefined),
      ),
    );
  } catch {
    // OCR is a convenience; the amount/merchant are already saved.
  }
}

export async function flushOutbox(input: {
  userId: string;
  onProgress?: () => Promise<void> | void;
}): Promise<FlushResult> {
  const rows = sortFifo(await listOutbox(input.userId));
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    if (!isRetryableOutboxRow(row)) continue;

    await updateOutboxStatus({
      userId: input.userId,
      id: row.id,
      status: 'sending',
    });
    await input.onProgress?.();

    try {
      const transactionId = await createTransaction({
        userId: input.userId,
        walletId: row.payload.walletId,
        categoryId: row.payload.categoryId,
        counterpartyWalletId: row.payload.counterpartyWalletId,
        type: row.payload.type,
        amount: row.payload.amount,
        occurredAt: row.payload.occurredAt,
        note: row.payload.note,
        idempotencyKey: row.id,
      });

      const uploaded = await uploadReceipts(input.userId, row);
      if (uploaded.ids.length > 0) {
        await linkReceiptsToTransaction({
          userId: input.userId,
          receiptIds: uploaded.ids,
          transactionId,
        }).catch(() => 0);
      }
      await retryScans(uploaded.scanPaths);

      await deleteOutboxRow(input.userId, row.id);
      sent += 1;
    } catch (cause) {
      const failure = outboxFailureFor(cause);
      await updateOutboxStatus({
        userId: input.userId,
        id: row.id,
        status: 'failed',
        errorKind: failure.kind,
        errorMessage: failure.code,
      });
      failed += 1;
      if (failure.kind === 'network') {
        await input.onProgress?.();
        return { sent, failed, stopped: true };
      }
    }
    await input.onProgress?.();
  }

  return { sent, failed, stopped: false };
}
