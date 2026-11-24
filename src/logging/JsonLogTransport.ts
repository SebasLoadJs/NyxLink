import type { Writable } from 'node:stream';
import type { LogTransport, StructuredLogRecord } from './StructuredLog';

/** Wait for completion so a slow Writable cannot bypass the pipeline queue limit. */
export function writeLogLine(stream: Writable, line: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => { reject(error); };
        stream.once('error', failed);
        try {
            stream.write(line, error => {
                if (error) { reject(error); return; }
                stream.off('error', failed);
                resolve();
            });
        } catch (error) {
            stream.off('error', failed);
            reject(error);
        }
    });
}

/** Writes newline-delimited JSON; the caller owns the stream's lifetime. */
export class JsonLogTransport implements LogTransport {
    constructor(private readonly stream: Writable = process.stdout) {}

    write(record: StructuredLogRecord): Promise<void> {
        return writeLogLine(this.stream, JSON.stringify(record) + '\n');
    }
}
