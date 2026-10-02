export class MemorySession {
  private accessToken: string | undefined;
  getAccessToken(){ return this.accessToken; }
  setAccessToken(token:string){ this.accessToken=token; }
  clear(){ this.accessToken=undefined; }
  serialize(): Record<string,never>{ return {}; }
}
export const browserSession=new MemorySession();
