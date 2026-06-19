import { db, admin } from '../firebase.js';
import { encrypt, decrypt } from '../../utils/encrypt-decrypt.js';

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

function touchUser(userId, extraFields = {}) {
  const ref = getUserDocRef(userId);

  return ref.update({
    lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extraFields,
  });
}

function isEncryptedPayload(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{32}:[a-fA-F0-9]+$/.test(value);
}

function normalizeMessageRecord(doc) {
  const messageData = { id: doc.id, ...doc.data() };
  const secretKey = process.env.SECRET_KEY;
  const rawPayload = messageData.encryptedContent ?? messageData.text;

  if (isEncryptedPayload(rawPayload) && secretKey) {
    try {
      const decryptedText = decrypt(rawPayload, secretKey);
      messageData.text = decryptedText;
      messageData.content = decryptedText;
    } catch (error) {
      console.warn(`Unable to decrypt message ${doc.id}:`, error.message);
    }
  }

  return messageData;
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
      .map(doc => normalizeMessageRecord(doc))
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

  const secretKey = process.env.SECRET_KEY;
  if (!secretKey) {
    throw new Error('SECRET_KEY is required');
  }

  const encryptedMessage = encrypt(message.text, secretKey);

  const normalized = {
    role: message.role || message.userIs || 'user',
    text: String(encryptedMessage),
    encryptedContent: String(encryptedMessage),
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
    await touchUser(userId, {
      token: 20,
      lastTokenReset: admin.firestore.FieldValue.serverTimestamp(),
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
    await touchUser(userId);
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

    await touchUser(userId, {
      token: tokenDeducted,
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
    await touchUser(userId, {
      accountStatus: 'banned',
    });
    return userId;
  } catch (error) {
    console.error(`Error banning ${userId}:`, error.message);
    throw error;
  }
}

export async function upsertUser(user) {
  if (!user || !user.id) {
    throw new Error('User object with id is required');
  }

  try {
    const ref = getUserDocRef(user.id);
    const existingUser = await ref.get();

    if (existingUser.exists) {
      const updateData = { ...user };
      delete updateData.createdAt;
      updateData.lastActiveAt = admin.firestore.FieldValue.serverTimestamp();
      await ref.update(updateData);
    } else {
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