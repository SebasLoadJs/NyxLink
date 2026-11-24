import { Readable } from 'node:stream';
export declare const PCM_BYTES_PER_MS = 192;
export declare const MAX_CLIENT_PCM_SEEK_MS = 30000;
export declare function assertClientPcmSeekPosition(positionMs: number): void;
export declare function createClientPcmSeekStream(source: NodeJS.ReadableStream, positionMs: number): Readable;
