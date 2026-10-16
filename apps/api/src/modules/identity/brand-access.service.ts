import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export class BrandAccessService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {this.repos = repos}
  async assertAccess(userId: string, brandId: string) {
    const brand = await this.repos.brands.get(brandId);
    if (!brand) throw new Error('BRAND_NOT_FOUND');
    const members = await this.repos.memberships.findBy({userId, workspaceId: brand.workspaceId});
    if (!members.length) throw new Error('BRAND_NOT_FOUND');
    return {workspaceId: brand.workspaceId, brandId, role: members[0]!.role};
  }
}
