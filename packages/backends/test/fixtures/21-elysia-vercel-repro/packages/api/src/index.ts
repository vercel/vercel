import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import { routes } from './routes';

const api = new Elysia()
  .use(errorHandler)
  .use(logger)
  .use(cors())
  .use(routes);

export default api;
