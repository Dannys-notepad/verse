module.exports = {
  apps: [
    {
      name: 'verse-api',
      script: './api/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'verse-whatsapp',
      script: './platforms/whatsapp/client.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
  ],
};