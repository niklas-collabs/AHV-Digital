import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { listLog } from '../services/log-service.js';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const logRouter = Router();

/**
 * Liefert die letzten Log-Einträge in absteigender Reihenfolge.
 * Default-Limit: 100. SPEC 3.8.
 */
logRouter.get('/', (req, res, next) => {
  try {
    const { limit } = listQuery.parse(req.query);
    res.json(listLog(getDb(), limit ?? 100));
  } catch (err) {
    next(err);
  }
});
