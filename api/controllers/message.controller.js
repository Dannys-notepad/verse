import { ensureUserExists } from '../services/user.service.js';

export default async function handleMessage(req, res, next){
  try {
    const message = req.body;

    await ensureUserExists(message.user);


    res.status(202).json({
      success: true,
      message: 'Message received',
    });
  } catch (err) {
    next(err);
  }
}