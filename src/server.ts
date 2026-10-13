import { createApp } from './app';
import { connectDb, disconnectDb } from './app/config/db';
import { env } from './app/config/env';
import { logger } from './app/lib/logger';

const main = async () => {
  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, () =>
    logger.info(`server listening on :${env.PORT} (${env.NODE_ENV})`),
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection'));
};

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
