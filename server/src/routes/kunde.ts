import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  createKunde,
  deleteKunde,
  getKunde,
  kundeInputSchema,
  listKunden,
  updateKunde,
} from '../services/kunde-service.js';
import { createKundeInLexoffice } from '../services/lexoffice-service.js';
import { logger } from '../lib/logger.js';

const listQuery = z.object({
  q: z.string().optional(),
});

const createQuery = z.object({
  syncToLexoffice: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const kundeRouter = Router();

kundeRouter.get('/', (req, res, next) => {
  try {
    const { q } = listQuery.parse(req.query);
    res.json(listKunden(getDb(), { query: q }));
  } catch (err) {
    next(err);
  }
});

kundeRouter.get('/:id', (req, res, next) => {
  try {
    const k = getKunde(getDb(), req.params.id);
    if (!k) {
      res.status(404).json({ error: 'Kunde nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(k);
  } catch (err) {
    next(err);
  }
});

kundeRouter.post('/', async (req, res, next) => {
  try {
    const input = kundeInputSchema.parse(req.body);
    const { syncToLexoffice } = createQuery.parse(req.query);
    const db = getDb();

    const created = createKunde(db, input);

    if (syncToLexoffice) {
      try {
        const lexofficeId = await createKundeInLexoffice(db, input);
        db.prepare('UPDATE kunde SET lexoffice_id = ? WHERE id = ?').run(
          lexofficeId,
          created.id,
        );
        const refreshed = getKunde(db, created.id);
        if (refreshed) {
          res.status(201).json(refreshed);
          return;
        }
      } catch (err) {
        // Lokal-Anlegen war erfolgreich, Lexoffice scheiterte — Kunde
        // bleibt lokal, Frontend bekommt Warning-Feld.
        logger.warn('lexoffice.create_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        res.status(201).json({
          ...created,
          _lexofficeWarning:
            err instanceof Error ? err.message : 'Sync nach Lexoffice fehlgeschlagen',
        });
        return;
      }
    }

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

kundeRouter.put('/:id', (req, res, next) => {
  try {
    const input = kundeInputSchema.parse(req.body);
    res.json(updateKunde(getDb(), req.params.id, input));
  } catch (err) {
    next(err);
  }
});

kundeRouter.delete('/:id', (req, res, next) => {
  try {
    deleteKunde(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
