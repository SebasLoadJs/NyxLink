import type { BackendKind } from './BackendAdapter';
import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';

export interface BackendPluginEventDefinition<T> {
    readonly backend: BackendKind;
    readonly plugin: string;
    readonly type: string;
    readonly scope: 'node' | 'player';
    readonly decode: (payload: unknown) => T;
}

export interface BackendPluginEventContext {
    readonly node: Node;
    readonly player: Player | undefined;
    readonly backend: BackendKind;
    readonly plugin: string;
    readonly type: string;
}

export type BackendPluginEventListener<T> = (value: T, context: BackendPluginEventContext) => void | Promise<void>;

type Entry = { definition: BackendPluginEventDefinition<unknown>; listener: BackendPluginEventListener<unknown> };
const pluginName = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const eventName = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const guildId = /^\d{17,20}$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Trusted application listeners for explicitly advertised server plugins. */
export class BackendPluginEventRegistry {
    private readonly entries = new Set<Entry>();
    private closed = false;

    public register<T>(definition: BackendPluginEventDefinition<T>, listener: BackendPluginEventListener<T>): () => void {
        if (this.closed) throw new Error('Backend plugin event registry is closed');
        if (!definition || !['lavalink','nodelink'].includes(definition.backend) ||
            typeof definition.plugin !== 'string' || !pluginName.test(definition.plugin) ||
            typeof definition.type !== 'string' || !eventName.test(definition.type) ||
            !['node','player'].includes(definition.scope) ||
            typeof definition.decode !== 'function' || typeof listener !== 'function') throw new TypeError('Invalid backend plugin event definition');
        if (this.entries.size >= 256) throw new Error('Backend plugin event limit reached');
        const entry: Entry = { definition: Object.freeze({backend:definition.backend,plugin:definition.plugin,type:definition.type,scope:definition.scope,decode:definition.decode}), listener: listener as BackendPluginEventListener<unknown> };
        this.entries.add(entry);
        return () => { this.entries.delete(entry); };
    }

    public list(): Omit<BackendPluginEventDefinition<unknown>, 'decode'>[] {
        return [...this.entries].map(({definition:{decode: _decode, ...metadata}}) => metadata);
    }

    /** @internal Observes a parsed event without consuming it or modifying core dispatch. */
    public dispatch(node: Node, payload: unknown, current: () => boolean): void {
        if (this.closed || !this.entries.size || !record(payload) || payload.op !== 'event' ||
            typeof payload.type !== 'string' || !current() || !node.backend || node.destroyed || node.manager.destroyed) return;
        const backend = node.backend;
        for (const entry of [...this.entries]) {
            if (!current() || this.closed || node.destroyed || node.manager.destroyed || node.backend !== backend) return;
            if (!this.entries.has(entry)) continue;
            const def = entry.definition;
            if (def.backend !== backend.kind || def.type !== payload.type || !backend.getPlugin(def.plugin)) continue;
            // The wire event may not identify its plugin. The registered contract is
            // the application's assertion, not proof of the remote event's origin.
            let player: Player | undefined;
            if (def.scope === 'player') {
                if (typeof payload.guildId !== 'string' || !guildId.test(payload.guildId)) continue;
                player = node.manager.players.get(payload.guildId);
                if (!player || player.destroyed || player.node !== node) continue;
            } else if (payload.guildId !== undefined) continue;
            const active = () => current() && !this.closed && this.entries.has(entry) &&
                !node.destroyed && !node.manager.destroyed && node.backend === backend &&
                (!player || (!player.destroyed && player.node === node && node.manager.players.get(player.guildId) === player));
            try {
                const value = def.decode(structuredClone(payload));
                if (!active()) continue;
                const result = entry.listener(value, Object.freeze({node,player,backend:backend.kind,plugin:def.plugin,type:def.type}));
                if (result) void Promise.resolve(result).catch(() => {
                    if (active()) this.report(node);
                });
            } catch { if (active()) this.report(node); }
        }
    }

    private report(node: Node): void {
        try { node.manager.emit('debug', 'NyxLink > Backend plugin event decoder or listener failed.'); } catch { /* observer errors are isolated */ }
    }

    public close(): void {
        this.closed = true;
        this.entries.clear();
    }
}
