import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { env } from './config/env';
import { apiRateLimiter } from './middlewares/rateLimit';
import { requestId } from './middlewares/requestId';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

/**
 * Membangun instance Express (tanpa listen) agar mudah diuji.
 */
export const createApp = (): Application => {
  const app = express();

  // Trust proxy (di belakang Nginx) untuk IP & secure cookie
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );

  // Body & cookie parsing
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Compression
  app.use(compression());

  // Request tracing & logging
  app.use(requestId);
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  // Rate limiting
  app.use('/api', apiRateLimiter);

  // Routes
  app.use('/api', routes);

  // 404 & global error handler (harus paling akhir)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
