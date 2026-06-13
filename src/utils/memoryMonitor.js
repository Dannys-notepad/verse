import { spawn } from 'child_process';

const DEFAULT_LIMIT_MB = Number(process.env.MEMORY_LIMIT_MB || 512);
const DEFAULT_RESTART_THRESHOLD_MB = Number(process.env.MEMORY_RESTART_THRESHOLD_MB || 480);
const DEFAULT_INTERVAL_MS = Number(process.env.MEMORY_MONITOR_INTERVAL_MS || 30000);

function getHeapUsageMb() {
    const usage = process.memoryUsage();
    return usage.heapUsed / (1024 * 1024);
}

function parseBoolean(value) {
    if (value === undefined || value === null) return true;
    return String(value).toLowerCase() !== 'false';
}

function restartCurrentProcess() {
    const entryPoint = process.argv[1];

    if (!entryPoint) {
        console.warn('MemoryMonitor: no startup script found, cannot auto-restart.');
        return;
    }

    console.warn('MemoryMonitor: restarting app to free memory and stay under the limit.');

    const child = spawn(process.execPath, [entryPoint, ...process.argv.slice(2)], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
    });

    child.on('error', (error) => {
        console.error('MemoryMonitor: restart failed:', error.message);
    });

    child.on('exit', (code) => {
        process.exit(code || 1);
    });
}

/**
 * Starts a simple memory watchdog for the Node process.
 *
 * It checks heap usage at a fixed interval and:
 * 1. logs warnings when memory gets close to the limit,
 * 2. auto-restarts the app before the process exceeds the safety threshold.
 */
export function startMemoryMonitor({
    limitMb = DEFAULT_LIMIT_MB,
    restartThresholdMb = DEFAULT_RESTART_THRESHOLD_MB,
    intervalMs = DEFAULT_INTERVAL_MS,
    selfRestart = parseBoolean(process.env.MEMORY_SELF_RESTART),
    onRestart = restartCurrentProcess,
} = {}) {
    let restartTriggered = false;

    const intervalId = setInterval(() => {
        const heapUsedMb = getHeapUsageMb();
        const limit = Math.max(1, Number(limitMb) || DEFAULT_LIMIT_MB);
        const threshold = Math.max(1, Number(restartThresholdMb) || DEFAULT_RESTART_THRESHOLD_MB);

        console.log(
            `MemoryMonitor: heap=${heapUsedMb.toFixed(1)} MB, limit=${limit} MB, threshold=${threshold} MB`
        );

        if (heapUsedMb >= limit) {
            console.error(`MemoryMonitor: memory limit reached (${heapUsedMb.toFixed(1)} MB >= ${limit} MB).`);
            if (!restartTriggered) {
                restartTriggered = true;
                if (selfRestart) {
                    onRestart();
                } else {
                    console.warn('MemoryMonitor: self-restart disabled via MEMORY_SELF_RESTART=false. No auto-restart will be performed.');
                }
            }
            return;
        }

        if (heapUsedMb >= threshold && !restartTriggered) {
            console.warn(`MemoryMonitor: memory is close to the limit (${heapUsedMb.toFixed(1)} MB >= ${threshold} MB).`);
            restartTriggered = true;
            if (selfRestart) {
                onRestart();
            } else {
                console.warn('MemoryMonitor: self-restart disabled via MEMORY_SELF_RESTART=false. No auto-restart will be performed.');
            }
        }
    }, Math.max(1000, Number(intervalMs) || DEFAULT_INTERVAL_MS));

    return {
        stop() {
            clearInterval(intervalId);
        },
        getHeapUsageMb,
    };
}

export default startMemoryMonitor;
