import { Router } from 'express';
import {
  anlageInputSchema,
  createAnlage,
  deleteAnlage,
  generateAnlageQrPng,
  getAnlage,
  listAnlagen,
  updateAnlage,
} from '../services/anlage-service.js';
import { getDb } from '../db/client.js';

export const anlageRouter = Router();

anlageRouter.get('/', (_req, res, next) => {
  try {
    res.json(listAnlagen(getDb()));
  } catch (err) {
    next(err);
  }
});

anlageRouter.get('/:id', (req, res, next) => {
  try {
    const a = getAnlage(getDb(), req.params.id);
    if (!a) {
      res.status(404).json({ error: 'Anlage nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(a);
  } catch (err) {
    next(err);
  }
});

/**
 * Liefert das QR-Code-PNG für eine Anlage. Die kodierte URL nutzt den
 * Origin aus dem Request — funktioniert auf localhost (Dev) wie auch auf
 * der Render-Domain (Prod) ohne Hardcoding.
 */
anlageRouter.get('/:id/qr.png', async (req, res, next) => {
  try {
    const anlage = getAnlage(getDb(), req.params.id);
    if (!anlage) {
      res.status(404).json({ error: 'Anlage nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    // Origin aus Header — bei Reverse-Proxy (Render) korrekt
    const proto = req.headers['x-forwarded-proto']?.toString() ?? req.protocol;
    const host = req.headers['x-forwarded-host']?.toString() ?? req.get('host') ?? 'localhost';
    const baseUrl = `${proto}://${host}`;

    const buffer = await generateAnlageQrPng(req.params.id, baseUrl);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="anlage-${anlage.anlage.slice(0, 30).replace(/\s+/g, '_')}.png"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

anlageRouter.post('/', (req, res, next) => {
  try {
    const input = anlageInputSchema.parse(req.body);
    res.status(201).json(createAnlage(getDb(), input));
  } catch (err) {
    next(err);
  }
});

anlageRouter.put('/:id', (req, res, next) => {
  try {
    const input = anlageInputSchema.parse(req.body);
    res.json(updateAnlage(getDb(), req.params.id, input));
  } catch (err) {
    next(err);
  }
});

anlageRouter.delete('/:id', (req, res, next) => {
  try {
    deleteAnlage(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
