import type { Manager } from '../core/Manager';
import type { SearchResult } from '../structures/SearchResult';
import type { IRESTLoadTracks, ISearchQuery } from '../typings/Interfaces';
export declare class SearchService {
    private readonly manager;
    private readonly native;
    private readonly cache;
    private readonly cacheNodeIds;
    private nextCacheNodeId;
    private readonly pending;
    private readonly shared;
    constructor(manager: Manager, native: (query: ISearchQuery) => Promise<IRESTLoadTracks | null>);
    close(): void;
    private wait;
    private present;
    search(query: ISearchQuery): Promise<SearchResult>;
    private runSearch;
}
