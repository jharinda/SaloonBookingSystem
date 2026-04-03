/**
 * One-time cleanup aligned with SnapSalon MongoDB layout:
 * - Moves googletokens from snapsalon-booking → snapsalon-calendar
 * - Merges conversations + messages from snapsalon-auth → snapsalon-chat (by _id)
 * - Drops stray collections on snapsalon-auth (bookings, salons, googletokens, messages, conversations)
 * - Drops empty duplicate DB snapsalon-bookings
 *
 * Usage: node tools/scripts/mongo-cleanup-migration.js
 * Optional: MONGODB_URI=mongodb://localhost:27017
 */
const { MongoClient } = require('mongodb');

const DEFAULT_URI = 'mongodb://localhost:27017';

async function main() {
  const uri = process.env['MONGODB_URI'] ?? DEFAULT_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const admin = client.db().admin();

  const { databases } = await admin.listDatabases();
  const names = new Set(databases.map((d) => d.name));

  // ── 1) Google tokens: booking DB → calendar DB ─────────────────────────
  const bookingDb = client.db('snapsalon-booking');
  const calendarDb = client.db('snapsalon-calendar');

  if (names.has('snapsalon-booking')) {
    const srcTok = bookingDb.collection('googletokens');
    const hasTok = await srcTok.estimatedDocumentCount();
    if (hasTok > 0) {
      const dstTok = calendarDb.collection('googletokens');
      const docs = await srcTok.find().toArray();
      for (const doc of docs) {
        await dstTok.replaceOne({ _id: doc._id }, doc, { upsert: true });
      }
      console.log(`Migrated ${docs.length} googletokens → snapsalon-calendar`);
    }
    await srcTok.drop().catch(() => {});
  }

  // ── 2) Chat: auth → chat ─────────────────────────────────────────────────
  const authDb = client.db('snapsalon-auth');
  const chatDb = client.db('snapsalon-chat');

  // Messages: merge by _id (same bucket in both DBs during bad config).
  const msgSrc = authDb.collection('messages');
  if ((await msgSrc.estimatedDocumentCount()) > 0) {
    const dst = chatDb.collection('messages');
    let merged = 0;
    for await (const doc of msgSrc.find()) {
      await dst.replaceOne({ _id: doc._id }, doc, { upsert: true });
      merged++;
    }
    await msgSrc.drop();
    console.log(`Merged ${merged} messages from snapsalon-auth → snapsalon-chat`);
  }

  // Conversations: unique on (salonId, clientId) — skip if chat already has that pair.
  const convSrc = authDb.collection('conversations');
  if ((await convSrc.estimatedDocumentCount()) > 0) {
    const dst = chatDb.collection('conversations');
    let inserted = 0;
    let skipped = 0;
    for await (const doc of convSrc.find()) {
      const exists = await dst.findOne({
        salonId: doc.salonId,
        clientId: doc.clientId,
      });
      if (exists) {
        skipped++;
        continue;
      }
      await dst.insertOne(doc);
      inserted++;
    }
    await convSrc.drop();
    console.log(
      `Conversations: inserted ${inserted} from auth, skipped ${skipped} (already in chat)`,
    );
  }

  // ── 3) Remove any remaining misplaced collections on auth ───────────────────
  for (const collName of [
    'bookings',
    'salons',
    'googletokens',
    'conversations',
    'messages',
  ]) {
    await authDb.collection(collName).drop().catch(() => {});
  }

  // ── 4) Drop duplicate / empty booking database ────────────────────────────
  if (names.has('snapsalon-bookings')) {
    await client.db('snapsalon-bookings').dropDatabase();
    console.log('Dropped database snapsalon-bookings');
  }

  await client.close();
  console.log('mongo-cleanup-migration finished.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
