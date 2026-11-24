import { type PlayerGroup, type GroupCreate, type GroupPatch, type GroupPatchResult, type SponsorBlockOptions, type SponsorBlockSegment, type SponsorBlockState } from '../backends/NodeLinkOrchestration';
import { type LyricsRequestOptions, type SourceHealthResponse, type NodeLinkStreamFormats } from '../backends/NodeLinkContracts';
import { type LavaLyricsData, type LavaLyricsOptions } from '../backends/LavaLyricsContracts';
import { type LavalinkSponsorBlockCategory } from '../backends/LavalinkSponsorBlockContracts';
import { type PlayerUpdatePayload, type PlayerUpdateAcknowledgement, type SessionUpdateResponse } from "../backends/ProtocolContracts";
import { type NodeLinkResponse, type ResponseWithHeaders } from "../Util";
import type { IChapter, IFilters, ILyricsData, IMeaningResponse, INodeConnectionStatus } from "../typings/Interfaces";
import { Node } from "./Node";
import { IRESTLoadTracks, IRESTGetPlayers, ITrack, INodeStats, IRoutePlannerStatus } from "../typings/Interfaces";
import { type MixLayerCreated, type MixLayersResponse } from '../backends/NodeLinkMixContracts';
export declare class RestError extends Error {
    statusCode: number;
    isSessionExpired: boolean;
    constructor(message: string, statusCode: number);
}
export declare class Rest {
    private readonly node;
    private readonly authHeaders;
    private readonly jsonHeaders;
    private readonly userAgentHeaders;
    private readonly sessionRecoveries;
    private readonly request;
    private readonly streamRequest;
    constructor(node: Node);
    get url(): string;
    private observeTransport;
    private triggerPlayerRecovery;
    private extensionRoute;
    private featureRequest;
    private runFeatureRequest;
    private featureError;
    getGroups(): Promise<PlayerGroup[]>;
    getGroup(groupId: string): Promise<PlayerGroup>;
    createGroup(options: GroupCreate): Promise<PlayerGroup>;
    updateGroup(groupId: string, options: GroupPatch): Promise<GroupPatchResult>;
    deleteGroup(groupId: string): Promise<void>;
    private lavalinkSponsorBlockRequest;
    getLavalinkSponsorBlockCategories(guildId: string): Promise<LavalinkSponsorBlockCategory[]>;
    setLavalinkSponsorBlockCategories(guildId: string, categories: LavalinkSponsorBlockCategory[]): Promise<void>;
    clearLavalinkSponsorBlockCategories(guildId: string): Promise<void>;
    getSponsorBlock(guildId: string): Promise<SponsorBlockState>;
    updateSponsorBlock(guildId: string, options: SponsorBlockOptions): Promise<SponsorBlockState>;
    setSponsorBlockSegments(guildId: string, segments: SponsorBlockSegment[]): Promise<SponsorBlockState>;
    clearSponsorBlock(guildId: string): Promise<void>;
    getPlayers(): Promise<IRESTGetPlayers[] | null>;
    getPlayer(guildId: string): Promise<IRESTGetPlayers | null>;
    updatePlayer(guildId: string, data: PlayerUpdatePayload, noReplace?: boolean): Promise<PlayerUpdateAcknowledgement | null>;
    private updatePlayerRequest;
    destroyPlayer(guildId: string, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<void>;
    loadTracks(identifier: string, options?: {
        timeoutMs: number;
        signal?: AbortSignal;
    }): Promise<IRESTLoadTracks>;
    decodeTrack(encodedTrack: string): Promise<ITrack | null>;
    decodeTracks(encodedTracks: string[]): Promise<ITrack[] | null>;
    getInfo(): Promise<any | null>;
    getInfoWithHeaders(): Promise<ResponseWithHeaders<any> | null>;
    getVersion(timeout?: number, retries?: number): Promise<string | null>;
    getStats(): Promise<INodeStats | null>;
    getRoutePlannerStatus(): Promise<IRoutePlannerStatus | null>;
    freeFailedAddress(address: string): Promise<void>;
    freeAllFailedAddresses(): Promise<void>;
    updateSession(resuming: boolean, timeout: number): Promise<SessionUpdateResponse | null>;
    addMixLayer(guildId: string, data: {
        track: {
            encoded: string;
            userData?: Record<string, any>;
        };
        volume?: number;
    }): Promise<MixLayerCreated | null>;
    getMixLayers(guildId: string): Promise<MixLayersResponse | null>;
    updateMixLayerVolume(guildId: string, mixId: string, volume: number): Promise<void>;
    removeMixLayer(guildId: string, mixId: string): Promise<void>;
    getLavaLyrics(encodedTrack: string, options?: LavaLyricsOptions): Promise<LavaLyricsData | null>;
    loadLyrics(encodedTrack: string, options?: string | LyricsRequestOptions): Promise<NodeLinkResponse<ILyricsData | Record<string, any>> | null>;
    getSourceHealth(): Promise<SourceHealthResponse>;
    loadChapters(encodedTrack: string): Promise<NodeLinkResponse<IChapter[]> | null>;
    loadMeaning(encodedTrack: string, lang?: string): Promise<NodeLinkResponse<IMeaningResponse | Record<string, any>> | null>;
    getConnectionStatus(): Promise<NodeLinkResponse<INodeConnectionStatus> | null>;
    getMetrics(): Promise<string | null>;
    getWorkers(): Promise<NodeLinkResponse<any[]> | null>;
    patchWorker(payload: Record<string, any>): Promise<any | null>;
    getYoutubeConfig(validate?: boolean): Promise<any | null>;
    updateYoutubeConfig(payload: {
        refreshToken?: string;
        visitorData?: string;
    }): Promise<any | null>;
    exchangeYoutubeOAuth(refreshToken: string): Promise<any | null>;
    encodeTrackRemote(track: string): Promise<string | null>;
    encodeTracksRemote(tracks: Array<{
        encoded: string;
        info: Record<string, any>;
    }>): Promise<string[] | null>;
    trackStream(encodedTrack: string, itag?: number | null): Promise<any | null>;
    getStreamFormats(encodedTrack: string, options?: {
        itag?: number;
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<NodeLinkStreamFormats>;
    loadStream(payload: {
        encodedTrack: string;
        volume?: number;
        position?: number;
        format?: 'raw' | 'pcm' | 'wav' | 'passthrough' | 'original' | 'source';
        itag?: number;
        filters?: IFilters | Record<string, any>;
    }, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        seekMode?: 'server' | 'pcm-trim';
        range?: string;
    }): Promise<{
        stream: NodeJS.ReadableStream;
        headers: Record<string, any>;
        statusCode: number;
    }>;
    subscribeLyrics(guildId: string, skipTrackSource?: boolean): Promise<void>;
    unsubscribeLyrics(guildId: string): Promise<void>;
}
