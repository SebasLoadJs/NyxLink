import { AuroraEvents, AuroraInspectorStore, createAuroraPinoEngine, type Manager, type Player, type NyxExtension } from 'nyxlink';

/** A single native Pino destination. Attach only when Manager has no configured route. */
export function attachObservability(manager: Manager) {
    const store = new AuroraInspectorStore(manager);
    const engine = createAuroraPinoEngine('debug', (event, meta) => {
        store.recordEvent(event);
        process.stdout.write(JSON.stringify({...event, level: meta.level, msg: meta.msg})+'\n');
    });
    const route = new AuroraEvents({level:'debug',target:engine.target});
    route.attach(manager);
    return {store, close(){route.close();engine.close();}};
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
