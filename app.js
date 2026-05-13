import express from 'express';

//import initWhatsAppClient from './platforms/whatsapp/client.js';
import initTelegramClient from './platforms/telegram/client.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
    res.json({ msg: 'Hi, your server is up and running' })
});

// Start HTTP server and keep reference for graceful shutdown
const server = app.listen(PORT, () => {
    console.log(`Server is up and running on port ${PORT}`)
});

// Keep track of running platform clients
const platformHandles = [];

async function startPlatformClients() {
    try {
        // Initialize WhatsApp client
        /*const wa = await initWhatsAppClient();
        platformHandles.push(wa);

        wa.waitForReady().then(() => {
            console.log('WhatsApp client ready');
        }).catch(err => {
            console.error('WhatsApp client failed to be ready', err?.message || err);
        });*/

        // Initialize Telegram client
        const tg = await initTelegramClient();
        platformHandles.push(tg);

        tg.waitForReady().then(() => {
            console.log('Telegram client ready');
        }).catch(err => {
            console.error('Telegram client failed to be ready', err?.message || err);
        });
    } catch (error) {
        console.error('Failed to start platform clients:', error?.message || error);
    }
}

startPlatformClients();

// Graceful shutdown
let shuttingDown = false;
async function shutdown(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('Shutdown initiated:', reason);

    // Stop platform clients
    for (const handle of platformHandles) {
        try {
            if (handle && typeof handle.stop === 'function') {
                await handle.stop();
            }
        } catch (e) {
            console.error('Error stopping platform client:', e?.message || e);
        }
    }

    // Close HTTP server
    try {
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    } catch (e) {
        console.error('Error closing HTTP server', e?.message || e);
        process.exit(1);
    }

    // Force exit after timeout
    setTimeout(() => {
        console.warn('Forcing shutdown');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});