import { ensureUserExists } from '../services/user.service.js';
import { handleMessage as processMessage } from '../services/message.service.js';
import log from '../../shared/utils/log.js';

export default async function handleMessage(req, res, next){
  try {
    const { user, chatId, platform, text } = req.body;

    // Validate required fields
    if (!user || !chatId || !platform || !text) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: user, chatId, platform, text',
      });
    }

    // Ensure user exists in database
    await ensureUserExists(user);

    // Process message and generate AI reply
    const reply = await processMessage({
      text,
      chatId,
      platform,
      userId: user.id,
    });

    log.info('Message Controller', `Reply generated for ${chatId}`);

    res.status(200).json({
      success: true,
      message: 'Message processed',
      reply,
    });
  } catch (err) {
    log.error('Message Controller', 'Error processing message', err.message);
    next(err);
  }
}