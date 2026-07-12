/**
 * Byte <-> string conversions shared by the crypto layer.
 *
 * Everything that crosses the wire is base64: PostgREST renders `bytea` as a hex
 * string (`\x0011ff`), which doubles the payload, so the RPCs `encode(..., 'base64')`
 * on the way out and `decode(..., 'base64')` on the way in. The columns stay `bytea`.
 */

const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  // String.fromCharCode(...bytes) blows the argument limit on attachment-sized
  // inputs, so feed it in chunks.
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = ""
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0")
  return hex
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
