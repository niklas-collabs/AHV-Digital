import { Router } from 'express';
import { getDb } from '../db/client.js';
import { getMailReadiness, sendTestMail } from '../services/mail-service.js';

export const mailRouter = Router();

mailRouter.get('/status', (_req, res, next) => {
  try {
    res.json(getMailReadiness(getDb()));
  } catch (err) {
    next(err);
  }
});

mailRouter.post('/test', async (_req, res, next) => {
  try {
    const result = await sendTestMail(getDb());
    res.json({ ok: true, to: result.to });
  } catch (err) {
    next(err);
  }
});
