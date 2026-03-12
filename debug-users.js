const { MongoClient } = require('mongodb');

async function debugUsers() {
  const client = new MongoClient('mongodb://localhost:27017');

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    // Check auth database
    const authDb = client.db('snapsalon-auth');
    const users = await authDb.collection('users').find({
      email: { $in: ['e@e.com', 'b@b.com', 'z@z.com'] }
    }).toArray();

    console.log('\n=== USERS FROM AUTH DB ===');
    users.forEach(u => {
      console.log(`Email: ${u.email}, ID: ${u._id}, Role: ${u.role}`);
    });

    // Check chat database conversations
    const chatDb = client.db('snapsalon-chat');
    const conversations = await chatDb.collection('conversations').find({}).toArray();

    console.log('\n=== CONVERSATIONS FROM CHAT DB ===');
    conversations.forEach(c => {
      console.log(`ConversationID: ${c._id}`);
      console.log(`  ClientId: ${c.clientId}`);
      console.log(`  SalonId: ${c.salonId}`);
      console.log(`  Participants: ${c.participants?.join(', ')}`);
      console.log(`  Channel: ${c.channel}`);
      console.log('');
    });

    // Check messages
    const messages = await chatDb.collection('messages').find({}).sort({ createdAt: -1 }).limit(5).toArray();

    console.log('=== RECENT MESSAGES ===');
    messages.forEach(m => {
      console.log(`Message: ${m.body?.substring(0, 50)}`);
      console.log(`  From: ${m.senderId}, To Conversation: ${m.conversationId}`);
      console.log(`  Created: ${m.createdAt}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

debugUsers();
