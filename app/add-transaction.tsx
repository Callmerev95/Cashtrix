/**
 * Add / Edit Transaction (route `/add-transaction`, presented as a modal).
 *
 * The whole point of this screen is speed (PRD KPI: <20 s to save), so:
 *  - the Expense/Income toggle restores the last choice and defaults to expense;
 *  - the amount field live-formats `id-ID` behind a static gold `Rp`;
 *  - the category grid switches with the toggle, so the right categories are
 *    always in front of the user;
 *  - the wallet defaults to the wallet of the last transaction;
 *  - the idempotency key is minted **once when the form opens**, so a retry
 *    after a dropped connection cannot double-post.
 *
 * `?id=` switches to edit mode (delete also lives here, as a destructive
 * confirm sheet).
 *
 * Transfer (V2, ADR-0004) is the third segment: the category grid hides and a
 * destination-wallet picker appears instead. Transfer rows carry
 * `category_id = null` and `counterparty_wallet_id` set — the DB check
 * enforces the shape, the form just refuses to send anything else.
 *
 * Date entry is a full month grid (`CalendarGrid`, plain `View`s like the T6
 * donut / T7 ring — no native date-picker module, so no dev-client rebuild).
 * Future days render disabled and can never be picked; the submit guard
 * rejects them anyway for income/expense/transfer alike.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, Card, LogoMark, PrimaryButton, Screen, SectionHeader, AiPrefillBanner } from '@/components';
import { useAnalytics } from '@/features/analytics';
import { useAuth } from '@/features/auth';
import { requestPushPermission, sendBudgetAlert, useBudgets } from '@/features/budgets';
import { tapPrefill, tapSave } from '@/features/haptics';
import { trackEvent, txCreatedEvent } from '@/features/observability';
import {
  hasScanConsent,
  listReceiptsForTransaction,
  ReceiptAttachmentSection,
  resolveCategorySuggestion,
  scanDisplayDelay,
  scanReceipt,
  ScanReview,
  setScanConsent,
  type ReceiptAttachment,
  type ScanPrefill,
} from '@/features/receipts';
import { useWallets } from '@/features/wallets';
import { VoiceSheet, parseVoiceFlag, widgetSaveCopy, type VoicePrefill, type VoiceSplitOkRow, type VoiceTransactionKind } from '@/features/voice';
import {
  AmountField,
  CalendarGrid,
  CategoryGrid,
  DeleteConfirmSheet,
  TypeSegmentedControl,
  categoriesForKind,
  formatAmountInput,
  formatGrouped,
  isFutureDate,
  newIdempotencyKey,
  normalizeNote,
  parseEntrySource,
  parseScanFlag,
  parseShortcutType,
  scanForcedType,
  useTransactions,
  validateAmount,
  validateTransfer,
  type Transaction,
  type TransactionType,
} from '@/features/transactions';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

export default function AddTransactionScreen() {
  // S1 (ADR-0009): shortcut deep links arrive as
  // `cashtrix://add-transaction?type=expense|income` and `cashtrix://scan`
  // (via the `/scan` alias as `scan=1`). `type` only preselects the segment —
  // `transfer` and unknown values fall through to the remembered preference.
  const params = useLocalSearchParams<{ id?: string; type?: string; scan?: string; voice?: string; source?: string }>();
  const isEdit = Boolean(params.id);
  const insets = useSafeAreaInsets();
  // C6: copy + validation follow the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const tf = t.transactions.form;

  const { session } = useAuth();
  const { refresh: refreshWallets } = useWallets();
  const { refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const { refresh: refreshAnalytics } = useAnalytics();
  const {
    categories,
    wallets,
    lastType,
    lastWalletId,
    loadTransaction,
    save,
    remove,
    rememberType,
    rememberWallet,
  } = useTransactions();

  // Minted once per form session (AC #22). A `useRef` (not state) so a re-render
  // never regenerates it, and `refresh()` after a save cannot change it.
  const idempotencyKey = useRef(newIdempotencyKey()).current;

  // Split-save keys (WG2): one idempotency key per row per sheet session, so
  // a retry after a dropped connection resumes without double-posting any
  // row. Keyed by index + note (stable while the utterance is unchanged).
  const splitKeys = useRef<Record<string, string>>({});
  function splitKeyFor(index: number, note: string): string {
    const slot = `${index}|${note}`;
    const existing = splitKeys.current[slot];
    if (existing) return existing;
    const fresh = newIdempotencyKey();
    splitKeys.current[slot] = fresh;
    return fresh;
  }

  // Form state. Every "default" below is *derived during render* from the
  // context (remembered preference) plus an explicit user override, never
  // synced by an effect — a sync setState in an effect cascades renders, which
  // the lint rule bans and which would also stomp the user's edits when the
  // context refetches after a save.
  const [typeOverride, setTypeOverride] = useState<TransactionType | null>(null);
  const [walletChoice, setWalletChoice] = useState<string | null>(null);
  const [destinationChoice, setDestinationChoice] = useState<string | null>(
    null,
  );
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null);
  const [amountRaw, setAmountRaw] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // VC2 (issue #64, Option A: dikte keyboard OS): the voice-detected kind
  // feeds the segment chain below (create mode only — the panel never
  // renders for `?id=`). VC3: `voice=1` (only emitted by the `/voice`
  // alias for `cashtrix://voice`) opens the panel on first paint.
  // `voiceOpen` mirrors the panel so the save button can switch its testID
  // (`voice-save` in a voice session, `transaction-save` otherwise) — both
  // Maestro paths keep a stable selector.
  // WG2 (ADR-0011): the home-screen widget fires the same deep links plus
  // `source=widget`. Only the widget path gains a local notification (the
  // in-app snackbar is not visible from the home screen); the save itself,
  // the gate parking, and the dismissal are identical.
  const widgetSource = !isEdit && parseEntrySource(params.source) === 'widget';
  const voiceMode = !isEdit && parseVoiceFlag(params.voice);
  const [voiceType, setVoiceType] = useState<VoiceTransactionKind | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(voiceMode);

  // Edit mode loads a row into `loaded` and the fields read from it until the
  // user starts typing (each override wins over `loaded`).
  const [loaded, setLoaded] = useState<Transaction | null>(null);

  // S1 contract for S2: `scan=1` (only emitted by the `/scan` alias) marks
  // this session as scan-first — the receipt section below starts with the
  // camera open (S3 UX, QRIS-style). Declared before the type derivation so
  // scan mode can force the expense segment.
  const scanMode = !isEdit && parseScanFlag(params.scan);

  // S1: a shortcut `?type=` seeds the segment below an explicit toggle but
  // above the remembered preference; edit mode (`?id=`) ignores it so a
  // shared link can never retarget a row being edited. S3: scan mode forces
  // expense (struk = belanja) at the same level — a stale lastType=transfer
  // must never greet a scan session, but an explicit toggle still wins.
  // VC2: a voice-detected kind sits below the deliberate choices (toggle,
  // shortcut, scan) but above the remembered preference — a guess never
  // outranks an explicit user decision.
  const shortcutType = isEdit ? null : parseShortcutType(params.type);
  const type: TransactionType =
    typeOverride ??
    shortcutType ??
    scanForcedType(scanMode) ??
    voiceType ??
    loaded?.type ??
    lastType;
  const isTransfer = type === 'transfer';

  // Attachments are user-created rows (uploaded at capture, Opsi A), so they
  // live in plain state: the save reads the ids to link them, edit mode
  // seeds them from the server row list on load (same load pattern as the
  // edited row itself, never a render-sync).
  const [receipts, setReceipts] = useState<ReceiptAttachment[]>([]);

  // S3 (issue #57): scan state. Prefill writes form fields from event
  // handlers (user taps, upload callbacks), never from an effect — the lint
  // rule and the no-stomp discipline above both stay intact.
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [captureRequest, setCaptureRequest] = useState(0);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewPrefill, setReviewPrefill] = useState<ScanPrefill | null>(null);
  const [reviewPreviewUri, setReviewPreviewUri] = useState('');
  const tr = t.transactions.receipt;

  // Wallet: explicit choice > the row being edited > the remembered last-used
  // wallet > the first available (so an empty picker can never block Save).
  const walletId =
    walletChoice ?? loaded?.walletId ?? lastWalletId ?? wallets[0]?.id ?? null;

  // Transfer destination: explicit choice > the row being edited > the first
  // wallet that is not the source (never default to the source itself —
  // source = destination is rejected by the DB check).
  const destinationWalletId = isTransfer
    ? (destinationChoice ??
      loaded?.counterpartyWalletId ??
      wallets.find((wallet) => wallet.id !== walletId)?.id ??
      null)
    : null;

  // Category: an explicit choice only counts while it belongs to the visible
  // `kind`; otherwise fall back to the edited row's category. Switching the
  // toggle and back never loses the pick because nothing is cleared.
  const categoryId = useMemo(() => {
    const chosen = categoryChoice ?? loaded?.categoryId ?? null;
    if (!chosen) return null;
    return categories.some(
      (category) => category.id === chosen && category.kind === type,
    )
      ? chosen
      : null;
  }, [categories, categoryChoice, loaded, type]);

  // Edit mode: fetch the row once; the effect only writes state in a promise
  // callback (an external system), never synchronously in the effect body.
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const sessionUserId = session?.user.id ?? null;
  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;

    loadTransaction(params.id)
      .then((transaction: Transaction | null) => {
        if (cancelled) return;
        if (transaction) {
          setLoaded(transaction);
          setAmountRaw(formatAmountInput(String(transaction.amount)));
          setOccurredAt(new Date(transaction.occurredAt));
          setNote(transaction.note ?? '');
          if (sessionUserId) {
            listReceiptsForTransaction({
              userId: sessionUserId,
              transactionId: transaction.id,
            })
              .then((rows) => {
                if (!cancelled) setReceipts(rows);
              })
              .catch(() => undefined);
          }
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setFormError(
          cause instanceof Error ? cause.message : tf.loadFail,
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadTransaction, params.id, sessionUserId, tf.loadFail]);

  function onToggleType(next: TransactionType) {
    setTypeOverride(next);
    // Persist immediately: the preference must survive even if the user backs
    // out without saving (AC #15).
    void rememberType(next);
  }

  function onPickDate(next: Date) {
    // The grid never offers future days (they render disabled); the guard
    // stays so a programmatic value can never slip through either.
    if (isFutureDate(next)) return; // AC #19: never a future date
    setOccurredAt(next);
  }

  // VC2 (issue #64, Option A: dikte keyboard OS): the voice-detected kind
  // feeds the segment chain above (create mode only — the panel never
  // renders for `?id=`). `voiceOpen` only switches the save button's testID
  // (`voice-save` in a voice session, `transaction-save` otherwise) so both
  // Maestro paths keep a stable selector.
  // (State `voiceType`/`voiceOpen` lives with the other form state above,
  // before the segment derivation that reads it.)

  // Voice prefill (event handler, never an effect — same discipline as the
  // S3 prefill above): every field is a gap-fill that never clobbers what
  // the user already picked or typed. Nominal only when the amount field is
  // still empty, wallet only when no explicit choice exists, category only
  // when none is picked (kind-aware: the S3 resolver is expense-only and
  // stays untouched), note only when empty. `occurred_on` from AI is
  // discarded permanently (S3 discipline: the form default owns history
  // order). Refusals never reach here (the sheet only calls back on `ok`),
  // so a failed parse leaves the form fully usable for manual entry.
  function resolveAiVoiceCategory(
    hint: string | null,
    kind: VoiceTransactionKind,
    currentCategoryId: string | null,
  ): string | null {
    if (currentCategoryId) return currentCategoryId;
    if (!hint) return null;
    const lowered = hint.toLowerCase();
    const hinted = categories.find(
      (category) =>
        category.kind === kind &&
        category.name.toLowerCase().includes(lowered),
    );
    return hinted?.id ?? null;
  }

  function applyVoicePrefill(prefill: VoicePrefill) {
    const formatted = formatAmountInput(String(prefill.amount));
    setAmountRaw((prev) => (prev === '' ? formatted : prev));
    setVoiceType(prefill.kind);
    if (prefill.walletId) {
      setWalletChoice((prev) => (prev === null ? prefill.walletId : prev));
    }
    if (prefill.categoryHint) {
      const pickedId = categoryId;
      const suggested = resolveAiVoiceCategory(
        prefill.categoryHint,
        prefill.kind,
        pickedId,
      );
      if (suggested && suggested !== pickedId) setCategoryChoice(suggested);
    }
    // PRD §4.4: the utterance survives only here, as ordinary user data
    // (like anything typed) — the save path below still sends analytics a
    // boolean `hasNote`, never text or amounts.
    setNote((prev) =>
      prev === '' ? prefill.note.slice(0, 200) : prev,
    );
  }

  // S3: consent-once (disetujui pemilik) then prefill. Every field stays
  // editable and Save is always manual — a wrong OCR can never write dirty
  // data (story 11), and a failed scan never blocks Save (story 16).
  // The consent flag persists on-device (not purged on sign-out): agreeing
  // once means never asked again.
  async function scanWithConsent(attachment: ReceiptAttachment) {
    if (await hasScanConsent()) {
      await runScanFor(attachment);
      return;
    }
    Alert.alert(
      tr.consentTitle,
      `${tr.consentBody} ${tr.consentPersistNote}`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: tr.consentSend,
          onPress: () => {
            void (async () => {
              await setScanConsent();
              await runScanFor(attachment);
            })();
          },
        },
      ],
    );
  }

  // Auto-scan (S3 UX, QRIS-style): every new photo in an expense form is
  // read without a tap — create and edit alike (keputusan pemilik: satu
  // aturan). Pre-linked rows loaded when opening edit never fire this
  // (they arrive via `setReceipts`, not the upload callback), so opening a
  // record can never stomp its fields. Income/transfer stay manual. Fired
  // from the upload callback — event-driven, never an effect.
  function handlePhotoUploaded(attachment: ReceiptAttachment) {
    if (type !== 'expense') return;
    void scanWithConsent(attachment);
  }

  // Upload/delete failures (section callback): same failure package as a
  // failed read — the raw error is swallowed here (it carries a userId
  // storage path, so it must reach neither UI nor logs), the user gets the
  // friendly copy plus Foto ulang / Isi manual.
  function handleUploadError() {
    if (scanning) return;
    setScanOk(false);
    setScanNote(tr.uploadFail);
  }

  async function runScanFor(attachment: ReceiptAttachment) {
    if (scanning) return;
    setScanning(true);
    setScanNote(null);
    setScanOk(false);
    try {
      // The display floor resolves alongside the request (honesty floor —
      // the note still gates on completion, never on the timer).
      const [outcome] = await Promise.all([
        scanReceipt({ storagePath: attachment.storagePath }),
        scanDisplayDelay(),
      ]);
      if (outcome.status === 'ok') {
        const { prefill } = outcome;
        // Prefill is nominal + category (+ merchant→note) only (keputusan
        // pemilik): datetime is NEVER touched, in create or edit — the form
        // default (scan moment) owns the history order. Every field is a
        // gap-fill via functional updates (render-safe): a follow-up photo
        // can never stomp a manual correction.
        const formatted = formatAmountInput(String(prefill.amount));
        setAmountRaw((prev) => (prev === '' ? formatted : prev));
        // Never clobber what the user already typed — prefill fills gaps.
        setNote((prev) => (prev === '' && prefill.merchant ? prefill.merchant : prev));
        if (prefill.categorySuggestion) {
          const pickedId = categories.some(
            (category) => category.id === categoryId && category.kind === type,
          )
            ? categoryId
            : null;
          if (!pickedId) {
            const suggested = resolveCategorySuggestion(
              prefill.categorySuggestion,
              categories,
            );
            if (suggested) {
              const match = categories.some(
                (category) =>
                  category.id === suggested && category.kind === type,
              );
              if (match) setCategoryChoice(suggested);
            }
          }
        }
        setScanNote(tr.scanApplied);
        setScanOk(true);
        setReviewPrefill(prefill);
        setReviewPreviewUri(attachment.previewUrl);
        setReviewVisible(true);
        void tapPrefill();
      } else if (outcome.status === 'rate_limited') {
        setScanNote(tr.scanRateLimited);
      } else if (outcome.status === 'quota_exceeded') {
        setScanNote(tr.scanQuota);
      } else {
        setScanNote(tr.scanFail);
      }
    } finally {
      setScanning(false);
    }
  }

  // Failure package (keputusan pemilik): retake shoots straight to the
  // camera (one tap, no sheet); manual dismisses the note and continues
  // typing. Re-reading the same photo stays on the retry button above.
  function retakePhoto() {
    if (scanning) return;
    setCaptureRequest((count) => count + 1);
  }

  function dismissScanNote() {
    setScanNote(null);
  }

  // Split-row category (WG2): the row's kind is uniform across the split
  // (mixed kinds refuse in the parser), so the hint resolves against that
  // kind's visible categories — the S3 resolver is expense-only and stays
  // untouched. Falls back to the form's picked category when it matches the
  // row kind; null blocks the whole commit (validated before any write).
  function resolveSplitCategory(
    hint: string | null,
    kind: VoiceTransactionKind,
  ): string | null {
    if (hint) {
      const lowered = hint.toLowerCase();
      const hinted = categories.find(
        (category) =>
          category.kind === kind &&
          category.name.toLowerCase().includes(lowered),
      );
      if (hinted) return hinted.id;
    }
    const picked = categories.find((category) => category.id === categoryId);
    return picked && picked.kind === kind ? picked.id : null;
  }

  async function submit() {
    const amount = validateAmount(amountRaw, language);
    if (!amount.ok) {
      setAmountError(amount.error);
      return;
    }
    setAmountError(null);

    if (!walletId) {
      setFormError(tf.walletRequired);
      return;
    }
    if (isTransfer) {
      const transfer = validateTransfer(
        {
          sourceWalletId: walletId,
          destinationWalletId,
        },
        language,
      );
      if (!transfer.ok) {
        setFormError(transfer.error);
        return;
      }
    } else if (!categoryId) {
      setFormError(tf.categoryRequired);
      return;
    }
    if (isFutureDate(occurredAt)) {
      setFormError(tf.futureDate);
      return;
    }

    setFormError(null);
    setBusy(true);

    try {
      await save({
        id: params.id,
        userId: session?.user.id ?? '',
        walletId,
        categoryId: isTransfer ? null : categoryId,
        counterpartyWalletId: isTransfer ? destinationWalletId : null,
        type,
        amount: amount.value,
        occurredAt,
        note: normalizeNote(note),
        idempotencyKey,
        receiptIds: receipts.map((attachment) => attachment.id),
      });

      // B1: the commit landed — buzz before the proof (snackbar / widget
      // notification) is posted. Best-effort, never blocks the save.
      void tapSave();

      // T10 (issue #11): `tx_created` carries only the kind + whether a note
      // exists (boolean, never the text or amount). Best-effort — a failure
      // here must not lose the saved transaction.
      try {
        trackEvent(
          txCreatedEvent({
            type,
            hasNote: normalizeNote(note) !== null,
          }),
        );
      } catch {
        // Analytics never blocks a save.
      }

      // Balances are a separate view owned by the wallet context; the save
      // changed the aggregate, so it must re-read before the Dashboard paints.
      // Budgets re-read too: a committed expense can push a category past its
      // threshold, and the alert must fire within seconds of the commit
      // (PRD §2.3 Epic E). Analytics re-reads as well: the Insight screen
      // would otherwise show the pre-save overview until the range changes.
      //
      // Opsi B (S1 follow-up): these re-reads are fire-and-forget — each
      // context applies its result when it lands, but none of them may trap
      // the form. A stalled network settles neither resolve nor reject, and
      // awaiting it left the submit spinner spinning forever on a committed
      // save (device finding: shortcut save, cold start AND background).
      // The success snackbar on the Dashboard is the save's proof, not this
      // screen staying open.
      void refreshWallets();
      void (async () => {
        try {
          await refreshBudgets();
          await refreshAnalytics();
          // Fresh server read inside (V6) — the cached list is still pre-save
          // truth here, so evaluating it would miss this commit's crossing.
          await evaluateAndAlert({ userId: session?.user.id ?? '' });
        } catch {
          // Non-fatal; the next save re-evaluates (dedup-safe).
        }
      })();
      // AI-first prefill sessions (AI4) and widget saves alike post the same
      // local notification: the home screen cannot see the Dashboard
      // snackbar, so a widget save posts "N transaksi, Total RpX" instead.
      // Permission is asked here (on the first widget save, never on launch,
      // same rule as the first-budget prompt) and everything is
      // best-effort: a denial still leaves the committed save + snackbar.
      if (widgetSource) {
        try {
          await requestPushPermission();
          const copy = widgetSaveCopy(
            { count: 1, total: formatGrouped(amount.value, language) },
            language,
          );
          await sendBudgetAlert({ title: copy.title, body: copy.body });
        } catch {
          // Notification never blocks the save proof.
        }
      }
      // A shortcut deep link can land here with an empty history (cold start
      // or a router state reset): a bare `back()` is then a no-op and the
      // form never unmounts, so fall back to replacing at the Dashboard.
      setBusy(false);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        isEdit ? tf.saveFailEdit : tf.saveFailCreate,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    }
  }

  // Split commit (WG2 stories 1–4, ADR-0011): one tap writes every surviving
  // preview row. Each row carries its own idempotency key (minted once per
  // sheet session above), so a retry resumes without double-posting. All
  // rows validate before the first write — a missing wallet/category aborts
  // the whole commit, never a partial one. Rows inherit the form's date
  // (the S3 discipline: the form default owns history order) and carry no
  // receipts (photos stay on the manual single-save path; unlinked orphans
  // fall to the 30-day sweep).
  async function submitSplit(rows: VoiceSplitOkRow[]) {
    if (busy || rows.length === 0) return;
    const userId = session?.user.id ?? '';
    const planned = rows.map((row, index) => ({
      row,
      index,
      rowWalletId: row.walletId ?? walletId,
      rowCategoryId: resolveSplitCategory(row.categoryHint, row.kind),
    }));
    const blocked = planned.find(
      (item) => !item.rowWalletId || !item.rowCategoryId,
    );
    if (blocked) {
      setFormError(
        !blocked.rowWalletId ? tf.walletRequired : tf.categoryRequired,
      );
      return;
    }

    setFormError(null);
    setBusy(true);

    try {
      const occurred = occurredAt;
      for (const item of planned) {
        const rowNote = normalizeNote(item.row.note);
        await save({
          userId,
          walletId: item.rowWalletId ?? '',
          categoryId: item.rowCategoryId,
          type: item.row.kind,
          amount: item.row.amount,
          occurredAt: occurred,
          note: rowNote,
          idempotencyKey: splitKeyFor(item.index, item.row.note),
          receiptIds: [],
        });
        // Boolean-only per row (PRD §4.4 — never text or amounts).
        try {
          trackEvent(
            txCreatedEvent({
              type: item.row.kind,
              hasNote: rowNote !== null,
            }),
          );
        } catch {
          // Analytics never blocks a save.
        }
      }
      // B1: all rows committed — one buzz for the whole split (cf. submit()).
      void tapSave();

      // Same post-save pattern as `submit()`: fire-and-forget re-reads plus
      // a fresh-server alert evaluation (V6 — the cache is pre-commit here).
      void refreshWallets();
      void (async () => {
        try {
          await refreshBudgets();
          await refreshAnalytics();
          await evaluateAndAlert({ userId });
        } catch {
          // Non-fatal; the next save re-evaluates (dedup-safe).
        }
      })();

      // Widget-only (ADR-0011): the home screen cannot see the Dashboard
      // snackbar, so a widget save posts "N transaksi, Total RpX" instead.
      // Permission is asked here — on the first widget save, never on launch
      // (same rule as the first-budget prompt) — and everything is
      // best-effort: a denial still leaves the committed save + snackbar.
      // In-app split saves keep the snackbar and gain nothing new.
      if (widgetSource) {
        try {
          await requestPushPermission();
          const total = planned.reduce((sum, item) => sum + item.row.amount, 0);
          const copy = widgetSaveCopy(
            { count: planned.length, total: formatGrouped(total, language) },
            language,
          );
          await sendBudgetAlert({ title: copy.title, body: copy.body });
        } catch {
          // Notification never blocks the save proof.
        }
      }

      setBusy(false);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        tf.saveFailCreate,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    }
  }

  async function confirmDelete() {
    if (!params.id) return;
    setBusy(true);
    try {
      await remove(params.id);
      // Fire-and-forget like the save path (see `submit`): a stalled re-read
      // must never trap this sheet on a committed delete.
      void refreshWallets();
      void (async () => {
        // Spent dropped — re-read budgets so rings fall back immediately.
        // Analytics drops with it, or Insight keeps the deleted row's amounts.
        // No alert evaluation: a lower percent can never cross a threshold
        // upward, and fired alerts are never cleared by edits/deletes.
        try {
          await refreshBudgets();
          await refreshAnalytics();
        } catch {
          // Non-fatal; the Budgets tab refreshes on its own.
        }
      })();
      setConfirmingDelete(false);
      // V6: biarkan jendela undo tetap terbuka. `remove()` sudah membuka
      // `lastDeleted` setelah commit — sheet konfirmasi mencegah salah tekan,
      // snackbar ~10 detik di Dashboard menampung sesal sesudahnya (pola
      // Gmail: konfirmasi + Urungkan boleh berdampingan). Menutupnya di sini
      // membuat snackbar V4 tidak pernah tampil dari satu-satunya jalur hapus
      // di app, sehingga langkah "undo hapus" di gerbang Maestro (V6) tak
      // terjangkau.
      //
      // Same empty-history fallback as `submit`: an edit opened straight from
      // a deep link has nothing to go back to.
      setBusy(false);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (cause) {
      setBusy(false);
      setConfirmingDelete(false);
      Alert.alert(
        tf.deleteFail,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    }
  }

  return (
    <Screen hasFloatingNav={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable
            testID="add-transaction-close"
            accessibilityRole="button"
            accessibilityLabel={tf.back}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.close,
              pressed && pressedFeedback,
            ]}
          >
            <MaterialIcons name="chevron-left" size={28} color={colors.textPrimary} />
          </Pressable>
          <LogoMark size={32} />
          <Text style={[typography.headlineMd, styles.title]}>
            {isEdit ? tf.editTitle : tf.createTitle}
          </Text>
          {isEdit ? (
            <Pressable
              testID="transaction-delete"
              accessibilityRole="button"
              accessibilityLabel={tf.deleteA11y}
              onPress={() => setConfirmingDelete(true)}
              style={({ pressed }) => [
                styles.close,
                pressed && pressedFeedback,
              ]}
            >
              <MaterialIcons
                name="delete-outline"
                size={24}
                color={colors.error}
              />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loadingExisting ? (
            <Text style={[typography.bodyMd, styles.hint]}>
              {tf.loading}
            </Text>
          ) : null}

          <TypeSegmentedControl
            testID="type-toggle"
            value={type}
            onChange={onToggleType}
          />

          {/* Voice entry (P1): slim 48px row at the choice point. The sheet
          itself is an RN Modal (separate window), so in-flow placement is
          safe — the ScrollView-nesting constraint died with Gorhom. */}
          {isEdit ? null : (
            <View style={styles.gap}>
              <VoiceSheet
                open={voiceOpen}
                onOpenChange={setVoiceOpen}
                wallets={wallets}
                categories={categories}
                saving={busy}
                onPrefill={applyVoicePrefill}
                onSplitSave={submitSplit}
                userId={session?.user.id}
              />
            </View>
          )}

          <Card style={[styles.entryCard, styles.gap]}>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              {tf.amount}
            </Text>
            <AmountField
              testID="amount-input"
              value={amountRaw}
              error={amountError}
              onChangeText={(raw) => {
                setAmountRaw(formatAmountInput(raw));
                if (amountError) setAmountError(null);
              }}
            />
            <TextInput
              testID="note-input"
              style={styles.note}
              value={note}
              onChangeText={(text) => setNote(text.slice(0, 200))}
              placeholder={tf.notePlaceholder}
              placeholderTextColor={colors.textSecondary}
              selectionColor={colors.accent}
              maxLength={200}
              multiline
            />
          </Card>

          {isTransfer ? null : (
            <View style={styles.gap}>
              <SectionHeader
                testID="category-header"
                title={tf.category}
                actionLabel={fill(tf.categoryCount, {
                  count: categoriesForKind(categories, type).length,
                })}
              />
              <CategoryGrid
                testID="category-grid"
                categories={categories}
                kind={type}
                selectedId={categoryId}
                onSelect={(category) => setCategoryChoice(category.id)}
              />
            </View>
          )}

          <View style={styles.gap}>
            <SectionHeader
              testID="wallet-header"
              title={isTransfer ? tf.walletSource : tf.wallet}
            />
            <View testID="wallet-picker" style={styles.chips}>
              {wallets.map((wallet) => {
                const active = wallet.id === walletId;
                return (
                  <Pressable
                    key={wallet.id}
                    testID={`wallet-option-${wallet.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={wallet.name}
                    onPress={() => {
                      setWalletChoice(wallet.id);
                      void rememberWallet(wallet.id);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && pressedFeedback,
                    ]}
                  >
                    <MaterialIcons
                      name="account-balance-wallet"
                      size={18}
                      color={active ? colors.accent : colors.textSecondary}
                    />
                    <Text
                      style={[
                        typography.bodyMd,
                        styles.chipLabel,
                        active && styles.chipLabelActive,
                      ]}
                    >
                      {wallet.name}
                    </Text>
                  </Pressable>
                );
              })}
              {wallets.length === 0 ? (
                <Text style={[typography.bodySm, styles.hint]}>
                  {tf.walletEmpty}
                </Text>
              ) : null}
            </View>
          </View>

          {isTransfer ? (
            <View style={styles.gap}>
              <SectionHeader testID="destination-header" title={tf.destination} />
              <View testID="destination-picker" style={styles.chips}>
                {wallets
                  .filter((wallet) => wallet.id !== walletId)
                  .map((wallet) => {
                    const active = wallet.id === destinationWalletId;
                    return (
                      <Pressable
                        key={wallet.id}
                        testID={`destination-option-${wallet.id}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={wallet.name}
                        onPress={() => setDestinationChoice(wallet.id)}
                        style={({ pressed }) => [
                          styles.chip,
                          active && styles.chipActive,
                          pressed && pressedFeedback,
                        ]}
                      >
                        <MaterialIcons
                          name="call-received"
                          size={18}
                          color={active ? colors.accent : colors.textSecondary}
                        />
                        <Text
                          style={[
                            typography.bodyMd,
                            styles.chipLabel,
                            active && styles.chipLabelActive,
                          ]}
                        >
                          {wallet.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                {wallets.filter((wallet) => wallet.id !== walletId).length ===
                0 ? (
                  <Text style={[typography.bodySm, styles.hint]}>
                    {tf.destinationEmpty}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.gap}>
            <SectionHeader testID="date-header" title={tf.date} />
            <CalendarGrid
              testID="date-calendar"
              value={occurredAt}
              onChange={onPickDate}
            />
          </View>

          <View style={styles.gap}>
            <SectionHeader
              testID="receipt-header"
              title={t.transactions.receipt.attach}
            />
            <ReceiptAttachmentSection
              attachments={receipts}
              onAttachmentsChange={setReceipts}
              userId={session?.user.id ?? ''}
              sheetVisible={sheetVisible}
              onSheetVisibleChange={setSheetVisible}
              autoCamera={scanMode}
              captureRequest={captureRequest}
              scanning={scanning}
              onPhotoUploaded={handlePhotoUploaded}
              onUploadError={handleUploadError}
            />
            {scanNote ? (
              <AiPrefillBanner key={scanNote}>
                <Text
                  testID="receipt-scan-note"
                  style={[typography.bodySm, scanOk ? styles.scanLabel : styles.hint]}
                >
                  {scanNote}
                </Text>
              </AiPrefillBanner>
            ) : null}
            {scanNote && !scanOk && !scanning ? (
              <View style={styles.scanActions}>
                <Pressable
                  testID="receipt-retake"
                  accessibilityRole="button"
                  accessibilityLabel={tr.scanRetakeA11y}
                  onPress={retakePhoto}
                  style={({ pressed }) => [
                    styles.scanAction,
                    pressed && pressedFeedback,
                  ]}
                >
                  <MaterialIcons
                    name="photo-camera"
                    size={18}
                    color={colors.accent}
                  />
                  <Text style={[typography.bodyMd, styles.scanLabel]}>
                    {tr.scanRetake}
                  </Text>
                </Pressable>
                <Pressable
                  testID="receipt-manual"
                  accessibilityRole="button"
                  accessibilityLabel={tr.scanManualA11y}
                  onPress={dismissScanNote}
                  style={({ pressed }) => [
                    styles.scanAction,
                    pressed && pressedFeedback,
                  ]}
                >
                  <MaterialIcons
                    name="edit"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <Text style={[typography.bodyMd, styles.hint]}>
                    {tr.scanManual}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {formError ? (
            <Text testID="form-error" style={[typography.bodySm, styles.error]}>
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {voiceOpen ? (
            <PrimaryButton
              testID="voice-save"
              label={isEdit ? tf.saveEdit : t.common.save}
              onPress={submit}
              loading={busy}
            />
          ) : (
            <PrimaryButton
              testID="transaction-save"
              label={isEdit ? tf.saveEdit : t.common.save}
              onPress={submit}
              loading={busy}
            />
          )}
          <GhostButton
            testID="transaction-cancel"
            label={t.common.cancel}
            onPress={() => router.back()}
          />
        </View>
      </KeyboardAvoidingView>

      <DeleteConfirmSheet
        visible={confirmingDelete}
        loading={busy}
        title={t.transactions.sheet.title}
        body={t.transactions.sheet.body}
        confirmLabel={t.transactions.sheet.confirm}
        cancelLabel={t.common.cancel}
        closeLabel={t.transactions.sheet.close}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
      />
      <ScanReview
        visible={reviewVisible && reviewPrefill !== null}
        prefill={reviewPrefill}
        previewUri={reviewPreviewUri}
        categoryName={
          categories.find((category) => category.id === categoryId)?.name ??
          null
        }
        onContinue={() => setReviewVisible(false)}
        onRetake={() => {
          setReviewVisible(false);
          retakePhoto();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  close: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
  },
  body: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  kicker: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
  gap: {
    marginTop: spacing.lg,
  },
  entryCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.xl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  chipActive: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  chipLabel: {
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.accent,
  },
  scanLabel: {
    color: colors.accent,
  },
  scanActions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scanAction: {
    flex: 1,
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  note: {
    minHeight: layout.minTapTarget,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    color: colors.textPrimary,
    ...typography.bodyLg,
    textAlignVertical: 'top',
  },
  hint: {
    color: colors.textSecondary,
  },
  error: {
    marginTop: spacing.md,
    color: colors.error,
  },
  footer: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
});
