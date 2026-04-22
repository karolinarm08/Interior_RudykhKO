const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
const logFile = path.join(logDir, 'error.log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function logError(error, req = null) {
  const message = [
    '---------------------------',
    new Date().toISOString(),
    req ? `${req.method} ${req.originalUrl}` : 'No request info',
    error.stack || error.message || String(error)
  ].join('\n') + '\n';

  fs.appendFileSync(logFile, message);
}

module.exports = { logError };