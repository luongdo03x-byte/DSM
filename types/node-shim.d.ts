declare var process: { env: Record<string,string|undefined>; cwd(): string; exitCode?: number; argv: string[] };
declare var Buffer: any;
declare module 'node:crypto' { export const createHash:any, createHmac:any, randomBytes:any, randomUUID:any, timingSafeEqual:any, createCipheriv:any, createDecipheriv:any, argon2Sync:any; }
declare module 'node:fs' { export const existsSync:any, readFileSync:any, writeFileSync:any, mkdirSync:any, readdirSync:any, statSync:any, rmSync:any, cpSync:any; }
declare module 'node:path' { export const join:any, resolve:any, dirname:any, relative:any; }
declare module 'node:http' { export const createServer:any; }
declare module 'node:url' { export const fileURLToPath:any; }

declare module 'node:fs/promises' { export const readdir:any, stat:any, rm:any, mkdtemp:any, writeFile:any, readFile:any, mkdir:any, rename:any, utimes:any, access:any; }
