import express from 'express';
import handleMessage  from '../controllers/message.controller.js'

const router = express.Router();

router.post('/', handleMessage)

export default router;