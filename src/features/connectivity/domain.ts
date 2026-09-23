/**
 * Connectivity domain (D4) — pure helpers only.
 *
 * Online is the default: `isConnected`/`isInternetReachable` start as `null`
 * before NetInfo's first event, and a null reading must never flash the
 * offline banner on a healthy connection.
 */
export type ConnectivityReading = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

export function toOnlineStatus(reading: ConnectivityReading): boolean {
  return (
    (reading.isConnected ?? true) && (reading.isInternetReachable ?? true)
  );
}

/** Banner copy (id-ID). Short by owner request — no "stale data" tail. */
export const OFFLINE_MESSAGE = 'Tidak ada koneksi';
