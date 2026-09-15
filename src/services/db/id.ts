// RN's Hermes does not expose crypto.randomUUID (confirmed missing at
// runtime despite some docs suggesting RN 0.76+ support), and expo-crypto
// returns undefined under jest-expo's auto-mock with no error (a
// silent-failure trap: NOT NULL columns quietly accepted undefined ids in
// some repository calls until a test caught it). These ids are local
// SQLite primary keys, not security tokens, so a Math.random-based v4 UUID
// is an appropriate tradeoff — no native module, identical behavior in
// Hermes and Jest/Node.
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
