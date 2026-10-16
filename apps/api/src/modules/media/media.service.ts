import {id} from '../../../../../packages/shared/src/ids.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export interface ObjectStorage {
  putSignedUrl(key: string, mime: string, ttl: number): Promise<string>;
  getSignedUrl(key: string, ttl: number): Promise<string>;
}
export class InMemoryObjectStorage implements ObjectStorage {
  async putSignedUrl(key: string, _mime: string, ttl: number) {return `https://storage.local/put/${encodeURIComponent(key)}?ttl=${ttl}`}
  async getSignedUrl(key: string, ttl: number) {return `https://storage.local/get/${encodeURIComponent(key)}?ttl=${ttl}`}
}

export class MediaService {
  private readonly repos: Repositories;
  private readonly storage: ObjectStorage;
  constructor(repos: Repositories, storage: ObjectStorage) {this.repos = repos; this.storage = storage}

  async createUpload(access: {workspaceId: string; brandId: string}, input: {type: 'VIDEO' | 'IMAGE'; mimeType: string; category?: string}) {
    if (!input.mimeType.startsWith('video/') && !input.mimeType.startsWith('image/')) throw new Error('INVALID_MIME');
    const assetId = id('media'), category = (input.category ?? 'raw').replace(/[^a-z0-9_-]/gi, '');
    if (!category) throw new Error('INVALID_CATEGORY');
    const key = `workspace/${access.workspaceId}/brand/${access.brandId}/media/${category}/${crypto.randomUUID()}`;
    await this.repos.media.insert({id: assetId, workspaceId: access.workspaceId, brandId: access.brandId, type: input.type, storageKey: key, mimeType: input.mimeType});
    return {assetId, storageKey: key, uploadUrl: await this.storage.putSignedUrl(key, input.mimeType, 900)};
  }

  async download(access: {workspaceId: string; brandId: string}, assetId: string) {
    const asset = await this.repos.media.get(assetId);
    if (!asset || asset.brandId !== access.brandId || asset.workspaceId !== access.workspaceId) throw new Error('MEDIA_NOT_FOUND');
    return this.storage.getSignedUrl(asset.storageKey, 900);
  }
}
