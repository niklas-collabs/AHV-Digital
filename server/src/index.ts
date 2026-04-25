import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { HealthResponse } from '@ahv/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const isDev = process.env.NODE_ENV !== 'production';

app.use(express.json({ limit: '10mb' }));

if (isDev) {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

// API-Routen
app.get('/api/health', (_req, res) => {
  const body: HealthResponse = {
    ok: true,
    service: 'ahv-digital',
    version: '0.1.0',
  };
  res.json(body);
});

// In Production: gebauten Client servieren + SPA-Fallback.
if (!isDev) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    console.warn(`[ahv-digital] client/dist nicht gefunden unter ${clientDist}`);
  }
}

app.listen(PORT, () => {
  const mode = isDev ? 'dev' : 'prod';
  console.log(`[ahv-digital] Server läuft auf http://localhost:${PORT} (${mode})`);
});
