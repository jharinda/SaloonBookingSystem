/**
 * Migration script to fix corrupted salonId in stylist invitation data.
 *
 * The bug: inviteStylist() used `new Schema.Types.ObjectId(salonId)` instead of
 * `new Types.ObjectId(salonId)`, storing a SchemaType object instead of a real ObjectId.
 * This script cross-references the salon DB to find the correct salonId and repairs the data.
 *
 * Usage: node fix-salon-invitations.js
 */

const { MongoClient, ObjectId } = require('mongodb');

const AUTH_URI = 'mongodb://localhost:27017/snapsalon-auth';
const SALON_URI = 'mongodb://localhost:27017/snapsalon-salon';

async function main() {
  const authClient = new MongoClient(AUTH_URI);
  const salonClient = new MongoClient(SALON_URI);

  try {
    await authClient.connect();
    await salonClient.connect();
    console.log('Connected to both databases.');

    const authDb = authClient.db();
    const salonDb = salonClient.db();

    const usersCol = authDb.collection('users');
    const salonsCol = salonDb.collection('salons');

    // Find all stylists with salonInvitations
    const stylists = await usersCol.find({
      role: 'stylist',
      'stylistProfile.salonInvitations': { $exists: true, $ne: [] },
    }).toArray();

    console.log(`Found ${stylists.length} stylist(s) with invitations.`);

    let totalRepaired = 0;

    for (const stylist of stylists) {
      const invitations = stylist.stylistProfile?.salonInvitations ?? [];
      let modified = false;

      for (let i = 0; i < invitations.length; i++) {
        const inv = invitations[i];
        const sid = inv.salonId;

        // Check if salonId is corrupted (not a string and not a valid ObjectId)
        const isCorrupted =
          sid === null ||
          sid === undefined ||
          (typeof sid === 'object' && !(sid instanceof ObjectId));

        const isValidString = typeof sid === 'string' && /^[a-f\d]{24}$/i.test(sid);
        const isValidObjectId = sid instanceof ObjectId;

        if (!isValidString && !isValidObjectId) {
          console.log(`\n  Stylist: ${stylist.firstName} ${stylist.lastName} (${stylist.email})`);
          console.log(`  Invitation #${i}: salonName="${inv.salonName}", status="${inv.status}"`);
          console.log(`  Corrupted salonId type: ${typeof sid}, value:`, JSON.stringify(sid)?.substring(0, 100));

          // Try to extract salonId from corrupted SchemaType object's "path" property
          let extractedId = null;
          if (typeof sid === 'object' && sid !== null && sid.path && /^[a-f\d]{24}$/i.test(sid.path)) {
            extractedId = sid.path;
            console.log(`  ✓ Extracted salonId from SchemaType.path: ${extractedId}`);
          }

          if (extractedId) {
            invitations[i].salonId = extractedId;
            modified = true;
            totalRepaired++;
          } else {
            // Try to find the salon by name
            const salon = await salonsCol.findOne({ name: inv.salonName });
            if (salon) {
              console.log(`  ✓ Found salon "${salon.name}" with _id: ${salon._id}`);
              invitations[i].salonId = salon._id.toString();
              modified = true;
              totalRepaired++;
            } else {
              // Try matching by staff array
              const salonByStaff = await salonsCol.findOne({
                staff: new ObjectId(stylist._id),
              });
              if (salonByStaff) {
                console.log(`  ✓ Found salon "${salonByStaff.name}" by staff lookup, _id: ${salonByStaff._id}`);
                invitations[i].salonId = salonByStaff._id.toString();
                modified = true;
                totalRepaired++;
              } else {
                console.log(`  ✗ Could not find matching salon — manual fix needed`);
              }
            }
          }
        } else {
          const displayId = isValidObjectId ? sid.toString() : sid;
          console.log(`  Invitation #${i}: salonName="${inv.salonName}" — OK (${displayId})`);
        }
      }

      if (modified) {
        await usersCol.updateOne(
          { _id: stylist._id },
          { $set: { 'stylistProfile.salonInvitations': invitations } },
        );
        console.log(`  → Saved repaired invitations for ${stylist.email}`);
      }
    }

    console.log(`\nDone. Repaired ${totalRepaired} corrupted invitation(s).`);
  } finally {
    await authClient.close();
    await salonClient.close();
  }
}

main().catch(console.error);
