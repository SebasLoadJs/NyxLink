import type { Manager } from '../core/Manager';
import type { AuroraEvents } from './AuroraEvents';
export declare function claimManagerLogRoute(manager: Manager, route: AuroraEvents): () => void;
export declare function getManagerLogRoute(manager: Manager): AuroraEvents | undefined;
