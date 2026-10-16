import {id} from '../../../../../packages/shared/src/ids.ts';
import type {Product} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {AuditService} from '../audit/audit.service.ts';

function money(value?: string) {
  if (value !== undefined && !/^\d+(\.\d{1,4})?$/.test(value)) throw new Error('INVALID_MONEY');
  return value;
}

export class ProductsService {
  private readonly repos: Repositories;
  private readonly audit: AuditService | undefined;
  constructor(repos: Repositories, audit?: AuditService) {this.repos = repos; this.audit = audit}

  async create(brandId: string, input: Omit<Product, 'id' | 'brandId' | 'status'> & {status?: Product['status']}): Promise<Product> {
    if (input.landingUrl) new URL(input.landingUrl);
    if (input.supplierUrl) new URL(input.supplierUrl);
    const product: Product = {...input, id: id('prd'), brandId, status: input.status ?? 'DRAFT', currency: input.currency,
      ...(money(input.cost) !== undefined ? {cost: money(input.cost)!} : {}),
      ...(money(input.sellingPrice) !== undefined ? {sellingPrice: money(input.sellingPrice)!} : {})};
    return this.repos.products.insert(product);
  }

  async list(brandId: string, includeArchived = false): Promise<Product[]> {
    const products = await this.repos.products.findBy({brandId});
    return products.filter(product => includeArchived || product.status !== 'ARCHIVED');
  }

  async get(brandId: string, idv: string): Promise<Product> {
    const product = await this.repos.products.get(idv);
    if (!product || product.brandId !== brandId) throw new Error('PRODUCT_NOT_FOUND');
    return product;
  }

  async archive(brandId: string, idv: string, userId?: string): Promise<Product> {
    await this.get(brandId, idv);
    if (!this.audit) return this.repos.products.update(idv, {status: 'ARCHIVED'});
    const workspaceId = await this.audit.workspaceForBrand(brandId);
    return this.repos.transaction(async tx => {
      const product = await tx.products.update(idv, {status: 'ARCHIVED'});
      await this.audit!.record({workspaceId, ...(userId ? {userId} : {}), action: 'PRODUCT_ARCHIVE', entityType: 'PRODUCT', entityId: idv}, tx);
      return product;
    });
  }
}
