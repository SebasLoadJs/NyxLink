import type { Manager, TerminalCoordinator, BootstrapOptions, BootstrapSnapshot } from 'nyxlink';
export function runAuroraBootstrap(manager: Manager, clientId: string, terminal: TerminalCoordinator, options?: Omit<BootstrapOptions,'onSnapshot'>): Promise<BootstrapSnapshot>;
