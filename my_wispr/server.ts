import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  isAuthorizedApiKey,
  normalizeAudioMimeType,
  parseTranscribeRequestFields,
} from './server/openwhisprPipeline.ts';
import {
  TranscriptionServiceError,
  getBackendHealthStatus,
  readBackendConfig,
  runTranscriptionPipeline,
} from './server/transcriptionService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_LOCAL_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^app:\/\/.+$/i,
  /^tauri:\/\/localhost$/i,
  /^capacitor:\/\/localhost$/i,
];

function isOriginAllowed(origin: string, reqHost?: string): boolean {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (configured.includes('*')) {
    return true;
  }
  if (configured.includes(origin)) {
    return true;
  }

  // Always allow same-origin requests
  if (reqHost) {
    try {
      const parsed = new URL(origin);
      if (parsed.host.toLowerCase() === reqHost.toLowerCase()) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // Allow configured APP_URL (e.g., shared Cloud Run / self-hosted link)
  const appUrl = (process.env.APP_URL ?? '').trim();
  if (appUrl) {
    try {
      if (new URL(appUrl).origin === new URL(origin).origin) {
        return true;
      }
    } catch {
      // Ignore malformed APP_URL
    }
  }

  // Allow local Electron / Tauri / dev origins
  return ALLOWED_LOCAL_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin, req.headers.host)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-API-Key, Accept'
    );
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { flowApiKey } = readBackendConfig();
  if (!flowApiKey) {
    next();
    return;
  }

  const authorized = isAuthorizedApiKey(flowApiKey, {
    apiKeyHeader: typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined,
    authorizationHeader:
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
  });

  if (!authorized) {
    res.status(401).json({
      error: 'Unauthorized: invalid or missing API key. Send X-API-Key or Authorization: Bearer <key>.',
    });
    return;
  }

  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_BYTES,
    files: 1,
    fields: 20,
  },
  fileFilter: (_req, file, cb) => {
    const rawMime = (file.mimetype ?? '').toLowerCase();
    const allowed =
      rawMime.startsWith('audio/') ||
      rawMime === 'video/webm' ||
      rawMime === 'application/octet-stream';
    if (!allowed) {
      cb(new TranscriptionServiceError(`Unsupported file type "${file.mimetype}". Upload an audio file.`, 400));
      return;
    }
    cb(null, true);
  },
});

const acceptAudioUpload = upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

function extractUploadedAudio(req: Request): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (!files) return undefined;
  return files.audio?.[0] ?? files.file?.[0];
}

async function handleTranscribeRequest(
  req: Request,
  res: Response,
  options: { openaiCompatible?: boolean } = {}
): Promise<void> {
  const audioFile = extractUploadedAudio(req);
  if (!audioFile || !audioFile.buffer || audioFile.buffer.length === 0) {
    res.status(400).json({
      error: 'Missing audio file. Send multipart/form-data with an "audio" (or "file") field.',
    });
    return;
  }

  const parsedFields = parseTranscribeRequestFields(req.body as Record<string, unknown>);
  const rawMimeType = normalizeAudioMimeType(audioFile.mimetype);

  const result = await runTranscriptionPipeline({
    audioBuffer: audioFile.buffer,
    rawMimeType,
    request: parsedFields,
    skipLlmPolish: Boolean(options.openaiCompatible && !req.body?.style && !req.body?.cleanup),
  });

  if (options.openaiCompatible && req.body?.response_format === 'text') {
    res.type('text/plain; charset=utf-8').send(result.text);
    return;
  }

  res.json(result);
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.use(corsMiddleware);

  // Health check routes (Flow client + shared server link monitors)
  app.get(['/health', '/api/health', '/v1/health'], authMiddleware, (_req, res) => {
    res.json(getBackendHealthStatus());
  });

  // Primary Flow transcription route
  app.post(
    ['/transcribe', '/api/transcribe', '/v1/transcribe'],
    authMiddleware,
    acceptAudioUpload,
    (req, res, next) => {
      void handleTranscribeRequest(req, res, { openaiCompatible: false }).catch(next);
    }
  );

  // OpenWhispr / OpenAI & whisper.cpp compatible routes so external clients can share this server link directly
  app.post(
    ['/v1/audio/transcriptions', '/audio/transcriptions', '/inference'],
    authMiddleware,
    acceptAudioUpload,
    (req, res, next) => {
      void handleTranscribeRequest(req, res, { openaiCompatible: true }).catch(next);
    }
  );

  // Centralized error handler for API & multer upload errors
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: `Upload error: ${err.message}` });
      return;
    }

    if (err instanceof TranscriptionServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[Flow Server] Error on ${req.method} ${req.path}:`, message);
    res.status(500).json({ error: message });
  });

  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const health = getBackendHealthStatus();
    console.log(
      `[Flow Server] Listening on http://0.0.0.0:${PORT} (mode=${health.mode}, provider=${health.provider}, cleanup=${health.cleanupProvider}, auth=${health.authRequired ? 'enabled' : 'open'})`
    );
  });
}

void startServer();
