const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');

async function fixConversations() {
  const client = new MongoClient('mongodb://localhost:27017');

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const chatDb = client.db('snapsalon-chat');
    const conversations = await chatDb.collection('conversations').find({}).toArray();

    console.log(`\nFound ${conversations.length} conversation(s) to check\n`);

    for (const conv of conversations) {
      console.log(`\n=== Conversation ${conv._id} ===`);
      console.log(`Current participants: ${conv.participants?.map(p => p.toString()).join(', ')}`);
      console.log(`ClientId: ${conv.clientId}`);
      console.log(`SalonId: ${conv.salonId}`);

      // Fetch salon owner from salon-service
      try {
        const salonResponse = await axios.get(`http://localhost:3001/api/salons/${conv.salonId}`);
        const salonData = salonResponse.data;
        const salonOwnerId = salonData.ownerId;

        console.log(`Salon Name: ${salonData.name}`);
        console.log(`Salon Owner ID: ${salonOwnerId}`);

        // Update participants to use [clientId, salonOwnerId]
        const newParticipants = [
          new ObjectId(conv.clientId),
          new ObjectId(salonOwnerId)
        ];

        const result = await chatDb.collection('conversations').updateOne(
          { _id: conv._id },
          { $set: { participants: newParticipants } }
        );

        console.log(`✓ Updated participants to: ${newParticipants.map(p => p.toString()).join(', ')}`);
        console.log(`  Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
      } catch (error) {
        console.log(`✗ Failed to fetch salon or update: ${error.message}`);
      }
    }

    console.log('\n=== Done ===\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

fixConversations();
