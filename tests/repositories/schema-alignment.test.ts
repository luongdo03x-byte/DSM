import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const schema = readFileSync(new URL('../../packages/database/prisma/schema.prisma', import.meta.url), 'utf8');

function model(name: string): string {
  return new RegExp(`model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1] ?? '';
}

function field(body: string, name: string): string {
  return new RegExp(`^\\s+${name}\\s+([^\\r\\n]+)`, 'm').exec(body)?.[1] ?? '';
}

test('Prisma schema represents the repository domain without losing credential or job fields', () => {
  const required: Record<string, string[]> = {
    PublishJob: ['scheduledAt', 'status', 'attemptCount', 'maxAttempts', 'idempotencyKey', 'remoteCorrelationId', 'errorCode', 'errorMessage'],
    ContentVariant: ['hashtags', 'assetId', 'status'],
    EncryptedCredential: ['ciphertext', 'iv', 'authTag', 'refreshCiphertext', 'expiresAt', 'scopes'],
    TrackedLink: ['code', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent'],
    BrowserRegistration: ['id', 'nodeId', 'tokenHash', 'expiresAt', 'consumedAt'],
  };
  const missing = Object.entries(required).flatMap(([name, names]) => names.filter(column => !field(model(name), column)).map(column => `${name}.${column}`));
  assert.deepEqual(missing, []);
  assert.match(field(model('PublishJob'), 'idempotencyKey'), /@unique/);
  assert.match(field(model('TrackedLink'), 'code'), /@unique/);
  assert.match(field(model('ContentVariant'), 'hashtags'), /^Json/);
  assert.match(field(model('PublishJob'), 'scheduledAt'), /^BigInt/);
  assert.match(field(model('EncryptedCredential'), 'expiresAt'), /^BigInt/);
});
