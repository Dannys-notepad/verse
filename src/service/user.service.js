import { findUserById, createUser, deductToken, bannUser, resetToken, updateUserActivity } from '../db/repos/user.repo.js';
import createUserModel from '../models/user.model.js';

export async function checkUser(userPayload) {
  if (!userPayload || !userPayload.id) {
    throw new Error('userPayload with id is required');
  }

  try {
    const existingUser = await findUserById(userPayload.id);

    if (existingUser) {
      if(existingUser.accountStatus === 'banned'){
        return 'user was temporarily banned';
      }
      if(Number(existingUser.token) === 0){
        return 'quota exhuated';
      }
      // Update user activity
      await updateUserActivity(userPayload.id)
      return existingUser;
    }

    // Create new user
    const newUser = createUserModel(userPayload);
    await createUser(newUser);

    //return newUser;
    return 'new user';
  } catch (error) {
    console.error(`Error ensuring user exists for ${userPayload.id}:`, error.message);
    throw error;
  }
}

export async function deductUserToken(userId) {
  if (!userId) {
    throw new Error('user id is required');
  }

  try {
    const existingUser = await findUserById(userId);

    if (existingUser) {
      // Deduct user token
      await deductToken(userId)
      return existingUser;
    }

  } catch (error) {
    console.error(`Error ensuring user exists for ${userId}, deducting token failed:`, error.message);
    throw error;
  }
}

export async function resetUserToken(userId) {
  if (!userId) {
    throw new Error('user id is required');
  }

  try {
    const existingUser = await findUserById(userId);

    if (existingUser) {
      // Reset user token
      await resetToken(userId)
      return existingUser;
    }

  } catch (error) {
    console.error(`Error ensuring user exists for ${userId}, resetting token failed:`, error.message);
    throw error;
  }
}