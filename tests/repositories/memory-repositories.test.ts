import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {runRepositoryContract} from './repository-contract.ts';

runRepositoryContract('memory', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  return {repos, reset: async () => {}, close: async () => {}};
});
