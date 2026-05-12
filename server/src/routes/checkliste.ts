import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  checklisteInputSchema,
  createCheckliste,
  deleteCheckliste,
  getCheckliste,
  listChecklisten,
  updateCheckliste,
} from '../services/checkliste-service.js';

const listQuery = z.object({
  typ: z.enum(['wartung', 'arbeitszettel', 'angebot']).optional(),
});

export const checklisteRouter = Router();

checklisteRouter.get('/', (req, res, next) => {
  try {
    const { typ } = listQuery.parse(req.query);
    res.json(listChecklisten(getDb(), typ));
  } catch (err) {
    next(err);
  }
});

checklisteRouter.get('/:id', (req, res, next) => {
  try {
    const c = getCheckliste(getDb(), req.params.id);
    if (!c) {
      res.status(404).json({ error: 'Checkliste nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(c);
  } catch (err) {
    next(err);
  }
});

checklisteRouter.post('/', (req, res, next) => {
  try {
    const input = checklisteInputSchema.parse(req.body);
    res.status(201).json(createCheckliste(getDb(), input));
  } catch (err) {
    next(err);
  }
});

checklisteRouter.put('/:id', (req, res, next) => {
  try {
    const input = checklisteInputSchema.parse(req.body);
    res.json(updateCheckliste(getDb(), req.params.id, input));
  } catch (err) {
    next(err);
  }
});

checklisteRouter.delete('/:id', (req, res, next) => {
  try {
    deleteCheckliste(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
