import { db, admin } from '../firebase.js';

export async function findUserById(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const doc = await db.collection('users').doc(userId).get();
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
    const ref = db.collection('users').doc(user.id);
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

export async function updateUserActivity(userId) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const ref = db.collection('users').doc(userId);
    await ref.update({
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return userId;
  } catch (error) {
    console.error(`Error updating user activity ${userId}:`, error.message);
    throw error;
  }
}

// Kept for backward compatibility - upserts with proper logic
export async function upsertUser(user) {
  if (!user || !user.id) {
    throw new Error('User object with id is required');
  }

  try {
    const ref = db.collection('users').doc(user.id);
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