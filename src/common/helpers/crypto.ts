import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();
const password = process.env.crypt_password;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}

function password_derive_bytes(password, salt, iterations, len) {
  let key = Buffer.from(password + salt);
  for (let i = 0; i < iterations; i++) {
    key = sha256(key);
  }
  if (key.length < len) {
    const hx = password_derive_bytes(password, salt, iterations - 1, 20);
    for (let counter = 1; key.length < len; ++counter) {
      key = Buffer.concat([
        key,
        sha256(Buffer.concat([Buffer.from(counter.toString()), hx])),
      ]);
    }
  }
  return Buffer.alloc(len, key);
}

export async function encode(str: string) {
  const key = password_derive_bytes(password, '', 100, 32);
  // Har safar tasodifiy IV — bir xil matn har xil ciphertext beradi
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  // IV ni ciphertext oldiga qo'shamiz: base64(iv + ciphertext)
  return Buffer.concat([iv, encrypted]).toString('base64');
}

export async function decode(str: string) {
  const key = password_derive_bytes(password, '', 100, 32);
  const data = Buffer.from(str, 'base64');
  const iv = data.subarray(0, 16);
  const encrypted = data.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
export const dates = {
  compare: function (a: Date | number, b: Date | number) {
    const oneDate = a.valueOf();
    const twoDate = b.valueOf();
    return oneDate - twoDate > 0;
  },
};
