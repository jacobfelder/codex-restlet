const fs = require('fs');
const path = require('path');

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

function resolveLogFile() {
  const desired = process.env.LOG_FILE || path.join(process.cwd(), 'logs', 'mapping.log');
  const dir = path.dirname(desired);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return desired;
}

class Logger {
  constructor({ level = process.env.LOG_LEVEL || 'info', logToFile = true } = {}) {
    this.level = LOG_LEVELS.includes(level) ? level : 'info';
    this.logToFile = logToFile;
    this.logFile = resolveLogFile();
  }

  shouldLog(level) {
    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(this.level);
  }

  formatMessage(level, message, meta) {
    const timestamp = new Date().toISOString();
    const payload = { timestamp, level, message };
    if (meta && Object.keys(meta).length) {
      payload.meta = meta;
    }
    return payload;
  }

  writeToFile(payload) {
    const line = `${JSON.stringify(payload)}\n`;
    fs.appendFileSync(this.logFile, line, { encoding: 'utf8' });
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;
    const payload = this.formatMessage(level, message, meta);
    const printable = [payload.timestamp, level.toUpperCase(), '-', payload.message];
    if (payload.meta) {
      printable.push('\n', JSON.stringify(payload.meta, null, 2));
    }
    console.log(printable.join(' '));
    if (this.logToFile) {
      this.writeToFile(payload);
    }
  }

  debug(message, meta) {
    this.log('debug', message, meta);
  }

  info(message, meta) {
    this.log('info', message, meta);
  }

  warn(message, meta) {
    this.log('warn', message, meta);
  }

  error(message, meta) {
    this.log('error', message, meta);
  }
}

module.exports = new Logger();
module.exports.Logger = Logger;
