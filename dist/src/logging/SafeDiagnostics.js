"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeDiagnosticValue = safeDiagnosticValue;
exports.safeDiagnosticText = safeDiagnosticText;
const LogFormatter_1 = require("./LogFormatter");
const sensitive = /^(?:authorization|proxyauthorization|auth|credentials|password|passwd|passphrase|token|accesstoken|refreshtoken|bottoken|discordtoken|voicetoken|bearertoken|apikey|clientsecret|privatekey|secretkey|secret|sessionid|session|cookie|setcookie|userdata|body|requestbody|responsebody|rawpayload|gatewaypayload|voicepayload)$/i;
const strip = (text) => text.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
function safeDiagnosticValue(value) {
    const seen = new WeakSet();
    let budget = 256;
    const visit = (item, depth) => {
        if (--budget < 0)
            return '[Truncated]';
        if (typeof item === 'string')
            return strip((0, LogFormatter_1.redactSecrets)(item)).slice(0, 4096);
        if (typeof item === 'number')
            return Number.isFinite(item) ? item : String(item);
        if (typeof item === 'bigint')
            return String(item);
        if (item === null || typeof item === 'boolean')
            return item;
        if (item === undefined)
            return null;
        if (typeof item !== 'object')
            return `[${typeof item}]`;
        if (seen.has(item))
            return '[Circular]';
        if (depth >= 6)
            return '[MaxDepth]';
        seen.add(item);
        try {
            if (item instanceof Date) {
                const timestamp = Date.prototype.getTime.call(item);
                return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '[InvalidDate]';
            }
            const output = Object.create(null);
            const keys = item instanceof Error ? ['name', 'message', 'stack', 'cause'] : [];
            for (const key in item) {
                if (Object.prototype.hasOwnProperty.call(item, key) && !keys.includes(key))
                    keys.push(key);
                if (keys.length >= 64)
                    break;
            }
            for (const key of keys) {
                if (key === 'length' && Array.isArray(item))
                    continue;
                const descriptor = Object.getOwnPropertyDescriptor(item, key);
                if (!descriptor && key !== 'name')
                    continue;
                const field = strip((0, LogFormatter_1.redactSecrets)(key)).slice(0, 128);
                output[field] = sensitive.test(key.replace(/[^a-z]/gi, '')) ? '[REDACTED]' :
                    !descriptor ? 'Error' : 'value' in descriptor ? visit(descriptor.value, depth + 1) : '[Accessor]';
            }
            if (Array.isArray(item))
                return Object.values(output);
            return output;
        }
        catch {
            return '[Unserializable]';
        }
        finally {
            seen.delete(item);
        }
    };
    return visit(value, 0);
}
function safeDiagnosticText(value) {
    const safe = safeDiagnosticValue(value);
    return typeof safe === 'string' ? safe : JSON.stringify(safe);
}
//# sourceMappingURL=SafeDiagnostics.js.map