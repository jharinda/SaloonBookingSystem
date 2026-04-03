/* eslint-disable */
/**
 * setupFiles: runs inside each Jest worker process before any test executes.
 * Top-level code here is executed when this file is required — no export needed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MONGO_TMP_FILE = path.join(
  os.tmpdir(),
  '__snapsalon-booking-e2e-mongo__.json',
);

// ── Read MongoDB URI written by globalSetup ──────────────────────────────────
if (fs.existsSync(MONGO_TMP_FILE)) {
  const { mongoUri } = JSON.parse(
    fs.readFileSync(MONGO_TMP_FILE, 'utf-8'),
  ) as { mongoUri: string };
  process.env['BOOKING_MONGODB_URI'] = mongoUri;
}

// ── Fixed test credentials — must stay in sync with TEST_JWT_SECRET in test-app.ts ──
process.env['JWT_ACCESS_SECRET']  = 'test-jwt-secret-at-least-32-chars-long!!';
process.env['JWT_REFRESH_SECRET'] = 'test-jwt-refresh-secret-32-chars-xxxx!!';
process.env['NODE_ENV']           = 'test';
process.env['REDIS_HOST']         = 'localhost';
process.env['REDIS_PORT']         = '6379';
