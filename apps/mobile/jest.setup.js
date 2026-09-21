/**
 * Jest setup for the Expo app.
 *
 * These modules are native, so importing them under Jest throws rather than returning a stub.
 * Anything that reaches the Supabase client or the device identifier transitively imports them,
 * which would otherwise make pure logic beside that code untestable.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

// Importing the real module registers a device-push listener and warns about Expo Go, which is
// noise in a suite that only exercises the pure helpers beside it.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
}));

jest.mock('expo-crypto', () => {
  let counter = 0;
  return {
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`),
  };
});
