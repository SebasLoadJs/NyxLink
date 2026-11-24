import type { Manager } from '../core/Manager';
import type { AuroraEvents } from './AuroraEvents';

// One automatic canonical event subscription per manager.
const owners = new WeakMap<Manager, AuroraEvents>();
export function claimManagerLogRoute(manager: Manager, route: AuroraEvents): () => void {
    if (owners.has(manager)) throw new Error('Manager already has a logging route');
    owners.set(manager, route);
    return () => {
        if (owners.get(manager) === route) owners.delete(manager);
    };
}
export function getManagerLogRoute(manager: Manager): AuroraEvents | undefined {
    return owners.get(manager);
}
