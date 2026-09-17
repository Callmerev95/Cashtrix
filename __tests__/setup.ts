/**
 * Jest environment shims. Kept to native-module stand-ins and inert build-time
 * env only — the auth domain tests must stay pure, so nothing here mocks
 * application code.
 */
jest.mock(
  require.resolve('@react-native-async-storage/async-storage'),
  () => require('./mocks/async-storage'),
);

// Expo injects EXPO_PUBLIC_* at build time; Jest does not, and supabase-js
// throws on an empty key before a test can even mount.
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';


// The navigation/auth-gate tests need a signed-in session, and supabase-js
// reads it from AsyncStorage *synchronously at client construction*. Inert
// credentials cannot be resolved over the network in Jest, so the storage
// stand-in is pre-seeded once — the client then has a session before the auth
// context ever calls getSession().
const { sessionStorageSeed } = require('./mocks/async-storage');
const fs = require('fs');
const path = require('path');
const seedPath = path.join(__dirname, '.session-seed.json');
if (!fs.existsSync(seedPath)) {
  fs.writeFileSync(
    seedPath,
    JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'evelyn@cashtrix.app',
        email_confirmed_at: '2026-09-17T00:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-09-17T00:00:00Z',
        updated_at: '2026-09-17T00:00:00Z',
      },
      weak_password: null,
    }),
  );
}
sessionStorageSeed.set(
  'sb-bklriyyuglwiqczgbqgq-auth-token',
  fs.readFileSync(seedPath, 'utf8'),
);


// supabase-js resolves its stored session on a microtask that lands after the
// test's synchronous render. React warns about that update; it is timing, not
// behaviour, and the assertions await the resulting UI. Unmounting is still
// exercised (the subscription is torn down), so silence just this message.
const realConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (
    typeof first === 'string' &&
    first.includes('inside a test was not wrapped in act')
  ) {
    return;
  }
  realConsoleError(...args);
};
