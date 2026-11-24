"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connector = void 0;
class Connector {
    attachedManager;
    get manager() {
        if (!this.attachedManager)
            throw new Error('Connector has no manager');
        return this.attachedManager;
    }
    set manager(manager) { this.attachedManager = manager; }
    setManager(manager) {
        this.manager = manager;
    }
}
exports.Connector = Connector;
//# sourceMappingURL=Connector.js.map