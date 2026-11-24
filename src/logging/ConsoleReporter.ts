import type { ConsolaReporter, LogObject } from 'consola';
import { formatEntry, formatValue, redactSecrets, type FormatterOptions } from './LogFormatter';

export type StructuredLogRecord = {
  level: number;
  type: string;
  module: string;
  timestamp: string;
  message: string;
};
export type StructuredLogSink = (record: StructuredLogRecord) => void;

/** Duck-typed adapter: consumers provide their own Pino instance. */
export type PinoLogTarget = {
  error: (record: StructuredLogRecord, message: string) => unknown;
  warn: (record: StructuredLogRecord, message: string) => unknown;
  info: (record: StructuredLogRecord, message: string) => unknown;
  debug: (record: StructuredLogRecord, message: string) => unknown;
  trace: (record: StructuredLogRecord, message: string) => unknown;
};
export function createPinoSink(target: PinoLogTarget): StructuredLogSink {
  return record => {
    const method = record.level <= 0 ? 'error' : record.level === 1 ? 'warn' :
      record.level <= 3 ? 'info' : record.level === 4 ? 'debug' : 'trace';
    target[method](record, record.message);
  };
}

export class ConsoleReporter implements ConsolaReporter {
  constructor(
    private readonly options: FormatterOptions = {},
    private readonly sink?: StructuredLogSink,
    private readonly consoleEnabled = true,
  ) {}

  private deliver(record: StructuredLogRecord): void {
    // Observability must not interrupt player or node operations.
    try { this.sink?.(record); } catch {}
  }

  /** Used by Logger for full-width status/failover panels and optional startup banner. */
  writePanel(content: string): void {
    const safe = redactSecrets(content);
    if (this.consoleEnabled) process.stdout.write(safe + '\n');
    if (this.sink) this.deliver({ level: 3, type: 'panel', module: 'NyxLink',
      timestamp: new Date().toISOString(), message: safe.replace(/\x1b\[[0-9;]*m/g, '') });
  }

  log(logObject: LogObject): void {
    const module = redactSecrets(logObject.tag || '');
    const type = redactSecrets(logObject.type);
    if (this.sink) this.deliver({
      level: logObject.level, type, module,
      timestamp: logObject.date.toISOString(),
      message: logObject.args.map(formatValue).join(' '),
    });
    if (!this.consoleEnabled) return;
    const formatted = formatEntry({ type, tag: module, date: logObject.date, args: logObject.args }, this.options);
    const stream = logObject.level <= 1 ? process.stderr : process.stdout;
    stream.write(formatted + '\n');
  }
}
