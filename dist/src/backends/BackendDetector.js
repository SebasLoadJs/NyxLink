"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendDetector = void 0;
const LavalinkAdapter_1 = require("./LavalinkAdapter");
const NodeLinkAdapter_1 = require("./NodeLinkAdapter");
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
const namePattern = /^[a-z0-9][\w.-]*$/i;
class BackendDetector {
    static detect(info, headers = {}, capabilities = new Set()) {
        capabilities.clear();
        const data = object(info);
        if (!data)
            return undefined;
        const version = object(data.version)?.semver;
        if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(version))
            return undefined;
        const marker = Object.entries(headers).find(([name]) => name.toLowerCase() === 'iamnodelink')?.[1];
        const header = Array.isArray(marker) ? marker[0] : marker;
        const nodeLink = data.isNodelink === true || (typeof header === 'string' && header.trim().toLowerCase() === 'true');
        if (!nodeLink && !version.startsWith('4.'))
            return undefined;
        for (const [field, prefix] of [['sourceManagers', 'source'], ['filters', 'filter']]) {
            const values = data[field];
            if (!Array.isArray(values))
                continue;
            for (const name of values) {
                if (typeof name === 'string' && namePattern.test(name))
                    capabilities.add(`${prefix}:${name.toLowerCase()}`);
            }
        }
        const plugins = new Map();
        if (Array.isArray(data.plugins)) {
            for (const item of data.plugins) {
                const plugin = object(item);
                if (typeof plugin?.name !== 'string' || !namePattern.test(plugin.name) ||
                    typeof plugin.version !== 'string' || !plugin.version.trim() || plugin.version.length > 128 || /[\x00-\x1f\x7f]/.test(plugin.version))
                    continue;
                const key = plugin.name.toLowerCase();
                if (!plugins.has(key))
                    plugins.set(key, { name: plugin.name, version: plugin.version });
                capabilities.add(`plugin:${key}`);
            }
        }
        if (nodeLink && typeof object(data.sourceHealth)?.enabled === 'boolean')
            capabilities.add('source-health');
        const metadata = [...plugins.values()];
        return nodeLink ? new NodeLinkAdapter_1.NodeLinkAdapter(version, capabilities, metadata) : new LavalinkAdapter_1.LavalinkAdapter(version, capabilities, metadata);
    }
}
exports.BackendDetector = BackendDetector;
//# sourceMappingURL=BackendDetector.js.map