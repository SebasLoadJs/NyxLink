import { Manager } from "../core/Manager";
import { encodeTrack, makeRequest } from "../Util";
import { providerUrl, providerSignal } from "../http/RequestPolicy";
import { HttpPolicyError } from "../errors/HttpPolicyError";
import type { ITrack, ITrackInfo, ISpotifyOptions } from "../typings/Interfaces";

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const TOKEN_REFRESH_MARGIN = 60_000;

export class SpotifySource {
    public name = "Spotify";
    private readonly manager: Manager;
    private accessToken: string | null = null;
    private accessTokenExpiresAt: number | null = null;
    private tokenInitialized = false;

    constructor(manager: Manager) {
        this.manager = manager;
        this.manager.options.spotify = this.manager.options?.spotify ?? {};
        this.manager.emit("debug", "Moonlink.js > Spotify > Source loaded");
    }

    private get options(): ISpotifyOptions {
        return this.manager.options.spotify ?? {};
    }

    public match(query: string): boolean {
        return (
            query.includes("spotify.com") ||
            query.startsWith("spotify:") ||
            query.startsWith("spsearch:") ||
            query.startsWith("sprec:")
        );
    }

    private isTokenValid(token: string | null, expiresAt: number | null): boolean {
        if (!token) return false;
        if (!expiresAt) return true;
        return Date.now() < expiresAt - TOKEN_REFRESH_MARGIN;
    }

    private setAccessToken(token: string, expiresInMs?: number): void {
        this.accessToken = token;
        if (expiresInMs) {
            this.accessTokenExpiresAt = Date.now() + expiresInMs;
        }
    }

    private getActiveToken(): string | null {
        if (this.isTokenValid(this.accessToken, this.accessTokenExpiresAt)) {
            return this.accessToken;
        }
        return null;
    }

    private async fetchOfficialToken(signal?: AbortSignal): Promise<boolean> {
        const { clientId, clientSecret } = this.options;
        if (!clientId || !clientSecret) return false;

        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const tokenData = await makeRequest<{ access_token: string; expires_in: number }>(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",
                headers: {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: "grant_type=client_credentials", signal: providerSignal(signal),
                allowedOrigins: ["https://accounts.spotify.com"], throwOnError: true,
            }, 10000, 0
        );

        if (!tokenData?.access_token) {
            this.manager.emit("debug", "Moonlink.js > Spotify > Failed to refresh official token.");
            return false;
        }

        this.setAccessToken(tokenData.access_token, tokenData.expires_in * 1000);
        return true;
    }

    private async ensureTokens(signal?: AbortSignal): Promise<boolean> {
        if (this.tokenInitialized && this.getActiveToken()) return true;

        if (this.options.accessToken) {
            this.setAccessToken(this.options.accessToken, this.options.accessTokenExpiresAt ?? null);
            this.tokenInitialized = true;
            return true;
        }

        const success = await this.fetchOfficialToken(signal);
        this.tokenInitialized = success;
        return success;
    }

    private async apiRequest(path: string, signal?: AbortSignal): Promise<any | null> {
        const url = providerUrl(path, SPOTIFY_API_BASE_URL);
        signal?.throwIfAborted();
        const ok = await this.ensureTokens(signal);
        if (!ok) {
            this.manager.emit("debug", "Moonlink.js > Spotify > Tokens not available.");
            return null;
        }

        const token = this.getActiveToken();
        if (!token) return null;

        const res = await makeRequest<any>(url, {
            method: "GET", signal: providerSignal(signal), allowedOrigins: ["https://api.spotify.com"], throwOnError: true,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        }, 10000, 0);

        if (!res) {
            this.tokenInitialized = false;
            return null;
        }
        return res;
    }

    private buildTrack(item: any, uri?: string): ITrack {
        const trackUri = uri ?? item.uri ?? `https://open.spotify.com/track/${item.id}`;
        const info: ITrackInfo = {
            identifier: item.id ?? "local",
            uri: trackUri,
            title: item.name ?? "Unknown Title",
            author: item.artists?.map((a: any) => a.name).join(", ") ?? "Unknown Artist",
            length: item.duration_ms ?? 0,
            isSeekable: true,
            isStream: false,
            artworkUrl: item.album?.images?.[0]?.url ?? null,
            sourceName: "spotify",
            position: 0,
            isrc: item.external_ids?.isrc ?? null,
        };

        return {
            info,
            encoded: encodeTrack(info),
            pluginInfo: { MoonlinkInternal: true, needsStream: true },
            userData: {},
        };
    }

    public async search(query: string, options?: { limit?: number; signal?: AbortSignal }) {
        const limit = options?.limit ?? this.options.limitLoadSearch ?? 20;
        const data = await this.apiRequest(
            `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&market=${this.options.market ?? "US"}`, options?.signal
        );

        if (!data || data.error) {
            this.manager.emit("debug", `Moonlink.js > Spotify > Search failed.`);
            return { loadType: "error", data: { message: "Search failed on Spotify." } };
        }

        if (!data.tracks?.items?.length) {
            return { loadType: "empty", data: {} };
        }

        return {
            loadType: "search",
            data: data.tracks.items.map((t: any) => this.buildTrack(t)),
        };
    }

    public async load(rawUrl: string, options?: { limit?: number; signal?: AbortSignal }) {
        const normalized = rawUrl
            .replace(/open\.spotify\.com\/intl-[^/]+\//, "open.spotify.com/")
            .split("?")[0];

        if (normalized.startsWith("spsearch:")) {
            return this.search(normalized.slice(9).trim(), options);
        }

        if (normalized.startsWith("sprec:")) {
            return { loadType: "error", data: { message: "Spotify recommendations are disabled." } };
        }

        const link = this.getLinkType(normalized);
        if (!link) {
            return { loadType: "error", data: { message: "Invalid Spotify URL" } };
        }

        switch (link.type) {
            case "track": {
                const data = await this.apiRequest(`/tracks/${link.id}`, options?.signal);
                if (!data || data.error) {
                    return { loadType: "error", data: { message: "Track not found." } };
                }
                return { loadType: "track", data: this.buildTrack(data, normalized) };
            }

            case "artist": {
                const artistInfo = await this.apiRequest(`/artists/${link.id}`, options?.signal);
                const topTracks = await this.apiRequest(
                    `/artists/${link.id}/top-tracks?market=${this.options.market ?? "US"}`, options?.signal
                );
                if (!artistInfo || !topTracks?.tracks) {
                    return { loadType: "error", data: { message: "Artist not found." } };
                }

                let tracks = topTracks.tracks.map((t: any) => this.buildTrack(t));
                const max = options?.limit ?? this.options.limitLoadArtist;
                if (max != null) tracks = tracks.slice(0, max);

                return {
                    loadType: "playlist",
                    data: {
                        info: { name: `${artistInfo.name}'s Top Tracks`, selectedTrack: 0 },
                        tracks,
                    },
                };
            }

            case "album":
            case "playlist": {
                const base = link.type === "album" ? "albums" : "playlists";
                const pageLimit =
                    link.type === "playlist"
                        ? this.options.limitLoadPlaylistPage ?? 100
                        : this.options.limitLoadAlbumPage ?? 50;

                const data = await this.apiRequest(`/${base}/${link.id}?limit=${pageLimit}`, options?.signal);
                if (!data || data.error) {
                    return { loadType: "error", data: { message: `${link.type} not found.` } };
                }

                let items =
                    link.type === "playlist"
                        ? data.tracks.items.map((i: any) => i.track)
                        : data.tracks.items;
                items = items.filter(Boolean);

                let next = data.tracks.next;
                const max =
                    options?.limit ??
                    (link.type === "playlist"
                        ? this.options.limitLoadPlaylist ?? this.manager.options.search?.playlistLoadLimit
                        : this.options.limitLoadAlbum ?? this.manager.options.search?.playlistLoadLimit);

                const seen = new Set<string>();
                while (next && (!max || items.length < max)) {
                    const page = providerUrl(next, SPOTIFY_API_BASE_URL);
                    if (seen.has(page) || seen.size >= 100) throw new HttpPolicyError("pagination");
                    seen.add(page);
                    const nextPage = await this.apiRequest(page, options?.signal);
                    if (!nextPage || nextPage.error) break;
                    const newItems =
                        link.type === "playlist"
                            ? nextPage.items.map((i: any) => i.track)
                            : nextPage.items;
                    items.push(...newItems.filter(Boolean));
                    next = nextPage.next;
                }

                if (max != null) items = items.slice(0, max);

                const tracks = items.map((item: any) =>
                    this.buildTrack(item, item.external_urls?.spotify)
                );
                return {
                    loadType: "playlist",
                    data: { info: { name: data.name, selectedTrack: 0 }, tracks },
                };
            }

            default:
                return { loadType: "error", data: { message: "Unsupported Spotify URL type" } };
        }
    }

    private getLinkType(url: string): { type: string; id: string } | null {
        const regex: Record<string, RegExp> = {
            track: /(?:open\.spotify\.com\/(?:intl-[^/]+\/)?track\/|spotify:track:)(\w+)/,
            album: /(?:open\.spotify\.com\/(?:intl-[^/]+\/)?album\/|spotify:album:)(\w+)/,
            playlist: /(?:open\.spotify\.com\/(?:intl-[^/]+\/)?playlist\/|spotify:playlist:)(\w+)/,
            artist: /(?:open\.spotify\.com\/(?:intl-[^/]+\/)?artist\/|spotify:artist:)(\w+)/,
        };

        for (const type in regex) {
            const match = url.match(regex[type]);
            if (match) {
                return { type, id: match[1] };
            }
        }

        return null;
    }

    public resolve(url: string) {
        return this.load(url);
    }
}
