export interface EncryptedSecret{ciphertext:string;iv:string;authTag:string}
function bytesToB64(x:Uint8Array){return Buffer.from(x).toString('base64url')} function b64ToBytes(x:string){return new Uint8Array(Buffer.from(x,'base64url'))}
export class CredentialCryptoService{
 private key:CryptoKey|undefined; private raw:Uint8Array;
 constructor(keyBytes:Uint8Array){if(keyBytes.byteLength!==32)throw new Error('CREDENTIAL_KEY_MUST_BE_32_BYTES');this.raw=keyBytes}
 private async getKey(){if(!this.key)this.key=await crypto.subtle.importKey('raw',this.raw,{name:'AES-GCM'},false,['encrypt','decrypt']);return this.key}
 async encrypt(plaintext:string,aad:string):Promise<EncryptedSecret>{const iv=crypto.getRandomValues(new Uint8Array(12));const data=new TextEncoder().encode(plaintext),extra=new TextEncoder().encode(aad);const enc=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:extra,tagLength:128},await this.getKey(),data));const body=enc.slice(0,-16),tag=enc.slice(-16);return {ciphertext:bytesToB64(body),iv:bytesToB64(iv),authTag:bytesToB64(tag)}}
 async decrypt(s:EncryptedSecret,aad:string){const data=new Uint8Array([...b64ToBytes(s.ciphertext),...b64ToBytes(s.authTag)]);const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(s.iv),additionalData:new TextEncoder().encode(aad),tagLength:128},await this.getKey(),data);return new TextDecoder().decode(out)}
}
