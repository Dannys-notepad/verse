import { spawn } from 'child_process';
import log from './shared/utils/log.js';

const services = [
  /*{
    name: 'API Server',
    command: 'node',
    args: ['./api/server.js'],
    color: '\x1b[36m', // Cyan
  },*/
  {
    name: 'WhatsApp Client',
    command: 'node',
    args: ['./platforms/whatsapp/client.js'],
    color: '\x1b[35m', // Magenta
  },
];

const processes = [];

/**
 * Start all services
 */
function startServices() {
  log.info('Service Orchestrator', 'Starting all services...');

  services.forEach((service) => {
    const child = spawn(service.command, service.args, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    processes.push({ name: service.name, process: child });

    child.on('error', (err) => {
      log.error(service.name, `Failed to start: ${err.message}`);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        log.error(service.name, `Exited with code ${code}`);
      } else {
        log.info(service.name, 'Stopped gracefully');
      }
    });

    log.info('Service Orchestrator', `${service.name} started (PID: ${child.pid})`);
  });
}

/**
 * Graceful shutdown of all services
 */
function shutdown(signal) {
  log.info('Service Orchestrator', `Received ${signal}, shutting down services...`);

  processes.forEach(({ name, process: proc }) => {
    log.info('Service Orchestrator', `Stopping ${name}...`);
    proc.kill('SIGTERM');
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    log.error('Service Orchestrator', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start all services
startServices();

// Keep process alive
process.stdin.resume();
