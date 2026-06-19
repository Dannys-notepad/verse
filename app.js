import express from 'express';
import dotenv from 'dotenv';

//import initWhatsAppClient from './platforms/whatsapp/client.js';
import initTelegramClient from './platforms/telegram/client.js';
import { runMessageEncryptionMigrationOnce } from './src/db/migrations/runMessageEncryptionMigration.js';
import startMemoryMonitor from './src/utils/memoryMonitor.js';

dotenv.config();

function createExpressApp() {
    const app = express();

    // Parse incoming JSON and form data for bot/webhook requests.
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Simple health-check route used during local development and deployment checks.
    app.get('/', (_req, res) => {
        console.log(`${req.method} ${req.url}`);
        res.json({ msg: 'Hi, your server is up and running' });
    });

    return app;
}

const app = createExpressApp();
const PORT = Number(process.env.PORT || 5000);
const server = app.listen(PORT, () => {
    console.log(`Server is up and running on port ${PORT}`);
});

const memoryMonitor = startMemoryMonitor({
    limitMb: Number(process.env.MEMORY_LIMIT_MB || 512),
    restartThresholdMb: Number(process.env.MEMORY_RESTART_THRESHOLD_MB || 480),
    intervalMs: Number(process.env.MEMORY_MONITOR_INTERVAL_MS || 30000),
});

const platformHandles = [];

async function startPlatformClients() {
    try {
        await runMessageEncryptionMigrationOnce();

        // Initialize WhatsApp client
        /*const wa = await initWhatsAppClient();
        platformHandles.push(wa);

        wa.waitForReady().then(() => {
            console.log('WhatsApp client ready');
        }).catch(err => {
            console.error('WhatsApp client failed to be ready', err?.message || err);
        });*/

        // Initialize Telegram client
        const tg = await initTelegramClient(app);
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

// Graceful shutdown keeps the app stable when the process receives a stop signal.
let shuttingDown = false;

async function stopPlatformClients() {
    for (const handle of platformHandles) {
        try {
            if (handle && typeof handle.stop === 'function') {
                await handle.stop();
            }
        } catch (error) {
            console.error('Error stopping platform client:', error?.message || error);
        }
    }
}

async function shutdown(reason) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log('Shutdown initiated:', reason);

    await stopPlatformClients();
    memoryMonitor.stop();

    try {
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    } catch (error) {
        console.error('Error closing HTTP server:', error?.message || error);
        process.exit(1);
    }

    // Fallback safety-net in case the server does not close cleanly.
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