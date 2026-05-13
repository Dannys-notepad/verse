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
import handleMessage from './events/message.js'

// Recreate __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FOLDER = path.join(__dirname, '../../.whatsapp_auth');

/**
 * Main function to start the WhatsApp client
 */

async function initWhatsAppClient() {
    let sock;
    let readyResolver;
    let readyRejecter;
    const readyPromise = new Promise((resolve, reject) => {
        readyResolver = resolve;
        readyRejecter = reject;
    });

    try {
        if (!fs.existsSync(AUTH_FOLDER)) {
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

        const { version, isLatest } = await fetchLatestBaileysVersion();

        // Generate a unique browser ID for this session
        const browser = ['Verse', 'Chrome', '120.0']

        log.info('WhatsApp Client', `Using WhatsApp Web v${version.join('.')} (isLatest: ${isLatest})`);

        sock = makeWASocket({
            version,
            logger: Pino({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            msgRetryCounterCache: new NodeCache(),
            browser,
            shouldIgnoreJidEndpoint: false,
            generateHighQualityLinkPreview: true,
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

            // Log all connection state changes for debugging
            log.info('WhatsApp Client', `Connection state: ${connection}`);

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
                const fullError = lastDisconnect?.error?.message || lastDisconnect?.error?.toString();
                const reason = disconnectReasons[statusCode] || 'Unknown reason';

                log.warn('WhatsApp Client', `❌ Disconnected: ${reason} (${statusCode})`);
                log.warn('WhatsApp Client', `Full error: ${fullError}`);
                log.warn('WhatsApp Client', `Error code: ${errorCode}`);

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
                    const delay = reconnectAttempt * 3000;
                    log.info(
                        'WhatsApp Client',
                        `Reconnecting... (Attempt ${reconnectAttempt} of ${MAX_RECONNECT_ATTEMPTS}, waiting ${delay}ms)`
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
                log.info('WhatsApp Client', 'Bot is ready to receive messages 📨');
                reconnectAttempt = 0;

                // Log the connected WhatsApp ID/number when available
                try {
                    const meId = sock?.user?.id || state?.creds?.me?.id;
                    if (meId && typeof meId === 'string') {
                        const phoneNumber = meId.split('@')[0];
                        log.info('WhatsApp Client', `Logged in as ${meId} (${phoneNumber})`);
                    }
                } catch (err) {
                    log.warn('WhatsApp Client', `Failed to determine logged-in number: ${err?.message || err}`);
                }
                // Resolve ready promise once connected
                try {
                    if (readyResolver) readyResolver({ sock, state });
                } catch (e) {
                    // ignore
                }
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
        if (readyRejecter) readyRejecter(error);
    }

    // Return control handles for lifecycle management
    return {
        waitForReady: () => readyPromise,
        stop: async () => {
            try {
                log.info('WhatsApp Client', 'Shutting down WhatsApp client...');
                if (sock) {
                    if (typeof sock.logout === 'function') {
                        try { await sock.logout(); } catch (e) { /* ignore */ }
                    }
                    if (sock.ws && typeof sock.ws.close === 'function') {
                        try { sock.ws.close(); } catch (e) { /* ignore */ }
                    }
                    if (typeof sock.close === 'function') {
                        try { await sock.close(); } catch (e) { /* ignore */ }
                    }
                    // remove event listeners
                    try { sock.ev.removeAllListeners && sock.ev.removeAllListeners(); } catch (e) { }
                }
                log.info('WhatsApp Client', 'WhatsApp client stopped');
                return true;
            } catch (err) {
                log.error('WhatsApp Client', `Error during stop: ${err?.message || err}`);
                return false;
            }
        }
    };
}


export default initWhatsAppClient;