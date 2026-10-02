import {TaskExecutor} from '../tasks/task-executor.ts';
import {createGatewayServer} from '../http/server.ts';
import {GpmLoginClient} from '../providers/gpmlogin/gpmlogin.client.ts';
import {GpmLoginProvider} from '../providers/gpmlogin/gpmlogin.provider.ts';
import {PlaywrightDriverFactory} from '../playwright/page-driver.ts';
import {registerPublishHandler,type BrowserDriverFactory} from './publish-handler.ts';
import type {BrowserProvider} from '../../../../packages/browser-contracts/src/index.ts';

export interface BrowserGatewayRuntimeDeps{provider?:BrowserProvider;driverFactory?:BrowserDriverFactory;executor?:TaskExecutor}
export function createBrowserGatewayRuntime(env:Record<string,string|undefined>=process.env,deps:BrowserGatewayRuntimeDeps={}){
  const nodeId=env.BROWSER_NODE_ID;if(!nodeId)throw new Error('BROWSER_NODE_ID_REQUIRED');const nodeKey=env.BROWSER_NODE_KEY;if(!nodeKey)throw new Error('BROWSER_NODE_KEY_REQUIRED');
  const executor=deps.executor??new TaskExecutor(Number(env.BROWSER_MAX_CONCURRENCY??2));
  const provider=deps.provider??new GpmLoginProvider(new GpmLoginClient(env.GPMLOGIN_BASE_URL??'http://127.0.0.1:9495/api/v1',env.GPMLOGIN_ALLOW_NON_LOOPBACK==='1'));
  const driverFactory=deps.driverFactory??new PlaywrightDriverFactory();
  registerPublishHandler(executor,provider,driverFactory);
  const server=createGatewayServer({nodeId,nodeKey,executor,provider,replayWindowMs:Number(env.BROWSER_REPLAY_WINDOW_MS??60_000)});
  return{server,executor,provider,driverFactory,nodeId};
}
