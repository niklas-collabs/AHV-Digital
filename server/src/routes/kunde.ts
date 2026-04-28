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

const listQuery = z.object({
  q: z.string().optional(),
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

kundeRouter.post('/', (req, res, next) => {
  try {
    const input = kundeInputSchema.parse(req.body);
    res.status(201).json(createKunde(getDb(), input));
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
