import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import log from '../../src/utils/log.js';
import qrcode from 'qrcode-terminal';
import NodeCache from 'node-cache'
import Pino from 'pino';
import {
    default as makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
} from '@whiskeysockets/baileys';
//import handleMessage from './events/message.js'

// Recreate __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FOLDER = path.join(__dirname, '../../.whatsapp_auth');

/**
 * Main function to start the WhatsApp client
 */

async function initWhatsAppClient() {
    try {
        if (!fs.existsSync(AUTH_FOLDER)) {
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

        const { version, isLatest } = await fetchLatestBaileysVersion();

        // Generate a unique browser ID for this session
        const browserId = `$Verse-${Math.random().toString(36).substring(2, 8)}`

        log.info('WhatsApp Client', `Using WhatsApp Web v${version.join('.')} (isLatest: ${isLatest})`);

        const sock = makeWASocket({
            version,
            logger: Pino({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            msgRetryCounterCache: new NodeCache(),
            browser: [browserId, 'Chrome', '1.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        let reconnectAttempt = 0;
        const MAX_RECONNECT_ATTEMPTS = 4;

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update || {};

            if (qr) {
                log.info('QR Code', '📱 Scan this QR with WhatsApp (Linked Devices):');
                qrcode.generate(qr, { small: true });

            }

            const disconnectReasons = {
                [DisconnectReason.badSession]: 'Bad session file',
                [DisconnectReason.connectionClosed]: 'Connection closed',
                [DisconnectReason.connectionLost]: 'Connection lost',
                [DisconnectReason.connectionReplaced]: 'Connection replaced by another device',
                [DisconnectReason.loggedOut]: 'Logged out',
                [DisconnectReason.restartRequired]: 'Restart required',
                [DisconnectReason.timedOut]: 'Connection timed out',
            };

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorCode = lastDisconnect?.error?.output?.payload?.attrs?.code;
                const reason = disconnectReasons[statusCode] || 'Unknown reason';

                log.warn('WhatsApp Client', `❌ Disconnected: ${reason} (${statusCode})`);

                if (statusCode === DisconnectReason.loggedOut) {
                    log.error(
                        'WhatsApp Client',
                        `⚠️ You have been logged out. Please delete the ${AUTH_FOLDER} folder and restart the bot.`
                    );
                    reconnectAttempt = 0;
                    return;
                }

                if (errorCode === '515') {
                    try {
                        log.warn(
                            'WhatsApp Client',
                            '⚠️ Auth state corrupted (code 515). Resetting session...'
                        );
                        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                        log.info('WhatsApp Client', '⚠️🗑️  Old auth state deleted. Restarting for fresh QR...');
                    } catch (error) {
                        log.error('WhatsApp Client', `❌ Failed to delete auth folder: ${error.message}`);
                    }
                    setTimeout(startWhatsApp, 2000);
                    return;
                }

                if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempt++;
                    const delay = reconnectAttempt * 2000;
                    log.info(
                        'WhatsApp Client',
                        `Reconnecting... (Attempt ${reconnectAttempt} of ${MAX_RECONNECT_ATTEMPTS})`
                    );
                    setTimeout(initWhatsAppClient, delay);
                } else {
                    log.error(
                        'WhatsApp Client',
                        '❌ Max reconnection attempts reached. Please restart manually.'
                    );
                    reconnectAttempt = 0;
                }
            }

            if (connection === 'open') {
                log.info('WhatsApp Client', 'Connected to WhatsApp ✅');
                log.info('WhatsApp Client', 'Bot is ready to receive messages 📨')
                reconnectAttempt = 0;
            }

            if (isNewLogin) {
                log.info('WhatsApp Client', '🔑 New login detected, please check your WhatsApp')
            }

            if (isOnline !== undefined) {
                log.info('WhatsApp Client', isOnline ? '🟢 Online' : '🔴 Offline')
            }
        });

        // Listen for messages
        sock.ev.on("messages.upsert", async (m) => {
            const msg = m.messages[0];
            if (!msg.message) return;

            await handleMessage(msg, sock);
        });
    } catch (error) {
        log.error('WhatsApp Client', `Error: ${error.message}`);
    }
}


export default initWhatsAppClient;


