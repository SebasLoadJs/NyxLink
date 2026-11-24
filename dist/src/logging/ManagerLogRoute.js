"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimManagerLogRoute = claimManagerLogRoute;
exports.getManagerLogRoute = getManagerLogRoute;
const owners = new WeakMap();
function claimManagerLogRoute(manager, route) {
    if (owners.has(manager))
        throw new Error('Manager already has a logging route');
    owners.set(manager, route);
    return () => {
        if (owners.get(manager) === route)
            owners.delete(manager);
    };
}
function getManagerLogRoute(manager) {
    return owners.get(manager);
}
//# sourceMappingURL=ManagerLogRoute.js.map