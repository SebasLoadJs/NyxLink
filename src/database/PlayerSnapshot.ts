import type { Player } from '../entities/Player';
import type { IPlayerConfig } from '../typings/Interfaces';
import { NodeSelector } from '../nodes/NodeSelector';
import { TrackCodec, type TrackSnapshot } from '../tracks/TrackCodec';

export type PlayerSnapshotData = Omit<IPlayerConfig, 'current' | 'queue' | 'previous'> & {
    current: TrackSnapshot | null;
    queue: TrackSnapshot[];
    previous: TrackSnapshot[];
    volume: number;
    playing: boolean;
    paused: boolean;
    autoPlay: boolean;
    autoLeave: boolean;
    loop: 'off' | 'track' | 'queue';
    filters?: Record<string, unknown>;
};
export type PlayerSnapshot = { schemaVersion: 1; revision: string | null; data: PlayerSnapshotData };

export class SnapshotValidationError extends TypeError {
    public readonly code = 'INVALID_SNAPSHOT';
    constructor(message: string) { super(message); this.name = 'SnapshotValidationError'; }
}
export class SnapshotConflictError extends Error {
    public readonly code = 'SNAPSHOT_CONFLICT';
    constructor() { super('Player snapshot revision or ownership changed'); this.name = 'SnapshotConflictError'; }
}

const invalid = (message: string): never => { throw new SnapshotValidationError(message); };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const snowflake = (value: unknown): value is string => typeof value === 'string' && /^\d{17,20}$/.test(value);

/** Opaque revisions are compared for equality, never ordered or reused after deletion. */
export function recordRevision(value: unknown): string | null {
    if (value === undefined) return null;
    if (!object(value)) return invalid('Stored player must be an object');
    if (value.schemaVersion !== undefined && value.schemaVersion !== 1) return invalid('Unsupported player snapshot schema');
    if (value.schemaVersion === 1 && value.revision === undefined) return invalid('Missing snapshot revision');
    const revision = value.revision ?? null;
    if (revision !== null && (typeof revision !== 'string' || !revision || revision.length > 256)) return invalid('Invalid snapshot revision');
    return revision;
}

/** JSON boundary: detach caller metadata and reject values that cannot be persisted. */
export function snapshotJSON<T>(value: T): T {
    try {
        const json = JSON.stringify(value);
        if (json === undefined || Buffer.byteLength(json) > 16 * 1024 * 1024) return invalid('Snapshot exceeds the JSON size limit');
        return JSON.parse(json);
    } catch (error) {
        if (error instanceof SnapshotValidationError) throw error;
        return invalid('Snapshot must contain serializable JSON data');
    }
}

function track(value: unknown): TrackSnapshot {
    if (!object(value) || typeof value.encoded !== 'string' || !value.encoded) return invalid('Stored track requires an encoding');
    if (value.backend !== undefined && value.backend !== 'lavalink' && value.backend !== 'nodelink') return invalid('Invalid stored track backend');
    if (value.origin !== undefined && typeof value.origin !== 'string') return invalid('Invalid stored track origin');
    for (const field of ['uri', 'artworkUrl', 'isrc']) {
        const item = value.info?.[field];
        if (item !== undefined && item !== null && typeof item !== 'string') return invalid('Invalid stored track URI metadata');
    }
    for (const position of [value.position, value.info?.position]) {
        if (position !== undefined && (typeof position !== 'number' || !Number.isFinite(position) || position < 0)) return invalid('Invalid stored track position');
    }
    let restored: TrackSnapshot;
    try { restored = TrackCodec.serialize(TrackCodec.restore(value as any)); }
    catch { return invalid('Invalid stored track'); }
    const info = restored.info;
    if (![info.title, info.author, info.identifier, info.sourceName].every(item => typeof item === 'string') ||
        !Number.isFinite(info.length) || info.length < 0 && info.length !== -1 || !Number.isFinite(info.position) || info.position < 0 ||
        typeof info.isSeekable !== 'boolean' || typeof info.isStream !== 'boolean' ||
        info.uri !== null && typeof info.uri !== 'string' ||
        !object(restored.pluginInfo) || !object(restored.userData)) return invalid('Invalid stored track metadata');
    return restored;
}

function data(record: unknown): PlayerSnapshotData {
    if (!object(record) || !snowflake(record.guildId) || !snowflake(record.voiceChannelId)) return invalid('Invalid snapshot guild or voice channel');
    if (record.textChannelId !== undefined && !snowflake(record.textChannelId)) return invalid('Invalid snapshot text channel');
    if (record.node !== undefined && (typeof record.node !== 'string' || !record.node)) return invalid('Invalid snapshot node');
    const volume = record.volume === undefined ? 100 : record.volume;
    if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1000) return invalid('Invalid snapshot volume');
    const loop = record.loop === undefined ? 'off' : record.loop;
    if (!['off', 'track', 'queue'].includes(loop)) return invalid('Invalid snapshot loop');
    if (record.loopCount !== undefined && (!Number.isSafeInteger(record.loopCount) || record.loopCount < 0)) return invalid('Invalid snapshot loop count');
    const flags: Record<string, boolean> = {};
    for (const key of ['playing', 'paused', 'autoPlay', 'autoLeave', 'selfDeaf', 'selfMute']) {
        if (record[key] !== undefined && typeof record[key] !== 'boolean') return invalid('Invalid snapshot playback flag');
        if (record[key] !== undefined) flags[key] = record[key];
    }
    if (record.nodeSelection !== undefined) {
        if (!object(record.nodeSelection)) return invalid('Invalid snapshot node requirements');
        try { NodeSelector.validate(record.nodeSelection); } catch { return invalid('Invalid snapshot node requirements'); }
    }
    if (record.filters !== undefined && (!object(record.filters) || record.filters.activeFilters !== undefined &&
        (!Array.isArray(record.filters.activeFilters) || !record.filters.activeFilters.every(item => typeof item === 'string')))) return invalid('Invalid snapshot filters');
    const tracks = (key: string): TrackSnapshot[] => {
        if (record[key] === undefined) return [];
        if (!Array.isArray(record[key])) return invalid('Invalid snapshot track list');
        return Array.from(record[key], track);
    };
    const selection = record.nodeSelection;
    return snapshotJSON({
        guildId: record.guildId, voiceChannelId: record.voiceChannelId,
        ...(record.textChannelId !== undefined ? { textChannelId: record.textChannelId } : {}),
        ...(record.node !== undefined ? { node: record.node } : {}),
        ...(selection ? { nodeSelection: {
            ...(selection.backend !== undefined ? { backend: selection.backend } : {}),
            ...(selection.requiredCapabilities !== undefined ? { requiredCapabilities: selection.requiredCapabilities } : {}),
            ...(selection.region !== undefined ? { region: selection.region } : {}),
            ...(selection.regionPolicy !== undefined ? { regionPolicy: selection.regionPolicy } : {}),
        } } : {}),
        volume, loop, ...(record.loopCount !== undefined ? { loopCount: record.loopCount } : {}),
        playing: false, paused: false, autoPlay: false, autoLeave: false, ...flags,
        current: record.current == null ? null : track(record.current), queue: tracks('queue'), previous: tracks('previous'),
        ...(record.filters !== undefined ? { filters: record.filters } : {}),
    });
}

/** Versioned metadata only: importing a snapshot never starts audio or restores voice credentials. */
export class PlayerSnapshotCodec {
    public static fromRecord(record: unknown): PlayerSnapshot {
        recordRevision(record);
        const normalized = snapshotJSON(record);
        return { schemaVersion: 1, revision: recordRevision(normalized), data: data(normalized) };
    }

    public static parse(input: unknown): PlayerSnapshot {
        let value: any = input;
        if (typeof input === 'string') {
            if (Buffer.byteLength(input) > 16 * 1024 * 1024) return invalid('Snapshot exceeds the JSON size limit');
            try { value = JSON.parse(input); } catch { return invalid('Invalid snapshot JSON'); }
        }
        if (!object(value) || value.schemaVersion !== 1 || !Object.hasOwn(value, 'revision')) return invalid('Unsupported player snapshot schema');
        recordRevision(value);
        const normalized = snapshotJSON(value);
        return { schemaVersion: 1, revision: recordRevision(normalized), data: data(normalized.data) };
    }

    public static capture(player: Player, revision: string | null): PlayerSnapshot {
        return this.fromRecord({
            schemaVersion: 1, revision, guildId: player.guildId, voiceChannelId: player.voiceChannelId,
            textChannelId: player.textChannelId, node: player.node.identifier, nodeSelection: player.nodeSelection,
            volume: player.volume, playing: player.playing, paused: player.paused, loop: player.loop, loopCount: player.loopCount,
            autoPlay: player.autoPlay, autoLeave: player.autoLeave, selfDeaf: player.get('selfDeaf'), selfMute: player.get('selfMute'),
            current: player.current ? TrackCodec.serialize(player.current) : null,
            queue: player.queue.tracks.map(item => TrackCodec.serialize(item)), previous: player.previous.map(item => TrackCodec.serialize(item)),
            filters: player.filters.toJSON(),
        });
    }
}
