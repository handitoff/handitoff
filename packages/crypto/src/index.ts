export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_KEY_BITS = 256;
export const ECDH_NAMED_CURVE = "P-256";

export type EcdhKeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export type BinaryData = ArrayBuffer | ArrayBufferView<ArrayBufferLike>;

const AES_GCM_ALGORITHM = "AES-GCM";
const ECDH_ALGORITHM = "ECDH";
const SHA_256_ALGORITHM = "SHA-256";

export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  return getSubtleCrypto().generateKey(
    {
      name: ECDH_ALGORITHM,
      namedCurve: ECDH_NAMED_CURVE,
    },
    false,
    ["deriveKey"],
  ) as Promise<EcdhKeyPair>;
}

export async function exportEcdhPublicKey(publicKey: CryptoKey): Promise<JsonWebKey> {
  const jwk = await getSubtleCrypto().exportKey("jwk", publicKey);
  const { d: _privateKeyMaterial, ...publicJwk } = jwk;
  void _privateKeyMaterial;
  return publicJwk;
}

export async function importEcdhPublicKey(publicKey: JsonWebKey): Promise<CryptoKey> {
  return getSubtleCrypto().importKey(
    "jwk",
    publicKey,
    {
      name: ECDH_ALGORITHM,
      namedCurve: ECDH_NAMED_CURVE,
    },
    false,
    [],
  );
}

export async function deriveAesGcmKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return getSubtleCrypto().deriveKey(
    {
      name: ECDH_ALGORITHM,
      public: peerPublicKey,
    },
    privateKey,
    {
      name: AES_GCM_ALGORITHM,
      length: AES_GCM_KEY_BITS,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export function generateAesGcmIv(): Uint8Array {
  const iv = new Uint8Array(new ArrayBuffer(AES_GCM_IV_BYTES));
  getCrypto().getRandomValues(iv);
  return iv;
}

export async function encryptAesGcm(
  key: CryptoKey,
  plaintext: BinaryData,
  iv: BinaryData = generateAesGcmIv(),
): Promise<ArrayBuffer> {
  assertIv(iv);
  return getSubtleCrypto().encrypt(
    { name: AES_GCM_ALGORITHM, iv: toUint8Array(iv) },
    key,
    toUint8Array(plaintext),
  );
}

export async function decryptAesGcm(
  key: CryptoKey,
  ciphertext: BinaryData,
  iv: BinaryData,
): Promise<ArrayBuffer> {
  assertIv(iv);
  return getSubtleCrypto().decrypt(
    { name: AES_GCM_ALGORITHM, iv: toUint8Array(iv) },
    key,
    toUint8Array(ciphertext),
  );
}

export async function sha256(data: BinaryData): Promise<ArrayBuffer> {
  return getSubtleCrypto().digest(SHA_256_ALGORITHM, toUint8Array(data));
}

export function base64urlEncode(data: BinaryData): string {
  const bytes = toUint8Array(data);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64urlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) {
    throw new Error("Value is not base64url encoded.");
  }

  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function assertIv(iv: BinaryData): void {
  if (toUint8Array(iv).byteLength !== AES_GCM_IV_BYTES) {
    throw new Error("AES-GCM IV must be 96 bits.");
  }
}

function toUint8Array(data: BinaryData): Uint8Array<ArrayBuffer> {
  if (ArrayBuffer.isView(data)) {
    const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const copy = new Uint8Array(new ArrayBuffer(source.byteLength));
    copy.set(source);
    return copy;
  }
  return new Uint8Array(data);
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = getCrypto().subtle;
  if (subtle === undefined) {
    throw new Error("Web Crypto subtle APIs are not available.");
  }
  return subtle;
}

function getCrypto(): Crypto {
  if (globalThis.crypto === undefined) {
    throw new Error("Web Crypto APIs are not available.");
  }
  return globalThis.crypto;
}
