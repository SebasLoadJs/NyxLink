import type { Manager } from '../core/Manager';

// One manager may own only one automatic logging subscription, irrespective
// of which public configuration alias or manual attachment was used.
const owners = new WeakMap<Manager, symbol>();
export function claimManagerLogRoute(manager: Manager): () => void {
    if (owners.has(manager)) throw new Error('Manager already has a logging route');
    const owner = Symbol('manager-logging-route');
    owners.set(manager, owner);
    return () => {
        if (owners.get(manager) === owner) owners.delete(manager);
    };
}
