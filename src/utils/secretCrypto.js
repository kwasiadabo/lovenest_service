const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// A 32-byte key, hex-encoded (64 hex chars) — generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Losing/rotating this key makes every previously-encrypted value
// undecryptable, so treat it like any other production secret.
function getKey() {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured');
  const buffer = Buffer.from(key, 'hex');
  if (buffer.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return buffer;
}

// Stored as iv:authTag:ciphertext (all hex), one column, so no schema
// changes are needed if the encoding details ever change.
function encryptSecret(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptSecret(stored) {
  if (!stored) return null;
  const [ivHex, authTagHex, dataHex] = stored.split(':');
  if (!ivHex || !authTagHex || !dataHex) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // Wrong/rotated key, or corrupted value — treat as "not configured"
    // rather than crashing the send that triggered this lookup.
    return null;
  }
}

module.exports = { encryptSecret, decryptSecret };
