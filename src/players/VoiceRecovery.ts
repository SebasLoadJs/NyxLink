import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';

/** Internal recovery transaction shared by worker failures and special voice closes. */
export async function recoverVoicePlayer(
    node: Node, player: Player, active: () => boolean,
    options: { label: string; destroyReason: string; resetReconnectAttempts?: boolean },
): Promise<'recovered' | 'failed' | 'cancelled' | 'busy'> {
    if (!active()) return 'cancelled';
    if (player.get('voiceCloseRecoveryInProgress')) return 'busy';
    const debug = (message: string) => {
        // An observer must not turn a successful recovery into player destruction.
        try { node.manager.emit('debug', message); } catch { /* observer failure */ }
    };
    player.set('voiceCloseRecoveryInProgress', true);
    try {
        await player.disconnect();
        if (!active()) return 'cancelled';
        try { await node.rest.destroyPlayer(player.guildId); }
        catch { /* The old remote player may already be gone. */ }
        if (!active()) return 'cancelled';
        await new Promise<void>(resolve => setTimeout(resolve, 750));
        if (!active()) return 'cancelled';
        await player.connect();
        if (!active()) return 'cancelled';
        // restart's own fallback must not destroy playback after a newer intent
        // invalidates this transaction while the REST acknowledgement is pending.
        const restarted = await player.restart({ destroyOnFailure: false });
        if (!active()) return 'cancelled';
        if (!restarted) {
            debug(`NyxLink > ${options.label} recovery was not acknowledged for ${player.guildId}.`);
            return 'failed';
        }
        if (options.resetReconnectAttempts) player.set('wsReconnectAttempts', 0);
        return 'recovered';
    } catch {
        if (!active()) return 'cancelled';
        debug(`NyxLink > ${options.label} recovery failed for ${player.guildId}.`);
        if (!active()) return 'cancelled';
        await player.destroy(options.destroyReason);
        return 'failed';
    } finally {
        player.set('voiceCloseRecoveryInProgress', false);
    }
}
