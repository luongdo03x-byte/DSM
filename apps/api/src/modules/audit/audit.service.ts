import {id} from '../../../../../packages/shared/src/ids.ts';
import {redact} from '../../../../../packages/shared/src/security.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export class AuditService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {this.repos = repos}

  async record(input: {workspaceId: string; userId?: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown>}, repos = this.repos): Promise<void> {
    await repos.audit.append({id: id('audit'), workspaceId: input.workspaceId, action: input.action, entityType: input.entityType, createdAt: Date.now(),
      ...(input.userId ? {userId: input.userId} : {}),
      ...(input.entityId ? {entityId: input.entityId} : {}),
      ...(input.metadata ? {metadata: redact(input.metadata) as Record<string, unknown>} : {})});
  }

  async workspaceForBrand(brandId: string): Promise<string> {
    const brand = await this.repos.brands.get(brandId);
    if (!brand) throw new Error('BRAND_NOT_FOUND');
    return brand.workspaceId;
  }
}
