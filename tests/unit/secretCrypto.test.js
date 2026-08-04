const { encryptSecret, decryptSecret } = require('../../src/utils/secretCrypto');

describe('secretCrypto (AES-256-GCM)', () => {
  test('encrypts and decrypts back to the original plaintext', () => {
    const plaintext = 'a-super-secret-app-password';
    const stored = encryptSecret(plaintext);

    expect(stored).not.toBe(plaintext);
    expect(stored.split(':')).toHaveLength(3); // iv:authTag:ciphertext

    expect(decryptSecret(stored)).toBe(plaintext);
  });

  test('null/empty input round-trips to null without touching the key', () => {
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret('')).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  test('two encryptions of the same plaintext produce different ciphertext (random IV per call)', () => {
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-value');
    expect(decryptSecret(b)).toBe('same-value');
  });

  test('tampering with the stored value is detected and returns null, not a wrong plaintext', () => {
    const stored = encryptSecret('another-secret');
    const [iv, authTag, ciphertext] = stored.split(':');
    // Flip the last hex character of the ciphertext.
    const tamperedLastChar = ciphertext.slice(-1) === '0' ? '1' : '0';
    const tampered = [iv, authTag, `${ciphertext.slice(0, -1)}${tamperedLastChar}`].join(':');

    expect(decryptSecret(tampered)).toBeNull();
  });

  test('malformed stored value (missing parts) returns null instead of throwing', () => {
    expect(decryptSecret('not-a-valid-stored-value')).toBeNull();
  });
});
