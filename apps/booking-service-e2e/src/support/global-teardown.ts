import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MONGO_TMP_FILE = path.join(
  os.tmpdir(),
  '__snapsalon-booking-e2e-mongo__.json',
);

module.exports = async function () {
  // Stop MongoDB Memory Server (stored in globalThis by global-setup).
  const mongoServer = globalThis.__MONGO_SERVER__ as MongoMemoryServer | undefined;
  if (mongoServer) {
    await mongoServer.stop({ doCleanup: true });
    console.log('\n  ✔ MongoDB Memory Server stopped.');
  }

  // Remove temp file that held the MongoDB URI for worker processes.
  if (fs.existsSync(MONGO_TMP_FILE)) {
    fs.unlinkSync(MONGO_TMP_FILE);
  }

  console.log(globalThis.__TEARDOWN_MESSAGE__ ?? '\nTearing down...\n');
};
