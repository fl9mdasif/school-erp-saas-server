import { Router } from 'express';
import { catchAsync } from '../../lib/catchAsync';
import { pingDb } from '../../config/db';

const router = Router();

/** Liveness plus DB ping. Never returns tenant data. */
router.get(
  '/health',
  catchAsync(async (_req, res) => {
    const db = await pingDb();
    res
      .status(db ? 200 : 503)
      .json({ success: db, data: { status: db ? 'ok' : 'degraded', db: db ? 'up' : 'down' } });
  }),
);

export const healthRoutes = router;
