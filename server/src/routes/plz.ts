import { Router } from 'express';
import { logger } from '../lib/logger.js';

/**
 * PLZ-Lookup über Zippopotamus (kostenlos, kein API-Key). Cached die
 * Antworten in einem in-Memory-Map — die Daten ändern sich praktisch
 * nie, und beim Restart neu aufbauen kostet nichts.
 */
const cache = new Map<string, { ort: string | null; bundesland: string | null }>();

interface ZippopotamusResponse {
  'post code'?: string;
  country?: string;
  'country abbreviation'?: string;
  places?: Array<{
    'place name'?: string;
    state?: string;
  }>;
}

async function lookupPlz(plz: string): Promise<{ ort: string | null; bundesland: string | null }> {
  const cached = cache.get(plz);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`https://api.zippopotam.us/de/${plz}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const empty = { ort: null, bundesland: null };
      cache.set(plz, empty);
      return empty;
    }
    const data = (await res.json()) as ZippopotamusResponse;
    const place = data.places?.[0];
    const result = {
      ort: place?.['place name'] ?? null,
      bundesland: place?.state ?? null,
    };
    cache.set(plz, result);
    return result;
  } catch (err) {
    logger.warn('plz.lookup_failed', {
      plz,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ort: null, bundesland: null };
  } finally {
    clearTimeout(timeout);
  }
}

export const plzRouter = Router();

plzRouter.get('/:plz', async (req, res, next) => {
  try {
    const plz = req.params.plz;
    if (!/^\d{5}$/.test(plz)) {
      res.status(400).json({ error: 'PLZ muss 5 Ziffern haben', code: 'INVALID_FORMAT' });
      return;
    }
    const result = await lookupPlz(plz);
    if (!result.ort) {
      res.status(404).json({ error: 'PLZ nicht gefunden', code: 'NOT_FOUND' });
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});
