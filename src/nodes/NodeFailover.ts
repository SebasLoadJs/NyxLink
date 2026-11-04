import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
import { playbackGuard } from '../players/PlaybackGuard';
import { delay } from '../Util';
import type { Manager } from '../core/Manager';
import { RecoveryQueue } from './RecoveryQueue';
import { retryDelay, retryJitter } from './RetryDelay';

export type FailoverOptions = { maxAttempts?: number; retryDelayMs?: number; retryJitter?: number; preserveOnFailure?: boolean };
export type FailoverResult = { status: 'recovered' | 'failed' | 'cancelled'; attempts: number; node?: Node; reason?: 'queue-full' };
const pending = new WeakMap<Player, Promise<FailoverResult>>();
const queues = new WeakMap<Manager, RecoveryQueue<FailoverResult>>();

export class NodeFailover {
    public static move(player: Player, source: Node, options: FailoverOptions = player.manager.options.node?.failover ?? {}): Promise<FailoverResult> {
        const existing = pending.get(player);
        if (existing) return existing;
        const guard = playbackGuard(player);
        const ticket = guard.ticket;
        const cancelled = () => player.destroyed || source.destroyed || player.manager.destroyed ||
            player.node !== source || !guard.isCurrent(ticket);
        // Publish the shared recovery before transfer callbacks can request it again.
        const operation = Promise.resolve().then(() => {
            if (cancelled()) return { status: 'cancelled' as const, attempts: 0 };
            let queue = queues.get(player.manager);
            if (!queue) {
                const settings = player.manager.options.node;
                queue = new RecoveryQueue<FailoverResult>(settings?.recoveryConcurrency, settings?.recoveryQueueLimit);
                queues.set(player.manager, queue);
            }
            return queue.run(() => {
                if (cancelled()) return Promise.resolve({ status: 'cancelled' as const, attempts: 0 });
                return this.attempt(player, source, options);
            }, () => {
                player.manager.emit('playerRecoveryFailed', player);
                return { status: 'failed', attempts: 0, reason: 'queue-full' };
            });
        }).finally(() => pending.delete(player));
        pending.set(player, operation);
        return operation;
    }

    private static async attempt(player: Player, source: Node, options: FailoverOptions): Promise<FailoverResult> {
        const maxAttempts = options.maxAttempts ?? 3;
        const baseDelay = options.retryDelayMs ?? 0;
        const jitter = retryJitter(options.retryJitter !== undefined ? options.retryJitter : player.manager.options.node?.retryJitter);
        if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 10 || !Number.isFinite(baseDelay) || baseDelay < 0 || baseDelay > 60000) {
            throw new TypeError('Failover requires maxAttempts 0..10 and retryDelayMs 0..60000');
        }
        const excluded = new Set([source.identifier]);
        // Unknown/confirmed identities cannot be treated as compatible codecs.
        for (const node of player.manager.nodes.nodes.values() as Iterable<Node>) {
            if (Boolean(node.backend) !== Boolean(source.backend)) excluded.add(node.identifier);
        }
        const guard = playbackGuard(player);
        let ticket = guard.ticket;
        let attempts = 0;
        while (attempts < maxAttempts) {
            if (player.destroyed || source.destroyed || player.manager.destroyed || !guard.isCurrent(ticket)) return { status: 'cancelled', attempts };
            const target = player.manager.nodes.findNode({ ...player.nodeSelection, exclude: [...excluded], allowUnhealthyFallback: false });
            if (!target) break;
            excluded.add(target.identifier);
            attempts++;
            const transferTicket = ticket + 1;
            const transferring = player.transferNode(target);
            // transferNode owns one increment; a listener may already have issued a newer command.
            if (guard.ticket > ticket) ticket = transferTicket;
            let restored = false;
            try { restored = await transferring; } catch { /* A different candidate may still recover the snapshot. */ }
            if (player.destroyed || source.destroyed || player.manager.destroyed || !guard.isCurrent(ticket)) return { status: 'cancelled', attempts };
            if (restored && player.node === target && target.connected && !target.destroyed) {
                return { status: 'recovered', attempts, node: target };
            }
            if (baseDelay && attempts < maxAttempts) await delay(retryDelay(baseDelay, 0, jitter, 60000));
        }
        player.manager.emit('playerRecoveryFailed', player);
        return { status: 'failed', attempts };
    }
}
