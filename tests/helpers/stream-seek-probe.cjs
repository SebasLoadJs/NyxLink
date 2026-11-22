'use strict';

const http = require('node:http');
const https = require('node:https');

/**
 * Observe a pinned NodeLink stream's HTTP framing without treating a
 * partial response or a stream abort as a successful seek. Never log URLs,
 * Authorization, track encodings, request bodies or audio bytes.
 */
async function probeLoadStream(backend, sessionId, encodedTrack, variant, options = {}) {
  if (!backend || !['127.0.0.1', 'localhost'].includes(backend.host)) {
    throw new TypeError('Seek diagnostics only allow local isolated backends');
  }
  if (!['wav', 'raw'].includes(variant.format) ||
      !Number.isFinite(variant.position) || variant.position < 0 ||
      variant.range !== undefined && !/^bytes=\d+-\d*$/.test(variant.range)) {
    throw new TypeError('Invalid seek probe configuration');
  }
  const requestBody = JSON.stringify({
    encodedTrack, position: variant.position, volume: 100, format: variant.format
  });
  const transport = backend.secure ? https : http;
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 12000;

  return await new Promise(resolve => {
    let req, response;
    let timer;
    let settled = false;
    let bytes = 0;
    let nonzero = 0;
    let sawEnd = false;
    let errorCode;
    let errorName;
    const result = { variant: variant.name, format: variant.format, position: variant.position,
      range: variant.range ?? null, statusCode: null, contentLength: null, contentRange: null,
      transferEncoding: null, bytes: 0, nonzeroBytes: 0, complete: false, ended: false,
      aborted: false, errorCode: null, errorName: null };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      result.bytes = bytes;
      result.nonzeroBytes = nonzero;
      result.complete = response?.complete === true;
      result.ended = sawEnd;
      result.aborted = !!response?.aborted;
      result.errorCode = errorCode ?? null;
      result.errorName = errorName ?? null;
      resolve(result);
    };
    try {
      req = transport.request({
        host: backend.host, port: backend.port, method: 'POST',
        path: '/v4/loadstream',
        headers: {
          Authorization: backend.password,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          ...(variant.range ? { Range: variant.range } : {}),
        },
      }, res => {
        response = res;
        result.statusCode = res.statusCode ?? null;
        const declared = Number(res.headers['content-length']);
        result.contentLength = Number.isSafeInteger(declared) && declared >= 0 ? declared : null;
        result.contentRange = res.headers['content-range'] ?? null;
        result.transferEncoding = res.headers['transfer-encoding'] ?? null;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            errorCode = 'MAX_BYTES';
            req.destroy();
            return;
          }
          for (let i = 0; i < chunk.length; i++) if (chunk[i] !== 0) nonzero++;
        });
        res.once('end', () => { sawEnd = true; finish(); });
        res.once('error', err => { errorCode ??= err.code ?? 'RESPONSE_ERROR'; errorName = err.name; finish(); });
        res.once('close', finish);
        res.once('aborted', () => { errorCode ??= 'RESPONSE_ABORTED'; });
      });
      req.once('error', err => { errorCode ??= err.code ?? 'REQUEST_ERROR'; errorName = err.name; finish(); });
      timer = setTimeout(() => {
        errorCode ??= 'PROBE_TIMEOUT';
        req.destroy();
        finish();
      }, timeoutMs);
      timer.unref?.();
      req.end(requestBody);
    } catch (err) {
      errorCode = err.code ?? 'PROBE_ERROR';
      errorName = err.name;
      req?.destroy();
      finish();
    }
  });
}

module.exports = { probeLoadStream };
