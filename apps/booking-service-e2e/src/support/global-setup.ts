import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Temp file used to share the MongoDB URI between the globalSetup process
 * and the Jest worker processes (which have a separate Node.js context and
 * therefore cannot share globalThis or process.env directly).
 */
export const MONGO_TMP_FILE = path.join(
  os.tmpdir(),
  '__snapsalon-booking-e2e-mongo__.json',
);

module.exports = async function () {
  console.log('\nSetting up booking-service-e2e integration test infrastructure...\n');

  // ── MongoDB Memory Server ──────────────────────────────────────────────────
  const mongoServer = await MongoMemoryServer.create({
    instance: { dbName: 'snapsalon-booking-e2e' },
  });
  const mongoUri = mongoServer.getUri();

  // Write URI to a temp file so each Jest worker process can read it
  // (globalSetup and worker processes run in different Node.js contexts).
  fs.writeFileSync(MONGO_TMP_FILE, JSON.stringify({ mongoUri }), 'utf-8');

  // Store on globalThis for globalTeardown — both run in the same process.
  globalThis.__MONGO_SERVER__ = mongoServer;
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down booking-service-e2e infrastructure...\n';

  console.log(`  ✔ MongoDB Memory Server: ${mongoUri}`);
  console.log('  ✔ Redis: ioredis-mock (in-process, no external server needed)\n');
};
