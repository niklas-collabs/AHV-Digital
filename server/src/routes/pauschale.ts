import { Router } from 'express';
import { getDb } from '../db/client.js';
import {
  createPauschale,
  deletePauschale,
  getPauschale,
  listPauschalen,
  pauschaleInputSchema,
  updatePauschale,
} from '../services/pauschale-service.js';

export const pauschaleRouter = Router();

pauschaleRouter.get('/', (_req, res, next) => {
  try {
    res.json(listPauschalen(getDb()));
  } catch (err) {
    next(err);
  }
});

pauschaleRouter.get('/:id', (req, res, next) => {
  try {
    const item = getPauschale(getDb(), req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Pauschale nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(item);
  } catch (err) {
    next(err);
  }
});

pauschaleRouter.post('/', (req, res, next) => {
  try {
    const input = pauschaleInputSchema.parse(req.body);
    const created = createPauschale(getDb(), input);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

pauschaleRouter.put('/:id', (req, res, next) => {
  try {
    const input = pauschaleInputSchema.parse(req.body);
    const updated = updatePauschale(getDb(), req.params.id, input);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

pauschaleRouter.delete('/:id', (req, res, next) => {
  try {
    deletePauschale(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
