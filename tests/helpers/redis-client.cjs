'use strict';
const net = require('node:net');

function parseReply(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const delimiter = buffer.indexOf('\r\n', offset);
  if (delimiter < 0) return null;
  const kind = String.fromCharCode(buffer[offset]);
  const head = buffer.toString('utf8', offset + 1, delimiter);
  const next = delimiter + 2;
  if (kind === '+') return { value: head, next };
  if (kind === '-') return { value: new Error('Redis: ' + head), next };
  if (kind === ':') return { value: Number(head), next };
  if (kind === '$') {
    const size = Number(head);
    if (size === -1) return { value: null, next };
    if (!Number.isSafeInteger(size) || size < 0 || size > 32 * 1024 * 1024) throw new Error('Invalid bulk reply size');
    if (buffer.length < next + size + 2) return null;
    if (buffer.toString('ascii', next + size, next + size + 2) !== '\r\n') throw new Error('Invalid bulk separator');
    return { value: buffer.toString('utf8', next, next + size), next: next + size + 2 };
  }
  if (kind === '*') {
    const count = Number(head);
    if (count === -1) return { value: null, next };
    if (!Number.isSafeInteger(count) || count < 0 || count > 100000) throw new Error('Invalid array length');
    const values = [];
    let current = next;
    for (let i = 0; i < count; i++) {
      const part = parseReply(buffer, current);
      if (!part) return null;
      values.push(part.value);
      current = part.next;
    }
    return { value: values, next: current };
  }
  throw new Error('Unsupported Redis test response: ' + kind);
}

class RedisTestClient {
  constructor(socket) {
    this.socket = socket;
    this.pending = [];
    this.buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      try {
        let parsed;
        while ((parsed = parseReply(this.buffer))) {
          this.buffer = this.buffer.subarray(parsed.next);
          const request = this.pending.shift();
          if (!request) throw new Error('Unexpected Redis response');
          if (parsed.value instanceof Error) request.reject(parsed.value);
          else request.resolve(parsed.value);
        }
      } catch (error) {
        for (const request of this.pending.splice(0)) request.reject(error);
        socket.destroy();
      }
    });
    socket.on('error', error => {
      for (const request of this.pending.splice(0)) request.reject(error);
    });
    socket.on('close', () => {
      for (const request of this.pending.splice(0)) request.reject(new Error('Redis test socket closed'));
    });
  }

  sendCommand(args) {
    if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) {
      return Promise.reject(new TypeError('Commands must be strings'));
    }
    const encoded = Buffer.from('*' + args.length + '\r\n' +
      args.map(value => '$' + Buffer.byteLength(value) + '\r\n' + value + '\r\n').join(''));
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket.write(encoded, error => {
        if (error) reject(error);
      });
    });
  }

  async close() {
    this.socket.destroy();
  }
}

async function connectRedis(host = '127.0.0.1', port = 6379) {
  const socket = net.createConnection({ host, port });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  return new RedisTestClient(socket);
}
module.exports = { connectRedis };
