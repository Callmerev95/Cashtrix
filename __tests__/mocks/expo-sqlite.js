/**
 * OB1 (#74): expo-sqlite is a native module whose bridge is absent in Jest.
 * The default stand-in makes opening the outbox database throw, so the app
 * exercises its fail-open path (queue unavailable, every online flow intact).
 * Outbox tests inject their own in-memory adapter through
 * `setOutboxDatabaseForTests` and never touch this file.
 */
module.exports = {
  openDatabaseAsync: async () => {
    throw new Error('expo-sqlite native module unavailable in Jest');
  },
};
