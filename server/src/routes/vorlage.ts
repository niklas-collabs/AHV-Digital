import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  createVorlage,
  deleteVorlage,
  getVorlage,
  listVorlagen,
  updateVorlage,
  vorlageInputSchema,
} from '../services/vorlage-service.js';

const listQuery = z.object({
  typ: z.enum(['arbeitszettel', 'angebot', 'lieferschein']).optional(),
});

export const vorlageRouter = Router();

vorlageRouter.get('/', (req, res, next) => {
  try {
    const { typ } = listQuery.parse(req.query);
    res.json(listVorlagen(getDb(), typ));
  } catch (err) {
    next(err);
  }
});

vorlageRouter.get('/:id', (req, res, next) => {
  try {
    const v = getVorlage(getDb(), req.params.id);
    if (!v) {
      res.status(404).json({ error: 'Vorlage nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(v);
  } catch (err) {
    next(err);
  }
});

vorlageRouter.post('/', (req, res, next) => {
  try {
    const input = vorlageInputSchema.parse(req.body);
    res.status(201).json(createVorlage(getDb(), input));
  } catch (err) {
    next(err);
  }
});

vorlageRouter.put('/:id', (req, res, next) => {
  try {
    const input = vorlageInputSchema.parse(req.body);
    res.json(updateVorlage(getDb(), req.params.id, input));
  } catch (err) {
    next(err);
  }
});

vorlageRouter.delete('/:id', (req, res, next) => {
  try {
    deleteVorlage(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
