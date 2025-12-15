// apps/api/src/utils/crypto.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const ROUNDS = 10;

export function hash(plain: string) {
  return bcrypt.hashSync(plain, ROUNDS);
}

export function compare(plain: string, hashed: string) {
  return bcrypt.compareSync(plain, hashed);
}

export function signJwt(payload: object, expiresIn = '7d') {
  const secret = process.env.JWT_SECRET || 'change-me';
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyJwt<T = any>(token: string): T {
  const secret = process.env.JWT_SECRET || 'change-me';
  return jwt.verify(token, secret) as T;
}
