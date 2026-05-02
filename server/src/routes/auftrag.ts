import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  abschickenAuftrag,
  auftragInputSchema,
  createAuftrag,
  deleteAuftrag,
  getAuftrag,
  listAuftraege,
  updateAuftrag,
} from '../services/auftrag-service.js';

const listQuery = z.object({
  status: z.enum(['entwurf', 'abgeschickt']).optional(),
  kunde_id: z.string().optional(),
  q: z.string().optional(),
});

// /abschicken Body: SPEC sieht { sendKunde, sendFotos } vor — die werden
// in 2.2 (Gmail-Versand) zur E-Mail-Generation genutzt. In 1.7 nur ignoriert,
// aber das Schema akzeptiert sie damit der Client schon den Endpunkt korrekt
// aufrufen kann.
const abschickenBody = z
  .object({
    sendKunde: z.boolean().optional(),
    sendFotos: z.boolean().optional(),
  })
  .optional();

export const auftragRouter = Router();

auftragRouter.get('/', (req, res, next) => {
  try {
    const params = listQuery.parse(req.query);
    res.json(listAuftraege(getDb(), { ...params, query: params.q }));
  } catch (err) {
    next(err);
  }
});

auftragRouter.get('/:id', (req, res, next) => {
  try {
    const a = getAuftrag(getDb(), req.params.id);
    if (!a) {
      res.status(404).json({ error: 'Auftrag nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(a);
  } catch (err) {
    next(err);
  }
});

auftragRouter.post('/', (req, res, next) => {
  try {
    const input = auftragInputSchema.parse(req.body);
    res.status(201).json(createAuftrag(getDb(), input));
  } catch (err) {
    next(err);
  }
});

auftragRouter.put('/:id', (req, res, next) => {
  try {
    const input = auftragInputSchema.parse(req.body);
    res.json(updateAuftrag(getDb(), req.params.id, input));
  } catch (err) {
    next(err);
  }
});

auftragRouter.post('/:id/abschicken', (req, res, next) => {
  try {
    abschickenBody.parse(req.body);
    res.json(abschickenAuftrag(getDb(), req.params.id));
  } catch (err) {
    next(err);
  }
});

auftragRouter.delete('/:id', (req, res, next) => {
  try {
    deleteAuftrag(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
