import crypto from 'crypto';

function getKeyBuffer(key) {
  return crypto.createHash('sha256').update(String(key ?? '')).digest();
}

function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKeyBuffer(key), iv);
  let encrypted = cipher.update(String(text ?? ''), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText, key) {
  const parts = String(encryptedText ?? '').split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted payload');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKeyBuffer(key), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export { encrypt, decrypt };