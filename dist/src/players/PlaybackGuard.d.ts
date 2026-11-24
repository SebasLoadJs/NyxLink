export declare class PlaybackGuard {
    private generation;
    private automaticGeneration;
    private controller;
    get ticket(): number;
    get signal(): AbortSignal;
    get automaticTicket(): number;
    invalidate(): number;
    isCurrent(ticket: number): boolean;
    cancelAutoPlay(): number;
    isAutoCurrent(ticket: number): boolean;
}
export declare function playbackGuard(player: object): PlaybackGuard;
