const { MongoClient } = require('mongodb');

async function debugUserProfiles() {
  const client = new MongoClient('mongodb://localhost:27017');

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    // Check auth database for users
    const authDb = client.db('snapsalon-auth');
    const users = await authDb.collection('users').find({}).toArray();

    console.log('=== USERS FROM AUTH DB ===');
    users.forEach(u => {
      console.log(`Email: ${u.email}, ID: ${u._id}, Role: ${u.role}`);
    });

    // Check user-service database for profiles
    const userDb = client.db('snapsalon-users');
    const profiles = await userDb.collection('userprofiles').find({}).toArray();

    console.log('\n=== USER PROFILES FROM USER-SERVICE DB ===');
    if (profiles.length === 0) {
      console.log('No user profiles found!');
      console.log('\nCreating missing user profiles...');

      // Create profiles for each user
      for (const user of users) {
        const profile = {
          userId: user._id.toString(),
          email: user.email,
          firstName: user.email.split('@')[0].toUpperCase(), // e.g., "E" from "e@e.com"
          lastName: 'User',
          role: user.role,
          phone: null,
          avatarUrl: null,
          timezone: 'UTC',
          notificationPreferences: {
            email: true,
            sms: false,
            whatsapp: false,
            push: false,
          },
          stylistProfile: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await userDb.collection('userprofiles').insertOne(profile);
        console.log(`Created profile for: ${user.email}`);
      }
    } else {
      profiles.forEach(p => {
        console.log(`UserId: ${p.userId}, Email: ${p.email}, Name: ${p.firstName} ${p.lastName}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

debugUserProfiles();
