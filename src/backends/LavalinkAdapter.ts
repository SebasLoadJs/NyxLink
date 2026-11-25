import { BackendAdapter, type BackendPlugin } from './BackendAdapter';

export class LavalinkAdapter extends BackendAdapter {
    public readonly kind = 'lavalink' as const;
    constructor(version: string, capabilities: Set<string>, plugins: readonly BackendPlugin[] = []) {
        super(version, capabilities, plugins, 'lavalink');
    }
}
