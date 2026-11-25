import { BackendAdapter, type BackendPlugin } from './BackendAdapter';

export class NodeLinkAdapter extends BackendAdapter {
    public readonly kind = 'nodelink' as const;
    constructor(version: string, capabilities: Set<string>, plugins: readonly BackendPlugin[] = []) {
        super(version, capabilities, plugins, 'nodelink');
    }
}
