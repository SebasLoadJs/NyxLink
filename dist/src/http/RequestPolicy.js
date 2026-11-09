"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerSignal = providerSignal;
exports.requestHeaders = requestHeaders;
exports.requestUrl = requestUrl;
exports.publicRedirectHeaders = publicRedirectHeaders;
exports.providerUrl = providerUrl;
const HttpPolicyError_1 = require("../errors/HttpPolicyError");
function providerSignal(signal) {
    const deadline = AbortSignal.timeout(10000);
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
}
function requestHeaders(input) {
    if (!input)
        return {};
    if (!Array.isArray(input))
        return { ...input };
    if (input.length % 2 !== 0)
        throw new TypeError('Raw HTTP headers require name/value pairs');
    return Object.fromEntries(Array.from({ length: input.length / 2 }, (_, index) => [input[index * 2], input[index * 2 + 1]]));
}
function requestUrl(input, allowedOrigins, base) {
    let url;
    try {
        url = new URL(input, base);
    }
    catch {
        throw new HttpPolicyError_1.HttpPolicyError('scheme');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
        throw new HttpPolicyError_1.HttpPolicyError('scheme');
    if (url.username || url.password)
        throw new HttpPolicyError_1.HttpPolicyError('credentials');
    if (allowedOrigins !== undefined && (!Array.isArray(allowedOrigins) || !allowedOrigins.includes(url.origin)))
        throw new HttpPolicyError_1.HttpPolicyError('origin');
    return url;
}
function publicRedirectHeaders(headers) {
    return Object.fromEntries(Object.entries(headers).filter(([name]) => !['authorization', 'proxy-authorization', 'cookie', 'cookie2'].includes(name.toLowerCase())));
}
function providerUrl(path, base) {
    if (typeof path !== 'string' || !path)
        throw new HttpPolicyError_1.HttpPolicyError('scheme');
    const origin = new URL(base).origin;
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//');
    const url = requestUrl(absolute ? path : `${base}${path}`, [origin], base);
    const prefix = new URL(base).pathname.replace(/\/$/, '');
    if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`))
        throw new HttpPolicyError_1.HttpPolicyError('origin');
    return url.href;
}
//# sourceMappingURL=RequestPolicy.js.map