import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  createStufe,
  deleteStufe,
  getStufe,
  listStufen,
  moveStufe,
  stufeInputSchema,
  updateStufe,
} from '../services/stufe-service.js';

const moveBody = z.object({ direction: z.enum(['up', 'down']) });

export const stufeRouter = Router();

stufeRouter.get('/', (_req, res, next) => {
  try {
    res.json(listStufen(getDb()));
  } catch (err) {
    next(err);
  }
});

stufeRouter.get('/:id', (req, res, next) => {
  try {
    const stufe = getStufe(getDb(), req.params.id);
    if (!stufe) {
      res.status(404).json({ error: 'Stufe nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(stufe);
  } catch (err) {
    next(err);
  }
});

stufeRouter.post('/', (req, res, next) => {
  try {
    const input = stufeInputSchema.parse(req.body);
    const created = createStufe(getDb(), input);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

stufeRouter.put('/:id', (req, res, next) => {
  try {
    const input = stufeInputSchema.parse(req.body);
    const updated = updateStufe(getDb(), req.params.id, input);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

stufeRouter.post('/:id/move', (req, res, next) => {
  try {
    const { direction } = moveBody.parse(req.body);
    const list = moveStufe(getDb(), req.params.id, direction);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

stufeRouter.delete('/:id', (req, res, next) => {
  try {
    deleteStufe(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
