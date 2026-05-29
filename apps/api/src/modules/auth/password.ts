import bcrypt from "bcrypt";

export async function hashPassword(plain: string, rounds: number) {
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
