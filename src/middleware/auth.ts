import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthPayload {
  sub: string; // admin username
  role: 'admin';
}

export function signAdminToken(username: string): string {
  const payload: AuthPayload = { sub: username, role: 'admin' };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
}

// Express middleware: require a valid admin Bearer token.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    (req as any).admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
