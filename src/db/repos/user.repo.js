import { db, admin } from '../firebase.js';

function getUserDocRef(userId) {
  const normalizedId = String(userId || '').trim();
  if (!normalizedId) {
    throw new Error('userId is required');
  }

  return db.collection('users').doc(normalizedId);
}

function getUserMessagesCollectionRef(userId) {
  return getUserDocRef(userId).collection('messages');
}

export async function getUserMessages(userId, limit = 20) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const snapshot = await getUserMessagesCollectionRef(userId)
      .orderBy('receivedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .reverse();
  } catch (error) {
    console.error(`Error fetching user messages for ${userId}:`, error.message);
    throw error;
  }
}

export async function saveMessage(userId, message) {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!message || !message.text) {
    throw new Error('message.text is required');
  }

  const normalized = {
    role: message.role || message.userIs || 'user',
    text: String(message.text),
    imgUrl: message.imgUrl ?? null,
    platform: message.platform ?? 'unknown',
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const ref = getUserMessagesCollectionRef(userId);
    await ref.add(normalized);
    return normalized;
  } catch (error) {
    console.error(`Error saving message for ${userId}:`, error.message);
    throw error;
  }
}

export async function saveUserMessage(userId, text, platform = 'unknown') {
  return saveMessage(userId, { role: 'user', text, platform });
}

export async function saveAssistantMessage(userId, text, platform = 'unknown') {
  return saveMessage(userId, { role: 'assistant', text, platform });
}

export async function findUserById(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const doc = await getUserDocRef(userId).get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error(`Error finding user ${userId}:`, error.message);
    throw error;
  }
}

export async function createUser(user) {
  if (!user || !user.id) {
    throw new Error('User object with id is required');
  }

  try {
    const ref = getUserDocRef(user.id);
    const userData = {
      ...user,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(userData);
    return ref.id;
  } catch (error) {
    console.error(`Error creating user ${user.id}:`, error.message);
    throw error;
  }
}


export async function resetToken(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const ref = getUserDocRef(userId);
    await ref.update({
      token: 20,
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return userId;
  } catch (error) {
    console.error(`Error resetting user token ${userId}:`, error.message);
    throw error;
  }
}

export async function updateUserActivity(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const ref = getUserDocRef(userId);
    await ref.update({
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return userId;
  } catch (error) {
    console.error(`Error updating user activity ${userId}:`, error.message);
    throw error;
  }
}

export async function deductToken(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const ref = getUserDocRef(userId);
    const doc = await ref.get();

    if (!doc.exists) {
      throw new Error('User not found');
    }

    const currentToken = Number(doc.data().token) || 0;
    const tokenDeducted = Math.max(currentToken - 1, 0);

    await ref.update({
      token: tokenDeducted,
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return userId;
  } catch (error) {
    console.error(`Error deducting user token ${userId}:`, error.message);
    throw error;
  }
}

export async function bannUser(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const ref = getUserDocRef(userId);
    await ref.update({
      accountStatus: 'banned',
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return userId;
  } catch (error) {
    console.error(`Error banning ${userId}:`, error.message);
    throw error;
  }
}

// Kept for backward compatibility - upserts with proper logic
export async function upsertUser(user) {
  if (!user || !user.id) {
    throw new Error('User object with id is required');
  }

  try {
    const ref = getUserDocRef(user.id);
    const existingUser = await ref.get();

    if (existingUser.exists) {
      // Update existing user - only update lastActiveAt and provided fields
      const updateData = { ...user };
      delete updateData.createdAt; // Never override createdAt
      updateData.lastActiveAt = admin.firestore.FieldValue.serverTimestamp();
      await ref.update(updateData);
    } else {
      // Create new user
      const userData = {
        ...user,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(userData);
    }

    return ref.id;
  } catch (error) {
    console.error(`Error upserting user ${user.id}:`, error.message);
    throw error;
  }
}