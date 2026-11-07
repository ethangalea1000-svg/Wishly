// No credential migration or iteration downgrade. Use the stored parameters exactly.
export class PasswordVerificationUnavailableError extends Error {
  constructor() { super("Password verification is temporarily unavailable"); this.name = "PasswordVerificationUnavailableError"; }
}
export interface StoredPassword {
  password_salt: string;
  password_hash: string;
  password_iterations: number;
}
export type PasswordDeriver = (password: string, salt: string, iterations: number) => Promise<string>;
export async function verifyStoredPassword(password: string, stored: StoredPassword, derive: PasswordDeriver): Promise<boolean> {
  const count = stored.password_iterations;
  // Bound imported/corrupt parameters before invoking expensive cryptography.
  if (!Number.isSafeInteger(count) || count < 1 || count > 600000 ||
      !/^[a-f0-9]{32}$/i.test(stored.password_salt) || !/^[a-f0-9]{64}$/i.test(stored.password_hash)) {
    throw new PasswordVerificationUnavailableError();
  }
  let calculated: string;
  try { calculated = await derive(password, stored.password_salt, count); }
  catch (error) {
    if (error instanceof Error && error.name === "NotSupportedError") throw new PasswordVerificationUnavailableError();
    throw error;
  }
  // Fixed length XOR comparison, no early exit on differing characters.
  if (!/^[a-f0-9]{64}$/i.test(calculated)) throw new PasswordVerificationUnavailableError();
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= calculated.charCodeAt(i) ^ stored.password_hash.toLowerCase().charCodeAt(i);
  return difference === 0;
}
