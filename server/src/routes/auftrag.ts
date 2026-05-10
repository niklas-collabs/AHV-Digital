import { Router } from 'express';
import { z } from 'zod';
import { getDb, resolveUploadsDir } from '../db/client.js';
import {
  abschickenAuftrag,
  addFotoToAuftrag,
  auftragInputSchema,
  createAuftrag,
  deleteAuftrag,
  duplicateAuftrag,
  getAuftrag,
  listAuftraege,
  removeFotoFromAuftrag,
  updateAuftrag,
} from '../services/auftrag-service.js';
import { getConfig } from '../services/config-service.js';
import { readLogo } from '../services/logo-service.js';
import { sendAuftragMail } from '../services/mail-service.js';
import {
  deleteFotoFile,
  fotoUploadMiddleware,
  readFoto,
  saveFoto,
} from '../services/foto-service.js';
import { generateAuftragPdf } from '../lib/pdf-generator.js';

const listQuery = z.object({
  status: z.enum(['entwurf', 'abgeschickt']).optional(),
  kunde_id: z.string().optional(),
  q: z.string().optional(),
});

// /abschicken Body: { sendKunde, sendFotos }. Wenn beide false (oder Body
// leer), wird der Auftrag nur als abgeschickt markiert ohne Mail. Mit
// sendKunde=true geht eine Mail an Firma + Kunde.
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

auftragRouter.post('/:id/abschicken', async (req, res, next) => {
  try {
    const body = abschickenBody.parse(req.body) ?? {};
    const id = req.params.id as string;
    const db = getDb();
    const auftrag = getAuftrag(db, id);
    if (!auftrag) {
      res.status(404).json({ error: 'Auftrag nicht gefunden', code: 'NOT_FOUND' });
      return;
    }

    // Mail-Versand erst, dann Status-Update — wenn Mail fehlschlägt, bleibt
    // der Auftrag Entwurf und der User sieht den Fehler.
    let mailResult: { recipients: string[]; fotosAttached: number } | null = null;
    if (body.sendKunde) {
      const result = await sendAuftragMail(db, auftrag, {
        sendKunde: true,
        sendFotos: body.sendFotos ?? false,
      });
      mailResult = { recipients: result.recipients, fotosAttached: result.fotosAttached };
    }

    const updated = abschickenAuftrag(db, id);
    res.json({ ...updated, ...(mailResult ? { _mailResult: mailResult } : {}) });
  } catch (err) {
    next(err);
  }
});

auftragRouter.get('/:id/pdf', async (req, res, next) => {
  try {
    const db = getDb();
    const auftrag = getAuftrag(db, req.params.id);
    if (!auftrag) {
      res.status(404).json({ error: 'Auftrag nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    const firma = getConfig(db, 'firma');
    const logo = readLogo(db, resolveUploadsDir());
    const buffer = await generateAuftragPdf({ auftrag, firma, logo });

    const safeTitle = (auftrag.titel || auftrag.id.slice(0, 8))
      .replace(/[^a-zA-Z0-9-_äöüÄÖÜ ]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);
    const filename = `${auftrag.typ}_${safeTitle}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
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

// === Pipeline-Konvertierung (Phase 2.8) ===

const duplicateBody = z
  .object({
    typ: z.enum(['arbeitszettel', 'angebot', 'lieferschein']).optional(),
  })
  .optional();

// Erzeugt eine Kopie. Body { typ } optional — wenn gesetzt wird der Typ
// gewechselt (Konvertierung Angebot -> Arbeitszettel etc.); ohne typ
// reine Duplikat-Funktion.
auftragRouter.post('/:id/duplicate', (req, res, next) => {
  try {
    const body = duplicateBody.parse(req.body) ?? {};
    const created = duplicateAuftrag(getDb(), req.params.id, body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// === Fotos (Phase 2.3) ===

auftragRouter.post('/:id/fotos', fotoUploadMiddleware, async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Keine Datei hochgeladen', code: 'NO_FILE' });
      return;
    }
    const id = req.params.id as string;
    const db = getDb();
    // Auftrag muss existieren — saveFoto würde sonst Foto verwaisen
    const auftrag = getAuftrag(db, id);
    if (!auftrag) {
      res.status(404).json({ error: 'Auftrag nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    const filename = await saveFoto(resolveUploadsDir(), id, req.file.buffer);
    try {
      const updated = addFotoToAuftrag(db, id, filename);
      res.status(201).json(updated);
    } catch (err) {
      // Falls add fehlschlägt (z.B. TOO_MANY_FOTOS): Datei wieder entfernen
      deleteFotoFile(resolveUploadsDir(), id, filename);
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

auftragRouter.get('/:id/fotos/:filename', (req, res, next) => {
  try {
    const { id, filename } = req.params as { id: string; filename: string };
    const buffer = readFoto(resolveUploadsDir(), id, filename);
    if (!buffer) {
      res.status(404).json({ error: 'Foto nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

auftragRouter.delete('/:id/fotos/:filename', (req, res, next) => {
  try {
    const { id, filename } = req.params as { id: string; filename: string };
    const result = removeFotoFromAuftrag(getDb(), id, filename);
    if (result.wasInList) {
      deleteFotoFile(resolveUploadsDir(), id, filename);
    }
    res.json(result.auftrag);
  } catch (err) {
    next(err);
  }
});
