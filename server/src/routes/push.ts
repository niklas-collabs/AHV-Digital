import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  getOrGenerateVapidKeys,
  listSubscriptions,
  subscribeInputSchema,
  subscribePush,
  unsubscribePush,
} from '../services/push-service.js';

export const pushRouter = Router();

pushRouter.get('/vapid-public-key', (_req, res, next) => {
  try {
    const keys = getOrGenerateVapidKeys(getDb());
    res.json({ publicKey: keys.publicKey });
  } catch (err) {
    next(err);
  }
});

pushRouter.get('/status', (_req, res, next) => {
  try {
    const subs = listSubscriptions(getDb());
    res.json({ count: subs.length });
  } catch (err) {
    next(err);
  }
});

pushRouter.post('/subscribe', (req, res, next) => {
  try {
    const input = subscribeInputSchema.parse(req.body);
    const result = subscribePush(getDb(), input);
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
});

const unsubscribeBody = z.object({
  endpoint: z.string().url(),
});

pushRouter.post('/unsubscribe', (req, res, next) => {
  try {
    const { endpoint } = unsubscribeBody.parse(req.body);
    const removed = unsubscribePush(getDb(), endpoint);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
});
