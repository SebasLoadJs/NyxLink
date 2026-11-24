"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverVoicePlayer = recoverVoicePlayer;
async function recoverVoicePlayer(node, player, active, options) {
    if (!active())
        return 'cancelled';
    if (player.get('voiceCloseRecoveryInProgress'))
        return 'busy';
    const debug = (message) => {
        try {
            node.manager.emit('debug', message);
        }
        catch { }
    };
    player.set('voiceCloseRecoveryInProgress', true);
    try {
        await player.disconnect();
        if (!active())
            return 'cancelled';
        try {
            await node.rest.destroyPlayer(player.guildId);
        }
        catch { }
        if (!active())
            return 'cancelled';
        await new Promise(resolve => setTimeout(resolve, 750));
        if (!active())
            return 'cancelled';
        await player.connect();
        if (!active())
            return 'cancelled';
        const restarted = await player.restart({ destroyOnFailure: false });
        if (!active())
            return 'cancelled';
        if (!restarted) {
            debug(`NyxLink > ${options.label} recovery was not acknowledged for ${player.guildId}.`);
            return 'failed';
        }
        if (options.resetReconnectAttempts)
            player.set('wsReconnectAttempts', 0);
        return 'recovered';
    }
    catch {
        if (!active())
            return 'cancelled';
        debug(`NyxLink > ${options.label} recovery failed for ${player.guildId}.`);
        if (!active())
            return 'cancelled';
        await player.destroy(options.destroyReason);
        return 'failed';
    }
    finally {
        player.set('voiceCloseRecoveryInProgress', false);
    }
}
//# sourceMappingURL=VoiceRecovery.js.map