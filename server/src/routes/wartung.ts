import { Router } from 'express';
import { getDb } from '../db/client.js';
import {
  createWartungsplan,
  deleteWartungsplan,
  erledigtInputSchema,
  getWartungsplan,
  listHistorie,
  listWartungsplaene,
  linkHistorieToAuftrag,
  markErledigt,
  updateWartungsplan,
  wartungsplanInputSchema,
} from '../services/wartungsplan-service.js';
import { createAuftrag } from '../services/auftrag-service.js';

export const wartungRouter = Router();

wartungRouter.get('/', (_req, res, next) => {
  try {
    res.json(listWartungsplaene(getDb()));
  } catch (err) {
    next(err);
  }
});

wartungRouter.get('/:id', (req, res, next) => {
  try {
    const plan = getWartungsplan(getDb(), req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'Wartungsplan nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

wartungRouter.get('/:id/historie', (req, res, next) => {
  try {
    res.json(listHistorie(getDb(), req.params.id));
  } catch (err) {
    next(err);
  }
});

wartungRouter.post('/', (req, res, next) => {
  try {
    const input = wartungsplanInputSchema.parse(req.body);
    res.status(201).json(createWartungsplan(getDb(), input));
  } catch (err) {
    next(err);
  }
});

wartungRouter.put('/:id', (req, res, next) => {
  try {
    const input = wartungsplanInputSchema.parse(req.body);
    res.json(updateWartungsplan(getDb(), req.params.id, input));
  } catch (err) {
    next(err);
  }
});

wartungRouter.delete('/:id', (req, res, next) => {
  try {
    deleteWartungsplan(getDb(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Erledigt-Flow:
 *  - markErledigt setzt letzte_wartung, berechnet naechste_wartung
 *  - body.createAuftrag (optional): legt einen Arbeitszettel-Entwurf an,
 *    vorausgefüllt mit Kunde/Anlage, und verknüpft ihn mit der Historie
 */
wartungRouter.post('/:id/erledigt', (req, res, next) => {
  try {
    const db = getDb();
    const input = erledigtInputSchema.parse(req.body);
    const createAuftragFlag = req.body?.createAuftrag === true;
    const result = markErledigt(db, req.params.id, input);

    if (createAuftragFlag) {
      const auftrag = createAuftrag(db, {
        typ: 'arbeitszettel',
        titel: `Wartung: ${result.plan.anlage}`,
        datum: input.durchgefuehrt_am,
        beschreibung: input.notiz ?? '',
        notiz_intern: '',
        kunde_id: result.plan.kunde_id,
        objekt_adresse: result.plan.standort ?? null,
        mitarbeiter: [],
        materialien: [],
        fotos: [],
        signature_data_url: null,
        teilleistungen: [],
      });
      linkHistorieToAuftrag(db, result.historie.id, auftrag.id);
      res.json({ ...result, auftrag });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});
