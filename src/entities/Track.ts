import { readNodeLinkMediaMetadata, type NodeLinkMediaMetadata } from '../backends/NodeLinkMediaMetadata';
import { readLavaSrcTrackMetadata, type LavaSrcTrackMetadata } from '../backends/LavaSrcMetadata';
import { readHoloTrackMetadata, type HoloTrackMetadata } from '../backends/HoloTrackMetadata';
import { ITrack, ITrackInfo } from "../typings/Interfaces";
import { Structure } from "../Util";
import { TPartialTrackProperties } from "../typings/types";
import type { BackendKind } from '../backends/BackendAdapter';

export class Track {
    public readonly encoded: string;
    public title: string;
    public author: string;
    public duration?: number;
    public identifier?: string;
    public isSeekable?: boolean;
    public isStream?: boolean;
    public uri?: string | null;
    public artworkUrl?: string | null;
    public isrc?: string | null;
    public sourceName?: string;
    public position?: number;
    public time?: number;
    public requester: any;
    public origin?: string;
    public backend?: BackendKind;
    public pluginInfo: Record<string, any>;
    public userData: Record<string, any>;
    public retries: number = 0;
    private isPartial: boolean = false;
    #partialTrackOptions: readonly TPartialTrackProperties[];
    // Keep wire metadata intact even when the public projection omits fields.
    #originalInfo: ITrackInfo;

    constructor(data: ITrack | Record<string, any>, requester?: any, origin?: string, partialTrackOptions: readonly TPartialTrackProperties[] = Structure.getManager()?.options?.trackPartial ?? []) {
        // Internal callers pass their owning manager's preferences explicitly. The
        // default retains compatibility with legacy standalone Track construction.
        this.#partialTrackOptions = Array.isArray(partialTrackOptions) ? [...partialTrackOptions] : [];
        const normalized = this.normalizeTrackData(data);

        this.encoded = normalized.encoded;
        this.#originalInfo = { ...normalized.info };
        this.title = normalized.info.title;
        this.author = normalized.info.author;
        this.requester = requester || normalized.userData?.requester;
        this.origin = origin;
        if (data.backend === 'lavalink' || data.backend === 'nodelink') this.backend = data.backend;
        this.pluginInfo = normalized.pluginInfo ?? {};
        this.userData = normalized.userData ?? {};

        const trackProps = this.createPropertySetters(normalized.info);

        if (this.#partialTrackOptions.length > 0) {
            this.isPartial = true;
            trackProps.title();
            trackProps.author();
            
            this.#partialTrackOptions.forEach(prop => {
                if (prop in trackProps) {
                    trackProps[prop as keyof typeof trackProps]();
                }
            });
        } else {
            Object.values(trackProps).forEach(setter => setter());
        }

        if (this.requester) {
            if (!this.userData) this.userData = {};
            this.userData.requester = this.requester;
        }

        Object.keys(this).forEach(key => {
            if (this[key as keyof this] === undefined) {
                delete this[key as keyof this];
            }
        });
    }

    private normalizeTrackData(data: ITrack | Record<string, any>): ITrack {
        if (data && typeof data === "object" && "info" in data && data.info) {
            const withInfo = data as ITrack;
            return {
                encoded: withInfo.encoded,
                info: withInfo.info,
                pluginInfo: withInfo.pluginInfo ?? {},
                userData: withInfo.userData ?? {},
            };
        }

        const flat = data as Record<string, any>;
        return {
            encoded: flat.encoded,
            info: {
                title: flat.title,
                author: flat.author,
                length: flat.duration ?? flat.length,
                identifier: flat.identifier,
                isSeekable: flat.isSeekable,
                isStream: flat.isStream,
                uri: flat.uri ?? null,
                artworkUrl: flat.artworkUrl ?? null,
                isrc: flat.isrc ?? null,
                sourceName: flat.sourceName,
                position: flat.position ?? 0,
            },
            pluginInfo: flat.pluginInfo ?? {},
            userData: flat.userData ?? {},
        };
    }

    private createPropertySetters(info: ITrackInfo): Record<string, () => void> {
        return {
            title: () => (this.title = info.title),
            author: () => (this.author = info.author),
            duration: () => (this.duration = info.length),
            identifier: () => (this.identifier = info.identifier),
            isSeekable: () => (this.isSeekable = info.isSeekable),
            isStream: () => (this.isStream = info.isStream),
            uri: () => (this.uri = info.uri),
            artworkUrl: () => (this.artworkUrl = info.artworkUrl || null),
            isrc: () => (this.isrc = info.isrc || null),
            sourceName: () => (this.sourceName = info.sourceName),
            position: () => (this.position = info.position || 0),
            time: () => (this.time = 0)
        };
    }

    /** Native NodeLink Holo enrichment, when supplied by the backend. */
    public getHoloMetadata(): HoloTrackMetadata | undefined {
        return readHoloTrackMetadata(this.pluginInfo);
    }

    /** Optional LavaSrc-compatible provider metadata, not a playback guarantee. */
    public getLavaSrcMetadata(): LavaSrcTrackMetadata | undefined {
        return readLavaSrcTrackMetadata(this.pluginInfo);
    }

    /** Optional rich media supplied by a compatible NodeLink server. */
    public getNodeLinkMediaMetadata(): NodeLinkMediaMetadata | undefined {
        return readNodeLinkMediaMetadata(this.pluginInfo);
    }

    public isPartialTrack(): boolean {
        return this.isPartial;
    }

    public get thumbnail(): string | null {
        if (this.artworkUrl) return this.artworkUrl;
        const info = this.getInfo();
        if (info.artworkUrl) return info.artworkUrl;
        if (info.sourceName === "youtube" && info.identifier) {
            return `https://img.youtube.com/vi/${info.identifier}/mqdefault.jpg`;
        }
        return null;
    }

    public setRequester(requester: any): this {
        this.requester = requester;
        if (this.requester) {
            if(!this.userData) this.userData = {};
            this.userData.requester = this.requester;
        }
        return this;
    }

    public setPosition(position: number): this {
        this.position = position;
        return this;
    }

    public clone(): Track {
        // Do not share mutable provider/user metadata between separate queue
        // entries. This also makes unsupported cyclic data fail before the
        // caller can insert a partially cloned playback entry.
        const record = this.toJSON();
        const userData = JSON.parse(JSON.stringify(this.userData));
        const pluginInfo = JSON.parse(JSON.stringify(this.pluginInfo));
        const newTrack = new (Structure.get("Track"))(
            { ...record, userData, pluginInfo }, this.requester, this.origin, this.#partialTrackOptions
        );
        newTrack.retries = this.retries;
        return newTrack;
    }

    /** Complete wire metadata, independent of trackPartial projection. */
    public getInfo(): ITrackInfo {
        const original = this.#originalInfo;
        return {
            title: this.title,
            author: this.author,
            length: this.duration ?? original.length,
            identifier: this.identifier ?? original.identifier,
            isSeekable: this.isSeekable ?? original.isSeekable,
            isStream: this.isStream ?? original.isStream,
            uri: this.uri === undefined ? original.uri : this.uri,
            artworkUrl: this.artworkUrl === undefined ? original.artworkUrl ?? null : this.artworkUrl,
            isrc: this.isrc === undefined ? original.isrc ?? null : this.isrc,
            sourceName: this.sourceName ?? original.sourceName,
            position: this.position ?? original.position ?? 0,
        };
    }

    public toJSON(): ITrack {
        return {
            encoded: this.encoded,
            info: this.getInfo(),
            pluginInfo: this.pluginInfo,
            userData: this.userData,
            backend: this.backend,
        };
    }
}
