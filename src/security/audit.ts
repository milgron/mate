export interface AuditEntry {
  timestamp: string;
  action: string;
  userId: string;
  details: unknown;
}

export interface AuditLoggerConfig {
  log: (entry: AuditEntry) => void;
}

/**
 * Logs security-relevant actions for audit trail.
 */
export class AuditLogger {
  private readonly log: (entry: AuditEntry) => void;

  constructor(config: AuditLoggerConfig) {
    this.log = config.log;
  }

  /**
   * Logs an action with timestamp and context.
   */
  logAction(action: string, userId: string, details: unknown): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      userId,
      details,
    };

    this.log(entry);
  }

  /**
   * Creates a logger that writes to console (for development).
   */
  static createConsoleLogger(): AuditLogger {
    return new AuditLogger({
      log: (entry) => {
        console.log(JSON.stringify(entry));
      },
    });
  }

  /**
   * Creates a logger that writes to a file (for production).
   */
  static createFileLogger(filePath: string): AuditLogger {
    const fs = require('fs');
    const stream = fs.createWriteStream(filePath, { flags: 'a' });

    return new AuditLogger({
      log: (entry) => {
        stream.write(JSON.stringify(entry) + '\n');
      },
    });
  }
}
