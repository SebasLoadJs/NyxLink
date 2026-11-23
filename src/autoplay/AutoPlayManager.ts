import type { Player } from '../entities/Player';
import type { Node } from '../entities/Node';
import type { Track } from '../entities/Track';
import { playbackGuard } from '../players/PlaybackGuard';

export class AutoPlayManager {
    public static async play(node: Node, player: Player, previous: Track): Promise<boolean> {
        if (!previous || player.destroyed || !player.autoPlay) return false;
        const guard = playbackGuard(player);
        const ticket = guard.ticket;
        const automaticTicket = guard.cancelAutoPlay();
        const active = () => guard.isCurrent(ticket) && guard.isAutoCurrent(automaticTicket) && player.autoPlay && !player.destroyed;

        if (!player.recommendations.length) {
            try {
                await node.updateRecommendations(player, previous);
            } catch (error) {
                // Recommendation providers are optional. A failed lookup must
                // not reject TrackEnd handling or suppress queueEnd/autoLeave.
                player.manager.emit('debug', `NyxLink > AutoPlay > Recommendation lookup failed for guild ${player.guildId}: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        }
        if (!active() || player.queue.size > 0) return false;

        const candidates = player.recommendations.slice(0, 10);
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        if (!selected) return false;

        let accepted = false;
        try {
            accepted = await player.playAutoPlay(selected, ticket, automaticTicket);
        } catch (error) {
            // Unexpected backend/queue failures must not interrupt TrackEnd.
            player.manager.emit('debug', `NyxLink > AutoPlay > Recommendation playback failed for guild ${player.guildId}: ${error instanceof Error ? error.message : String(error)}`);
        }
        // playAutoPlay owns cleanup of any unconsumed automatic queue insertion.
        // Removing by Track identity here could erase a manual queue entry when
        // the listener reused that same Track instance during an HTTP request.
        if (!accepted || !active()) return false;

        player.recommendations = player.recommendations.filter(t => t.encoded !== selected.encoded);
        player.manager.emit('autoPlayed', player, selected, previous);
        return true;
    }
}
