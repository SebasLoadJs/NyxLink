import { Manager } from "../core/Manager";

export abstract class Connector {
    private attachedManager?: Manager;
    public get manager(): Manager {
        if (!this.attachedManager) throw new Error('Connector has no manager');
        return this.attachedManager;
    }
    public set manager(manager: Manager) { this.attachedManager = manager; }

    public setManager(manager: Manager): void {
        this.manager = manager;
    }

    public dispose?(): void | Promise<void>;

    public abstract listen(client: any): void;
    public abstract send(guildId: string, payload: any): void;
}
