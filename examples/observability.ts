import { Logger, JsonLogTransport, TerminalDashboard, type Manager, type LogTransport, type Player, type NyxExtension } from 'nyxlink';

/** The application owns the destination; a sink can forward to an existing logger. */
export function attachObservability(manager: Manager, transport?: LogTransport) {
    const logger = new Logger({
        profile: 'debug', mode: 'json',
        transports: [transport ?? new JsonLogTransport(process.stdout)],
        context: { application: 'music-bot' },
        maxQueue: 512, timelineLimit: 200, transportTimeoutMs: 1000,
        onTransportError(error) {
            // Application-owned fallback. Do not send this back into the same logger.
            process.stderr.write(error.message + '\n');
        },
    });
    const detach = logger.attachManager(manager);
    const dashboard = new TerminalDashboard(manager, logger, { mode: 'static' });
    const stop = dashboard.start();
    return {
        logger,
        showPlayerTrace(guildId: string) { return logger.playerTrace(guildId, { limit: 20 }); },
        async close() { stop(); detach(); await logger.close(); },
    };
}

/** Volumes for mix layers use 0..1; ordinary player volume uses a different scale. */
export async function overlay(player: Player, encoded: string) {
    const created = await player.addMix(encoded, { volume: 0.25 });
    if (!created) return;
    try {
        await player.updateMixVolume(created.id, 0.5);
        return await player.getMixes();
    } finally {
        // Backend auto-cleanup or a new lifecycle may already have removed it;
        // the application decides how to handle 404/cancellation errors.
        await player.removeMix(created.id);
    }
}

/** Inject an existing metrics sink; no metrics provider is installed by NyxLink. */
export function trackCounter(increment: () => void): NyxExtension {
    return { name: 'application.track-counter', setup(context) {
        context.on('trackStart', () => { increment(); });
    } };
}
