/**
 * In-memory stand-in for `@react-native-async-storage/async-storage`. The real
 * module requires a native module, which does not exist under Jest; supabase-js
 * touches storage as soon as the client is constructed.
 */
const store = new Map();

/** Exposed so the Jest setup can pre-seed a session before client construction. */
const sessionStorageSeed = store;

module.exports = {
  __esModule: true,
  sessionStorageSeed,
  default: {
    getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItem: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    removeItem: jest.fn(async (key) => {
      store.delete(key);
    }),
    multiRemove: jest.fn(async (keys) => {
      keys.forEach((key) => store.delete(key));
    }),
    getAllKeys: jest.fn(async () => [...store.keys()]),
    clear: jest.fn(async () => {
      store.clear();
    }),
  },
};
