/** A new intent cancels asynchronous work belonging to an older playback intent. */
export class PlaybackGuard {
    private generation = 0;
    private automaticGeneration = 0;
    private controller = new AbortController();

    public get ticket(): number { return this.generation; }
    /** Signal for bounded external reads belonging to the current playback intent. */
    public get signal(): AbortSignal { return this.controller.signal; }
    public get automaticTicket(): number { return this.automaticGeneration; }
    public invalidate(): number {
        this.controller.abort(new Error('Playback intent superseded'));
        this.controller = new AbortController();
        this.cancelAutoPlay();
        return ++this.generation;
    }
    public isCurrent(ticket: number): boolean { return ticket === this.generation; }
    public cancelAutoPlay(): number { return ++this.automaticGeneration; }
    public isAutoCurrent(ticket: number): boolean { return ticket === this.automaticGeneration; }
}

const guards = new WeakMap<object, PlaybackGuard>();

export function playbackGuard(player: object): PlaybackGuard {
    let guard = guards.get(player);
    if (!guard) {
        guard = new PlaybackGuard();
        guards.set(player, guard);
    }
    return guard;
}
