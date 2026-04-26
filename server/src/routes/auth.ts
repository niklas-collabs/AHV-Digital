import { Router, type Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { getAuthStatus, login, setupPin } from '../services/auth-service.js';
import { COOKIE_NAME } from '../middleware/auth.js';

const PIN_REGEX = /^\d{4}$/;
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const loginBody = z.object({
  pin: z.string().regex(PIN_REGEX, 'PIN muss genau 4 Ziffern haben'),
});

const setupBody = z.object({
  pin: z.string().regex(PIN_REGEX, 'PIN muss genau 4 Ziffern haben'),
  oldPin: z.string().regex(PIN_REGEX).optional(),
});

function setAuthCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE_MS,
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export const authRouter = Router();

authRouter.get('/status', async (req, res, next) => {
  try {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[COOKIE_NAME];
    const status = await getAuthStatus(getDb(), token);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginBody.parse(req.body);
    const result = await login(getDb(), body.pin);
    setAuthCookie(res, result.token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/setup', async (req, res, next) => {
  try {
    const body = setupBody.parse(req.body);
    const result = await setupPin(getDb(), body);
    setAuthCookie(res, result.token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});
