import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import messageRoute from './routes/message.route.js';

import error404 from './middlewares/error_404.middleware.js';
import errorHandler from './middlewares/error_handler.middleware.js';

function buildApp() {
  const app = express();

  /* -------------------- Core Middleware -------------------- */

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(helmet());
  app.use(cors());
  app.use(compression());

  /* -------------------- Logging -------------------- */
  app.use(morgan('combined'));

  /* -------------------- Rate Limiting -------------------- */
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);

  /* -------------------- Health Check -------------------- */
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'verse-api' });
  });

  /* -------------------- Routes -------------------- */
  app.use('/message', messageRoute);

  /* -------------------- 404 Handler -------------------- */
  app.use(error404);

  /* -------------------- Error Handler -------------------- */
  app.use(errorHandler);

  return app;
}

export default buildApp;