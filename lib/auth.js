import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 10;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function validatePassword(password) {
  const value = String(password || "");
  const failures = [];

  if (value.length < MIN_PASSWORD_LENGTH) {
    failures.push(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
  }

  if (value.length > MAX_PASSWORD_LENGTH) {
    failures.push(`비밀번호는 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.`);
  }

  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    failures.push("비밀번호에는 영문자와 숫자가 모두 포함되어야 합니다.");
  }

  return failures;
}

export async function hashPassword(password) {
  const value = String(password || "");
  const salt = randomBytes(16);
  const hash = await scrypt(value, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  });

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    Buffer.from(hash).toString("base64url")
  ].join("$");
}

export async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, n, r, p, saltValue, hashValue] = parts;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(String(password || ""), Buffer.from(saltValue, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  });

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function createCsrfToken() {
  return randomBytes(24).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(String(token || ""), "utf8").digest("base64url");
}

export function hashClientAddress(value) {
  return createHash("sha256").update(String(value || "unknown"), "utf8").digest("base64url");
}
