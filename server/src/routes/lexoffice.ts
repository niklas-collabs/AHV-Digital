import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { deleteConfig, getConfig, setConfig } from '../services/config-service.js';
import {
  syncLexofficeKunden,
  testLexofficeConnection,
} from '../services/lexoffice-service.js';
import type { LexofficeStatusResponse } from '@ahv/shared';

const apiKeyBody = z.object({
  apiKey: z.string().min(20, 'API-Key zu kurz'),
});

export const lexofficeRouter = Router();

/**
 * GET /api/lexoffice/status — meldet ob ein Key gesetzt ist und wann
 * zuletzt synchronisiert wurde. Liefert NIEMALS den Key selbst.
 */
lexofficeRouter.get('/status', (_req, res, next) => {
  try {
    const db = getDb();
    const apiKey = getConfig(db, 'lexoffice_api_key');
    const lastSync = getConfig(db, 'lexoffice_last_sync');
    const body: LexofficeStatusResponse = {
      apiKeySet: !!apiKey && apiKey.length >= 20,
      lastSync: lastSync ?? null,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

lexofficeRouter.post('/api-key', (req, res, next) => {
  try {
    const body = apiKeyBody.parse(req.body);
    setConfig(getDb(), 'lexoffice_api_key', body.apiKey);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

lexofficeRouter.delete('/api-key', (_req, res, next) => {
  try {
    deleteConfig(getDb(), 'lexoffice_api_key');
    deleteConfig(getDb(), 'lexoffice_last_sync');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

lexofficeRouter.post('/test', async (_req, res, next) => {
  try {
    const result = await testLexofficeConnection(getDb());
    res.json(result);
  } catch (err) {
    next(err);
  }
});

lexofficeRouter.post('/sync', async (_req, res, next) => {
  try {
    const result = await syncLexofficeKunden(getDb());
    res.json(result);
  } catch (err) {
    next(err);
  }
});
