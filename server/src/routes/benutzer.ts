import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import {
  changeBenutzerPin,
  createBenutzer,
  deleteBenutzer,
  listBenutzer,
  updateBenutzerName,
} from '../services/auth-service.js';

const PIN_REGEX = /^\d{4}$/;

const createBody = z.object({
  name: z.string().min(1).max(50),
  pin: z.string().regex(PIN_REGEX, 'PIN muss genau 4 Ziffern haben'),
});

const renameBody = z.object({
  name: z.string().min(1).max(50),
});

const changePinBody = z.object({
  oldPin: z.string().regex(PIN_REGEX),
  newPin: z.string().regex(PIN_REGEX),
});

export const benutzerRouter = Router();

/** Listet alle Benutzer (ohne PIN-Hash, nur Profil-Daten). */
benutzerRouter.get('/', (_req, res, next) => {
  try {
    res.json(listBenutzer(getDb()));
  } catch (err) {
    next(err);
  }
});

benutzerRouter.post('/', async (req, res, next) => {
  try {
    const body = createBody.parse(req.body);
    const created = await createBenutzer(getDb(), body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

benutzerRouter.put('/:id', (req, res, next) => {
  try {
    const body = renameBody.parse(req.body);
    const updated = updateBenutzerName(getDb(), req.params.id, body.name);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * PIN ändern. Nur durch den Benutzer selbst — wir prüfen, dass die
 * URL-ID mit der ID des authentifizierten Users übereinstimmt.
 */
benutzerRouter.post('/:id/change-pin', async (req, res, next) => {
  try {
    if (req.userId !== req.params.id) {
      res.status(403).json({
        error: 'PIN kann nur vom Benutzer selbst geändert werden',
        code: 'FORBIDDEN',
      });
      return;
    }
    const body = changePinBody.parse(req.body);
    await changeBenutzerPin(getDb(), req.params.id, body.oldPin, body.newPin);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

benutzerRouter.delete('/:id', (req, res, next) => {
  try {
    deleteBenutzer(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
