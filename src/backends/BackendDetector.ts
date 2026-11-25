import type { BackendAdapter, BackendPlugin } from './BackendAdapter';
import { LavalinkAdapter } from './LavalinkAdapter';
import { hasLavaLyricsPlugin } from './LavaLyricsContracts';
import { hasLavalinkSponsorBlockPlugin } from './LavalinkSponsorBlockContracts';
import { hasLavaSearchPlugin } from './LavaSearchContracts';
import { NodeLinkAdapter } from './NodeLinkAdapter';

function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const namePattern = /^[a-z0-9][\w.-]*$/i;

export class BackendDetector {
    /**
     * /v4/info: https://lavalink.dev/api/rest#get-info
     * NodeLink marker: https://github.com/PerformanC/NodeLink/blob/804e0d6d0f1af30384e0a2d12ddbc8d79e85cf35/src/api/info.ts
     */
    public static detect(info: unknown, headers: Record<string, unknown> = {}, capabilities = new Set<string>()): BackendAdapter | undefined {
        capabilities.clear();
        const data = object(info);
        if (!data) return undefined;
        const version = object(data.version)?.semver;
        if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(version)) return undefined;
        const marker = Object.entries(headers).find(([name]) => name.toLowerCase() === 'iamnodelink')?.[1];
        const header = Array.isArray(marker) ? marker[0] : marker;
        const nodeLink = data.isNodelink === true || (typeof header === 'string' && header.trim().toLowerCase() === 'true');
        if (!nodeLink && !version.startsWith('4.')) return undefined;
        for (const [field, prefix] of [['sourceManagers', 'source'], ['filters', 'filter']] as const) {
            const values = data[field];
            if (!Array.isArray(values)) continue;
            for (const name of values) {
                if (typeof name === 'string' && namePattern.test(name)) capabilities.add(`${prefix}:${name.toLowerCase()}`);
            }
        }
        const plugins = new Map<string, BackendPlugin>();
        if (Array.isArray(data.plugins)) {
            for (const item of data.plugins) {
                const plugin = object(item);
                if (typeof plugin?.name !== 'string' || !namePattern.test(plugin.name) ||
                    typeof plugin.version !== 'string' || !plugin.version.trim() || plugin.version.length > 128 || /[\x00-\x1f\x7f]/.test(plugin.version)) continue;
                const key = plugin.name.toLowerCase();
                if (!plugins.has(key)) plugins.set(key, { name: plugin.name, version: plugin.version });
                capabilities.add(`plugin:${key}`);
            }
        }
        // Presence of the flag advertises the diagnostic endpoint, even when monitoring is disabled.
        if (nodeLink && typeof object(data.sourceHealth)?.enabled === 'boolean') capabilities.add('source-health');
        const metadata = [...plugins.values()];
        if (!nodeLink) {
            if (hasLavaSearchPlugin(metadata)) capabilities.add('lavasearch');
            if (hasLavaLyricsPlugin(metadata)) capabilities.add('lavalyrics');
            if (hasLavalinkSponsorBlockPlugin(metadata)) capabilities.add('lavalink:sponsorblock');
        }
        return nodeLink ? new NodeLinkAdapter(version, capabilities, metadata) : new LavalinkAdapter(version, capabilities, metadata);
    }
}
