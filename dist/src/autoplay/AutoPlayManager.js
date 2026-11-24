"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoPlayManager = void 0;
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const RecommendationPreference_1 = require("./RecommendationPreference");
class AutoPlayManager {
    static async play(node, player, previous) {
        if (!previous || player.destroyed || !player.autoPlay)
            return false;
        const guard = (0, PlaybackGuard_1.playbackGuard)(player);
        const ticket = guard.ticket;
        const automaticTicket = guard.cancelAutoPlay();
        const active = () => guard.isCurrent(ticket) && guard.isAutoCurrent(automaticTicket) && player.autoPlay && !player.destroyed;
        if (!player.recommendations.length) {
            try {
                await node.updateRecommendations(player, previous);
            }
            catch (error) {
                player.manager.emit('debug', `NyxLink > AutoPlay > Recommendation lookup failed for guild ${player.guildId}: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        }
        if (!active() || player.queue.size > 0)
            return false;
        const candidates = (0, RecommendationPreference_1.preferredRecommendations)(player.recommendations.slice(0, 10), previous, player.guildId, player.manager.options.recommendations);
        if (!active() || player.queue.size > 0)
            return false;
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        if (!selected)
            return false;
        let accepted = false;
        try {
            accepted = await player.playAutoPlay(selected, ticket, automaticTicket);
        }
        catch (error) {
            player.manager.emit('debug', `NyxLink > AutoPlay > Recommendation playback failed for guild ${player.guildId}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!accepted || !active())
            return false;
        player.recommendations = player.recommendations.filter(t => t.encoded !== selected.encoded);
        player.manager.emit('autoPlayed', player, selected, previous);
        return true;
    }
}
exports.AutoPlayManager = AutoPlayManager;
//# sourceMappingURL=AutoPlayManager.js.map