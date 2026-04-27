export const DEFAULT_PUBLIC_CODE_LENGTH = 6;
export const PUBLIC_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PUBLIC_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6,12}$/;

export type PublicCodeOptions = {
  length?: number;
  alphabet?: string;
  randomBytes?: (length: number) => Uint8Array;
};

export function generatePublicCode(options: PublicCodeOptions = {}): string {
  const length = options.length ?? DEFAULT_PUBLIC_CODE_LENGTH;
  const alphabet = options.alphabet ?? PUBLIC_CODE_ALPHABET;

  if (!Number.isInteger(length) || length < 6 || length > 12) {
    throw new RangeError("Public code length must be an integer between 6 and 12.");
  }

  if (alphabet.length < 2 || alphabet.length > 256) {
    throw new RangeError("Public code alphabet must contain between 2 and 256 characters.");
  }

  const randomBytes = options.randomBytes ?? getSecureRandomBytes;
  const maxUsableByte = Math.floor(256 / alphabet.length) * alphabet.length;
  let code = "";

  while (code.length < length) {
    const bytes = randomBytes(length);

    for (const byte of bytes) {
      if (byte >= maxUsableByte) {
        continue;
      }

      code += alphabet[byte % alphabet.length];

      if (code.length === length) {
        break;
      }
    }
  }

  return code;
}

export function isPublicCode(value: string): boolean {
  return PUBLIC_CODE_PATTERN.test(value);
}

function getSecureRandomBytes(length: number): Uint8Array {
  const crypto = globalThis.crypto;

  if (crypto === undefined) {
    throw new Error("Secure random number generation is unavailable.");
  }

  return crypto.getRandomValues(new Uint8Array(length));
}
