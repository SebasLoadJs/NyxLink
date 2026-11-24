import { Manager, type Node, type NodeScoreWeights } from 'nyxlink';

/** The application chooses when to evaluate a destination; this never migrates a player. */
export function chooseDestination(manager: Manager, current: Node): Node | undefined {
  const scoreWeights: NodeScoreWeights = { players: 1, cpu: 100, memory: 20, latency: 0.1, priority: 1 };
  return manager.nodes.findNode({
    scoreWeights,
    preferredNode: current.identifier,
    minimumScoreImprovement: 2,
    allowUnhealthyFallback: false,
    preferSource: 'youtube',
  });
}
