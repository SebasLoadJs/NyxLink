import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { URL } from "node:url"; 
import type { ITrack, ITrackInfo } from "./typings/Interfaces";
import { HttpError } from './errors/HttpError';
import { HttpPolicyError } from './errors/HttpPolicyError';
import { requestUrl, requestHeaders, publicRedirectHeaders } from './http/RequestPolicy';
import { setTimeout as retryWait } from 'node:timers/promises';
import { pipeline, Writable } from 'node:stream';

const HTTP_RESPONSE_LIMIT = 32 * 1024 * 1024;
const redirectMarker = Symbol('httpRedirect');
function responseLimitError(): Error {
  return Object.assign(new Error('HTTP response exceeds the 32 MiB decoded size limit'), { code: 'HTTP_RESPONSE_TOO_LARGE' });
}

export const structures: Record<string, any> = {};

export abstract class Structure {
  public static manager: any;

  public static setManager(manager: any): void {
    this.manager = manager;
  }

  public static getManager(): any {
    return this.manager;
  }

  public static get(name: string): any {
    const structure = structures[name];
    if (!structure) {
      throw new TypeError(`"${name}" structure is not registered.`);
    }
    return structure;
  }

  public static register(name: string, structure: any): void {
    if (typeof name !== "string" || !name) {
        throw new TypeError("Structure name must be a non-empty string.");
    }
    if (structures[name]) {
        throw new TypeError(`Structure "${name}" is already registered.`);
    }
    structures[name] = structure;
  }

  public static extend(name: string, extender: (baseClass: any) => any): void {
    const baseClass = structures[name];
    if (!baseClass) {
      throw new TypeError(`"${name}" is not a valid structure to extend.`);
    }
    if (typeof extender !== "function") {
        throw new TypeError(`Structure extender for "${name}" must be a function.`);
    }
    const extended = extender(baseClass);
    structures[name] = extended;
  }
}

export function validate<T>(
  prop: T,
  validator: (value: T) => boolean,
  errorMessage: string
) {
  if (!validator(prop)) {
    throw new TypeError(`Moonlink.js > ${errorMessage}`);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const NODELINK_URL = "https://github.com/PerformanC/NodeLink";

/** NodeLink-only guard helper. */
export function nodeLinkOnlyError(feature: string): Error {
  return new Error(
    `NodeLink-only feature (${feature}). This node is not NodeLink. See ${NODELINK_URL}.`
  );
}

export type NodeLinkResponse<T> = {
  loadType?: string;
  data: T;
};

/** Normalizes NodeLink responses that may vary in structure. */
export function normalizeNodeLinkResponse<T>(
  input: T | { loadType?: string; data?: T },
  fallbackLoadType?: string
): NodeLinkResponse<T> {
  if (input && typeof input === "object" && "data" in input) {
    const typed = input as { loadType?: string; data?: T };
    return {
      loadType: typed.loadType ?? fallbackLoadType,
      data: typed.data as T,
    };
  }
  return { loadType: fallbackLoadType, data: input as T };
}

export function decodeTrack(encoded: string): ITrack {
  const buffer = Buffer.from(encoded, "base64");
  let position = 0;

  const read = {
    byte: () => buffer[position++],
    ushort: () => {
      const value = buffer.readUInt16BE(position);
      position += 2;
      return value;
    },
    int: () => {
      const value = buffer.readInt32BE(position);
      position += 4;
      return value;
    },
    long: () => {
      const value = buffer.readBigInt64BE(position);
      position += 8;
      return value;
    },
    utf: () => {
      const length = read.ushort();
      const value = buffer.toString("utf8", position, position + length);
      position += length;
      return value;
    },
  };

  const firstInt = read.int();
  const isVersioned = ((firstInt & 0xc0000000) >> 30) & 1;
  const version = isVersioned ? read.byte() : 1;

  return {
    encoded: encoded,
    info: {
      title: read.utf(),
      author: read.utf(),
      length: Number(read.long()),
      identifier: read.utf(),
      isSeekable: true,
      isStream: !!read.byte(),
      uri: version >= 2 && read.byte() ? read.utf() : null,
      artworkUrl: version === 3 && read.byte() ? read.utf() : null,
      isrc: version === 3 && read.byte() ? read.utf() : null,
      sourceName: read.utf(),
      position: Number(read.long()),
    },
    pluginInfo: {},
    userData: {},
  };
}

export function encodeTrack(track: ITrackInfo): string {
  const bufferArray: Buffer[] = [];

  function write(type: string, value: any): void {
    if (type === "byte") bufferArray.push(Buffer.from([value]));
    if (type === "ushort") {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(value);
      bufferArray.push(buf);
    }
    if (type === "int") {
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(value);
      bufferArray.push(buf);
    }
    if (type === "long") {
      const buf = Buffer.alloc(8);
      buf.writeBigInt64BE(BigInt(value));
      bufferArray.push(buf);
    }
    if (type === "utf") {
      const strBuf = Buffer.from(value, "utf8");
      write("ushort", strBuf.length);
      bufferArray.push(strBuf);
    }
  }

  const version = track.artworkUrl || track.isrc ? 3 : track.uri ? 2 : 1;

  const isVersioned = version > 1 ? 1 : 0;
  const firstInt = isVersioned << 30;
  write("int", firstInt);

  if (isVersioned) {
    write("byte", version);
  }

  write("utf", track.title);
  write("utf", track.author);
  write("long", track.length);
  write("utf", track.identifier);
  write("byte", track.isStream ? 1 : 0);

  if (version >= 2) {
    write("byte", track.uri ? 1 : 0);
    if (track.uri) write("utf", track.uri);
  }

  if (version === 3) {
    write("byte", track.artworkUrl ? 1 : 0);
    if (track.artworkUrl) write("utf", track.artworkUrl);

    write("byte", track.isrc ? 1 : 0);
    if (track.isrc) write("utf", track.isrc);
  }

  write("utf", track.sourceName);
  write("long", track.position);

  return Buffer.concat(bufferArray).toString("base64");
}

export function generateUUID(host: string, port: number): string {
  const data = `${host}:${port}`;
  const hash = createHash("sha256").update(data).digest("hex");
  return hash;
}

export function Log(message: string, LogPath: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    const logPathResolved = path.resolve(LogPath);
    const logDir = path.dirname(logPathResolved);

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFileSync(logPathResolved, logMessage);
  } catch (error) {
    console.error("Failed to write to log file:", error);
  }
}

export type ResponseWithHeaders<T> = {
  data: T;
  headers: http.IncomingHttpHeaders;
};

export function makeRequest<T = any>(
  initialUrl: string,
  options: http.RequestOptions & { body?: any; returnHeaders: true; throwOnError?: boolean; allowedOrigins?: readonly string[]; noContentAsNull?: boolean },
  timeout?: number,
  retries?: number,
  retryDelay?: number,
  maxRedirects?: number
): Promise<ResponseWithHeaders<T> | undefined>;

export function makeRequest<T = any>(
  initialUrl: string,
  options: http.RequestOptions & { body?: any; returnHeaders?: false; throwOnError?: boolean; allowedOrigins?: readonly string[]; noContentAsNull?: boolean },
  timeout?: number,
  retries?: number,
  retryDelay?: number,
  maxRedirects?: number
): Promise<T | undefined>;

export async function makeRequest<T = any>(
  initialUrl: string,
  options: http.RequestOptions & { body?: any; returnHeaders?: boolean; throwOnError?: boolean; allowedOrigins?: readonly string[]; noContentAsNull?: boolean },
  timeout = 100000,
  retries = 3,
  retryDelay = 1000,
  maxRedirects = 5
): Promise<T | ResponseWithHeaders<T> | undefined> {
  const { returnHeaders } = options;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 2147483647) throw new RangeError('Invalid HTTP timeout');
  const bodyData = options.body == null ? undefined :
    typeof options.body === "object" ? JSON.stringify(options.body) : String(options.body);
  const supportsZstd =
    typeof (zlib as { createZstdDecompress?: () => zlib.ZstdDecompress })
      .createZstdDecompress === "function";
  const acceptEncoding = supportsZstd
    ? "gzip, deflate, br, zstd"
    : "gzip, deflate, br";
  const initial = requestUrl(initialUrl, options.allowedOrigins);
  let currentUrl = initial.href;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      options.signal?.throwIfAborted();
      let redirectCount = 0;
      let headers = requestHeaders(options.headers);
      let auth = options.auth;

      while (redirectCount <= maxRedirects) {
        const result = await new Promise<T | { [redirectMarker]: string } | ResponseWithHeaders<T>>
          ((resolve, reject) => {
            options.signal?.throwIfAborted();
            const urlObject = requestUrl(currentUrl, options.allowedOrigins);
            const transport = urlObject.protocol === "https:" ? https : http;

            const outgoingHeaders: http.OutgoingHttpHeaders = { ...headers, "Accept-Encoding": acceptEncoding };
            for (const name of Object.keys(outgoingHeaders)) if (name.toLowerCase() === 'host') delete outgoingHeaders[name];
            const requestOptions: http.RequestOptions = {
              ...options,
              auth,
              hostname: urlObject.hostname,
              port: urlObject.port || (urlObject.protocol === "https:" ? 443 : 80),
              path: urlObject.pathname + urlObject.search,
              headers: outgoingHeaders,
            };
            delete (requestOptions as { returnHeaders?: boolean }).returnHeaders;
            delete (requestOptions as { throwOnError?: boolean }).throwOnError;
            delete (requestOptions as { allowedOrigins?: readonly string[] }).allowedOrigins;

            const req = transport.request(requestOptions, (res) => {
              const { statusCode, headers } = res;
              // A response may terminate before its decoder emits end.
              res.on("error", reject);

              if (
                statusCode &&
                (statusCode === 301 ||
                  statusCode === 302 ||
                  statusCode === 307 ||
                  statusCode === 308) &&
                headers.location
              ) {
                res.destroy();
                return resolve({ [redirectMarker]: headers.location });
              }

              if (statusCode && (statusCode < 200 || statusCode >= 300)) {
                if (options.throwOnError) {
                  const chunks: Buffer[] = [];
                  let size = 0;
                  res.on('data', (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > 32768) { req.destroy(); reject(new HttpError(statusCode, undefined, res.headers['retry-after'])); }
                    else chunks.push(chunk);
                  });
                  res.on('error', reject);
                  res.on('end', () => {
                    let body: unknown;
                    try {
                      let buffer = Buffer.concat(chunks);
                      body = decodeErrorBody(buffer, res.headers['content-encoding']);
                    } catch { /* Retain the status if the bounded error body cannot be decoded. */ }
                    reject(new HttpError(statusCode, body, res.headers['retry-after']));
                  });
                  return;
                }
                res.destroy();
                return reject(new HttpError(statusCode, undefined, res.headers["retry-after"]));
              }

              const encodingHeader = res.headers["content-encoding"];
              const encoding = Array.isArray(encodingHeader) ? encodingHeader[0] : encodingHeader;
              const normalizedEncoding = typeof encoding === "string" ? encoding.toLowerCase().trim() : undefined;
              let decoder: NodeJS.ReadWriteStream | undefined;
              if (normalizedEncoding === "gzip") decoder = zlib.createGunzip();
              else if (normalizedEncoding === "deflate") decoder = zlib.createInflate();
              else if (normalizedEncoding === "br") decoder = zlib.createBrotliDecompress();
              else if (normalizedEncoding === "zstd" && supportsZstd) {
                decoder = (zlib as { createZstdDecompress: () => zlib.ZstdDecompress }).createZstdDecompress();
              } else if (normalizedEncoding && normalizedEncoding !== "identity") {
                res.destroy();
                reject(new Error("Unsupported HTTP content encoding"));
                return;
              }

              const chunks: Buffer[] = [];
              let size = 0;
              const collector = new Writable({
                write(chunk: Buffer, _encoding, callback) {
                  size += chunk.length;
                  if (size > HTTP_RESPONSE_LIMIT) { callback(responseLimitError()); return; }
                  chunks.push(chunk);
                  callback();
                }
              });
              pipeline(decoder ? [res, decoder, collector] : [res, collector], (error) => {
                if (error) { reject(error); return; }

                const body = Buffer.concat(chunks);
                const contentType = res.headers["content-type"] || "";

                if (body.length === 0) {
                  // An explicit opt-in preserves the HTTP 204 no-body semantics
                  // even when the server labels it application/json. Ordinary
                  // empty 200 JSON remains {}, never an implicit 204.
                  if (statusCode === 204 && options.noContentAsNull) {
                    const empty = null as T;
                    return resolve(returnHeaders
                      ? { data: empty, headers: res.headers }
                      : empty);
                  }
                  if (contentType.includes("application/json")) {
                    const emptyJson = {} as T;
                    return resolve(
                      returnHeaders
                        ? { data: emptyJson, headers: res.headers }
                        : emptyJson
                    );
                  }
                  const emptyText = "" as any as T;
                  return resolve(
                    returnHeaders
                      ? { data: emptyText, headers: res.headers }
                      : emptyText
                  );
                }

                try {
                  if (contentType.includes("application/json")) {
                    const parsedJson = JSON.parse(body.toString()) as T;
                    return resolve(
                      returnHeaders
                        ? { data: parsedJson, headers: res.headers }
                        : parsedJson
                    );
                  }
                  const parsedText = body.toString() as any as T;
                  return resolve(
                    returnHeaders
                      ? { data: parsedText, headers: res.headers }
                      : parsedText
                  );
                } catch (err) {
                  return reject(
                    new Error(
                      `Failed to parse response: ${(err as Error).message}`
                    )
                  );
                }
              });
            });

            req.on("error", (err: NodeJS.ErrnoException) =>
              reject(Object.assign(new Error(`Request error: ${err.message}`, { cause: err }), { code: err.code }))
            );
            const expire = () => {
              const error = Object.assign(new Error("Request timed out"), { code: 'ETIMEDOUT' });
              reject(error);
              req.destroy(error);
            };
            req.on("timeout", expire);
            req.setTimeout(timeout);
            // Bound the complete response, even when the peer continuously sends bytes.
            const deadline = timeout > 0 ? setTimeout(expire, timeout) : undefined;
            deadline?.unref();
            req.once("close", () => { if (deadline) clearTimeout(deadline); });

            if (bodyData !== undefined) {
              req.setHeader("Content-Length", Buffer.byteLength(bodyData));
              req.write(bodyData);
            }
            req.end();
          }
        );

        if (
          typeof result === "object" &&
          result !== null &&
          redirectMarker in result
        ) {
          const newLocation = (result as { [redirectMarker]: string })[redirectMarker];
          const next = requestUrl(newLocation, options.allowedOrigins, currentUrl);
          if (next.origin !== new URL(currentUrl).origin) {
            if (options.body !== undefined && options.body !== null) throw new HttpPolicyError('redirect-body');
            headers = publicRedirectHeaders(headers);
            auth = undefined;
          }
          currentUrl = next.href;
          redirectCount++;
          continue;
        }

        return result as T;
      }

      throw new HttpPolicyError('redirect-limit');
    } catch (error) {
      if (error instanceof HttpPolicyError || options.signal?.aborted) throw error;
      const terminal = error instanceof HttpError && !error.retryable ||
        (error as NodeJS.ErrnoException)?.code === 'HTTP_RESPONSE_TOO_LARGE';
      if (terminal || attempt >= retries) {
        if (options.throwOnError) throw error;
        return undefined;
      }

      if (attempt < retries) {
        const delayMs = Math.max(retryDelay * Math.pow(2, attempt), error instanceof HttpError ? error.retryAfterMs ?? 0 : 0);
        // Do not retry sooner than the server permits or schedule an overflowing timer.
        if (!Number.isFinite(delayMs) || delayMs > 60000) {
          if (options.throwOnError) throw error;
          return undefined;
        }
        await retryWait(delayMs, undefined, { signal: options.signal });
        currentUrl = initial.href;
      } else {
        return undefined;
      }
    }
  }

  return undefined;
}

export type StreamResponse = {
  stream: http.IncomingMessage;
  statusCode: number;
  headers: http.IncomingHttpHeaders;
};

function decodeErrorBody(buffer: Buffer, encoding: string | undefined): unknown {
  const options = { maxOutputLength: 32768 };
  if (encoding === 'gzip') buffer = zlib.gunzipSync(buffer, options);
  else if (encoding === 'deflate') buffer = zlib.inflateSync(buffer, options);
  else if (encoding === 'br') buffer = zlib.brotliDecompressSync(buffer, options);
  else if (encoding === 'zstd' && typeof zlib.zstdDecompressSync === 'function') buffer = zlib.zstdDecompressSync(buffer, options);
  const text = buffer.toString('utf8');
  try { return JSON.parse(text); } catch { return text; }
}

export async function makeStreamRequest(
  initialUrl: string,
  options: http.RequestOptions & { body?: any },
  timeout = 100000
): Promise<StreamResponse> {
  return new Promise((resolve, reject) => {
    const urlObject = requestUrl(initialUrl);
    const transport = urlObject.protocol === "https:" ? https : http;

    const requestOptions: http.RequestOptions = {
      ...options,
      hostname: urlObject.hostname,
      port: urlObject.port || (urlObject.protocol === "https:" ? 443 : 80),
      path: urlObject.pathname + urlObject.search,
    };
    requestOptions.headers = requestHeaders(options.headers);
    for (const name of Object.keys(requestOptions.headers)) if (name.toLowerCase() === "host") delete requestOptions.headers[name];

    const req = transport.request(requestOptions, (res) => {
      const statusCode = res.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 32768) { req.destroy(); reject(new HttpError(statusCode, undefined, res.headers['retry-after'])); }
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          let body: unknown;
          try { body = decodeErrorBody(Buffer.concat(chunks), res.headers['content-encoding']); } catch {}
          reject(new HttpError(statusCode, body, res.headers['retry-after']));
        });
        return;
      }
      resolve({
        stream: res,
        statusCode,
        headers: res.headers,
      });
    });

    req.on("error", (err) => reject(new Error(`Stream request error: ${err.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Stream request timed out"));
    });

    req.setTimeout(timeout);

    if (options.body) {
      const bodyData =
        typeof options.body === "object" && options.body !== null
          ? JSON.stringify(options.body)
          : options.body.toString();
      req.setHeader("Content-Length", Buffer.byteLength(bodyData));
      req.write(bodyData);
    }

    req.end();
  });
}

export function stringifyWithReplacer(obj: any): string {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (['authorization', 'proxyauthorization', 'password', 'token', 'accesstoken', 'refreshtoken', 'clientsecret', 'apikey', 'sessionid', 'cookie', 'setcookie', 'userdata', 'requester'].includes(normalized)) return '[Redacted]';
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return "[Circular Refs]";
      }
      cache.add(value);
    }
    return value;
  });
}

/** NodeLink-only search prefixes. See https://github.com/PerformanC/NodeLink */
export const nodeLinkSources = new Set([
  "admsearch",
  "azsearch",
  "slsearch",
  "amsearch",
  "audiomack",
  "bcsearch",
  "bilibili",
  "dzsearch",
  "flowery",
  "ftts",
  "gaanasearch",
  "gtts",
  "jssearch",
  "lfsearch",
  "mcsearch",
  "ncsearch",
  "nicovideo",
  "pdsearch",
  "shsearch",
  "speak",
  "spsearch",
  "szsearch",
  "tdsearch",
  "vksearch",
]);

export const sources = {
  youtube: "ytsearch",
  youtubemusic: "ytmsearch",
  soundcloud: "scsearch",
  local: "local",
  admsearch: "admsearch",
  azsearch: "azsearch",
  slsearch: "slsearch",
  amsearch: "amsearch",
  audiomack: "audiomack",
  bcsearch: "bcsearch",
  bilibili: "bilibili",
  dzsearch: "dzsearch",
  flowery: "flowery",
  ftts: "ftts",
  gaanasearch: "gaanasearch",
  gtts: "gtts",
  jssearch: "jssearch",
  lfsearch: "lfsearch",
  mcsearch: "mcsearch",
  ncsearch: "ncsearch",
  nicovideo: "nicovideo",
  pdsearch: "pdsearch",
  shsearch: "shsearch",
  speak: "speak",
  spsearch: "spsearch",
  szsearch: "szsearch",
  tdsearch: "tdsearch",
  vksearch: "vksearch",
};

export class Plugin {
  public name?: string;
  public version?: string;
  public description?: string;
  public author?: string | Record<string, any>
  public minVersion?: string;
  public load(manager: any): void {}
  public unload(manager: any): void {}
}

export function isSourceBlacklisted(manager: any, sourceName: string): boolean {
  if (!manager || !manager.options || !manager.options.blacklistedSources) {
    return false;
  }
  return manager.options.blacklistedSources.includes(sourceName);
}

export function isValidDiscordId(id: string): boolean {
  return typeof id === "string" && /^\d{17,20}$/.test(id);
}

export class EventEmitter<E extends { [K in keyof E]: (...args: any[]) => void }> {
    private readonly listenerMap: {
        [K in keyof E]?: Set<EmitterListenerEntry<E[K]>>;
    } = Object.create(null);

    constructor(private readonly parent?: EventEmitter<E>) {}

    public on<K extends keyof E>(
        event: K,
        listener: E[K],
        options: EmitterListenerOptions = {},
    ): () => void {
        const bucket = this.listenerMap[event] ?? new Set();
        this.listenerMap[event] = bucket;

        const entry: EmitterListenerEntry<E[K]> = {
            listener,
            once: Boolean(options.once),
            priority: options.priority ?? 0,
        };

        bucket.add(entry);
        this.sortListeners(bucket);
        return () => {
            bucket.delete(entry);
            if (bucket.size === 0 && this.listenerMap[event] === bucket) delete this.listenerMap[event];
        };
    }

    public once<K extends keyof E>(
        event: K,
        listener: E[K],
        priority?: number,
    ): () => void {
        return this.on(event, listener, { once: true, priority });
    }

    public off<K extends keyof E>(
        event: K,
        listener: E[K],
    ): void {
        const set = this.listenerMap[event];
        if (!set) return;

        for (const entry of set) {
            if (entry.listener === listener) set.delete(entry);
        }

        if (set.size === 0) delete this.listenerMap[event];
    }

    public emit<K extends keyof E>(event: K, ...args: Parameters<E[K]>): void {
        const set = this.listenerMap[event];
        if (set) {
            for (const entry of [...set]) {
                // A once callback must be removed before invocation, including reentrant
                // emits and exceptions. Do not erase a replacement bucket.
                if (entry.once) {
                    if (!set.delete(entry)) continue;
                    if (set.size === 0 && this.listenerMap[event] === set) delete this.listenerMap[event];
                }
                try {
                    entry.listener(...args);
                } catch (err) {
                    if (event !== 'error' && this.listenerMap['error' as keyof E]) {
                        (this as any).emit('error', err);
                    } else {
                        throw err;
                    }
                }
            }
        }
        if (this.parent) this.parent.emit(event, ...args);
    }

    public removeAllListeners<K extends keyof E>(event?: K): void {
        if (event) delete this.listenerMap[event];
        else Object.keys(this.listenerMap).forEach((key) => {
            delete this.listenerMap[key as K];
        });
    }

    public listenerCount<K extends keyof E>(event?: K): number {
        if (event !== undefined) return this.listenerMap[event]?.size ?? 0;
        return Object.values(this.listenerMap).reduce((total: number, bucket) => total + (bucket as Set<unknown>).size, 0);
    }

    public createChild(): EventEmitter<E> {
        return new EventEmitter<E>(this);
    }

    private sortListeners<T extends (...args: any[]) => void>(set: Set<EmitterListenerEntry<T>>): void {
        const sorted = [...set].sort((a, b) => { return b.priority - a.priority; });
        set.clear();
        for (const entry of sorted) set.add(entry);
    }
}

interface EmitterListenerOptions {
    once?: boolean;
    priority?: number;
}

interface EmitterListenerEntry<T extends (...args: any[]) => void> {
    listener: T;
    once: boolean;
    priority: number;
}
