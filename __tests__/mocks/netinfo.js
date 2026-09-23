/**
 * NetInfo stand-in — always online. The native module cannot load in Jest;
 * the connectivity tests (`connectivity.test.tsx`) inject their own
 * listener-capturing mock and never touch this file.
 */
const listeners = new Set();

const online = { isConnected: true, isInternetReachable: true };

module.exports = {
  __esModule: true,
  default: {
    addEventListener: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fetch: () => Promise.resolve(online),
  },
  // Test seam: emit a reading to every subscriber (unused by default).
  __emit: (reading) => {
    for (const listener of listeners) listener(reading);
  },
};
