import { Router } from 'express';
import { getDb, resolveUploadsDir } from '../db/client.js';
import { logoUploadMiddleware, readLogo, removeLogo, saveLogo } from '../services/logo-service.js';

export const logoRouter = Router();

logoRouter.get('/', (_req, res, next) => {
  try {
    const logo = readLogo(getDb(), resolveUploadsDir());
    if (!logo) {
      res.status(404).json({ error: 'Kein Logo gesetzt', code: 'NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', logo.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(logo.buffer);
  } catch (err) {
    next(err);
  }
});

logoRouter.post('/', logoUploadMiddleware, (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Keine Datei hochgeladen', code: 'NO_FILE' });
      return;
    }
    const config = saveLogo(getDb(), req.file.buffer, req.file.mimetype, resolveUploadsDir());
    res.json(config);
  } catch (err) {
    next(err);
  }
});

logoRouter.delete('/', (_req, res, next) => {
  try {
    removeLogo(getDb(), resolveUploadsDir());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
