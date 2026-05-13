import { findUserById, createUser, updateUserActivity } from '../db/repos/user.repo.js';
import createUserModel from '../models/user.model.js';

export async function ensureUserExists(userPayload) {
  if (!userPayload || !userPayload.id) {
    throw new Error('userPayload with id is required');
  }

  try {
    const existingUser = await findUserById(userPayload.id);

    if (existingUser) {
      // Update activity only for existing user
      await updateUserActivity(userPayload.id);
      return existingUser;
    }

    // Create new user
    const newUser = createUserModel(userPayload);
    await createUser(newUser);

    return newUser;
  } catch (error) {
    console.error(`Error ensuring user exists for ${userPayload.id}:`, error.message);
    throw error;
  }
}