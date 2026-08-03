/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import * as CryptoJS from 'crypto-js';

export function encryptValue({
  value,
  key = process.env.ENCRYPTION_KEY,
}: {
  value: string;
  key?: string;
}): string {
  return CryptoJS.AES.encrypt(value, key!).toString();
}

export function decryptValue({
  cipherText,
  key = process.env.ENCRYPTION_KEY,
}: {
  cipherText: string;
  key?: string;
}): string {
  const bytes = CryptoJS.AES.decrypt(cipherText, key!);
  const text = bytes.toString(CryptoJS.enc.Utf8);
  return text;
}
