import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export class BrowserNodesService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {this.repos = repos}

  async heartbeat(nodeId: string, input: {status: 'ONLINE' | 'DEGRADED'; maxConcurrency?: number}) {
    const node = await this.repos.browserNodes.get(nodeId);
    if (!node) throw new Error('NODE_NOT_FOUND');
    return this.repos.browserNodes.update(nodeId, {status: input.status, lastSeenAt: Date.now(),
      ...(input.maxConcurrency !== undefined ? {maxConcurrency: input.maxConcurrency} : {})});
  }

  async getDispatchableNode(nodeId: string) {
    const node = await this.repos.browserNodes.get(nodeId);
    if (!node || node.status !== 'ONLINE' || !node.lastSeenAt || Date.now() - node.lastSeenAt > 45_000) throw new Error('NODE_UNAVAILABLE');
    return node;
  }
}
