import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  deleteConfig,
  getAllConfig,
  isConfigKey,
  setConfig,
} from '../services/config-service.js';
import type { ConfigKey } from '@ahv/shared';

const putBody = z.object({
  key: z.string().refine(isConfigKey, 'Unbekannter Config-Key'),
  value: z.unknown(),
});

export const configRouter = Router();

configRouter.get('/', (_req, res, next) => {
  try {
    const all = getAllConfig(getDb());
    res.json(all);
  } catch (err) {
    next(err);
  }
});

configRouter.put('/', (req, res, next) => {
  try {
    const body = putBody.parse(req.body);
    // setConfig validiert intern mit dem passenden Schema je Key.
    const value = setConfig(getDb(), body.key as ConfigKey, body.value);
    res.json({ key: body.key, value });
  } catch (err) {
    next(err);
  }
});

configRouter.delete('/:key', (req, res, next) => {
  try {
    const key = req.params.key;
    if (!isConfigKey(key)) {
      res.status(400).json({ error: 'Unbekannter Config-Key', code: 'INVALID_KEY' });
      return;
    }
    deleteConfig(getDb(), key);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
