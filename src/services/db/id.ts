// Uses the global Web Crypto API (crypto.randomUUID), available natively on
// Hermes/React Native 0.76+ and in Node/Jest — no native module dependency,
// unlike expo-crypto, which returns undefined under jest-expo's auto-mock
// with no error (a silent-failure trap: NOT NULL columns quietly accepted
// undefined ids in some repository calls until a test caught it).
export function newId(): string {
  return crypto.randomUUID()
}
