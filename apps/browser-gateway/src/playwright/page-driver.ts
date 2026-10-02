import type {BrowserSession} from '../../../../packages/browser-contracts/src/index.ts';
import type {PageDriver} from '../platforms/page-driver.ts';
import type {BrowserDriverFactory,BrowserDriverSession} from '../runtime/publish-handler.ts';

type PageLike={goto(url:string,opts?:unknown):Promise<unknown>;locator(selector:string):any;url():string;waitForTimeout?(ms:number):Promise<void>};
type BrowserLike={contexts():Array<{pages():PageLike[];newPage():Promise<PageLike>}>;close():Promise<void>};
type ChromiumLike={connectOverCDP(endpoint:string):Promise<BrowserLike>};

async function firstExisting(page:PageLike,selectors:string[]){for(const selector of selectors){const loc=page.locator(selector).first();if(await loc.count()>0)return loc}return undefined}
export class PlaywrightPageDriver implements PageDriver{
  private page:PageLike;
  constructor(page:PageLike){this.page=page}
  async goto(url:string){await this.page.goto(url,{waitUntil:'domcontentloaded',timeout:30_000})}
  async setFile(selectors:string[],url:string){const loc=await firstExisting(this.page,selectors);if(!loc)return false;const response=await fetch(url);if(!response.ok)throw Object.assign(new Error(`MEDIA_DOWNLOAD_${response.status}`),{code:'BROWSER_ERROR',retryable:response.status>=500});const bytes=Buffer.from(await response.arrayBuffer()),contentType=response.headers.get('content-type')??'application/octet-stream';const name=new URL(url).pathname.split('/').pop()||'upload.bin';await loc.setInputFiles({name,mimeType:contentType,buffer:bytes});return true}
  async fill(selectors:string[],text:string){const loc=await firstExisting(this.page,selectors);if(!loc)return false;await loc.fill(text);return true}
  async click(selectors:string[]){const loc=await firstExisting(this.page,selectors);if(!loc)return false;await loc.click();return true}
  async permalink(){await this.page.waitForTimeout?.(750);const url=this.page.url();return /^https?:\/\//.test(url)?url:undefined}
}

export class PlaywrightDriverFactory implements BrowserDriverFactory{
  private loader:()=>Promise<{chromium:ChromiumLike}>;
  constructor(loader:()=>Promise<{chromium:ChromiumLike}>=async()=>await import('playwright') as any){this.loader=loader}
  async open(session:BrowserSession):Promise<BrowserDriverSession>{const endpoint=session.websocketDebuggingUrl??(session.remoteDebuggingPort?`http://127.0.0.1:${session.remoteDebuggingPort}`:undefined);if(!endpoint)throw Object.assign(new Error('CDP_ENDPOINT_MISSING'),{code:'BROWSER_ERROR',retryable:true});const {chromium}=await this.loader(),browser=await chromium.connectOverCDP(endpoint),context=browser.contexts()[0];if(!context){await browser.close();throw Object.assign(new Error('CDP_CONTEXT_MISSING'),{code:'BROWSER_ERROR',retryable:true})}const page=context.pages()[0]??await context.newPage();return{driver:new PlaywrightPageDriver(page),async close(){await browser.close()}}}
}
