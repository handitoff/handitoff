import { describe, expect, it } from "vitest";

import {
  AES_GCM_IV_BYTES,
  base64urlDecode,
  base64urlEncode,
  decryptAesGcm,
  deriveAesGcmKey,
  encryptAesGcm,
  exportEcdhPublicKey,
  generateAesGcmIv,
  generateEcdhKeyPair,
  importEcdhPublicKey,
  sha256,
} from "./index.js";

describe("@handitoff/crypto", () => {
  it("generates ECDH P-256 keys and exports public key material only", async () => {
    const pair = await generateEcdhKeyPair();
    const publicKey = await exportEcdhPublicKey(pair.publicKey);

    expect(publicKey).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(publicKey.x).toEqual(expect.any(String));
    expect(publicKey.y).toEqual(expect.any(String));
    expect(publicKey.d).toBeUndefined();
  });

  it("imports peer public keys and derives matching AES-GCM keys", async () => {
    const alice = await generateEcdhKeyPair();
    const bob = await generateEcdhKeyPair();
    const alicePublic = await importEcdhPublicKey(await exportEcdhPublicKey(alice.publicKey));
    const bobPublic = await importEcdhPublicKey(await exportEcdhPublicKey(bob.publicKey));

    const aliceKey = await deriveAesGcmKey(alice.privateKey, bobPublic);
    const bobKey = await deriveAesGcmKey(bob.privateKey, alicePublic);
    const iv = generateAesGcmIv();
    const plaintext = new TextEncoder().encode("secure hello");
    const ciphertext = await encryptAesGcm(aliceKey, plaintext, iv);

    await expect(decryptAesGcm(bobKey, ciphertext, iv)).resolves.toEqual(
      plaintext.buffer as ArrayBuffer,
    );
  });

  it("rejects failed decrypts", async () => {
    const alice = await generateEcdhKeyPair();
    const bob = await generateEcdhKeyPair();
    const charlie = await generateEcdhKeyPair();
    const aliceKey = await deriveAesGcmKey(
      alice.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(bob.publicKey)),
    );
    const wrongKey = await deriveAesGcmKey(
      charlie.privateKey,
      await importEcdhPublicKey(await exportEcdhPublicKey(alice.publicKey)),
    );
    const iv = generateAesGcmIv();
    const ciphertext = await encryptAesGcm(aliceKey, new TextEncoder().encode("secret"), iv);

    await expect(decryptAesGcm(wrongKey, ciphertext, iv)).rejects.toThrow();
  });

  it("uses 96-bit IVs and base64url round trips binary data", () => {
    const iv = generateAesGcmIv();
    const encoded = base64urlEncode(iv);

    expect(iv).toHaveLength(AES_GCM_IV_BYTES);
    expect(encoded).not.toMatch(/[+/=]/u);
    expect(base64urlDecode(encoded)).toEqual(iv);
  });

  it("hashes with SHA-256", async () => {
    const digest = await sha256(new TextEncoder().encode("abc"));

    expect(base64urlEncode(digest)).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });
});
