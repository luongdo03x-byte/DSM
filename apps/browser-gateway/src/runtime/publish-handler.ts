import type {BrowserProvider,BrowserSession,CreateBrowserTaskRequest} from '../../../../packages/browser-contracts/src/index.ts';
import type {PageDriver} from '../platforms/page-driver.ts';
import {FacebookBrowserPublisher} from '../platforms/facebook/publisher.ts';
import {InstagramBrowserPublisher} from '../platforms/instagram/publisher.ts';
import {ThreadsBrowserPublisher} from '../platforms/threads/publisher.ts';
import {TikTokBrowserPublisher} from '../platforms/tiktok/publisher.ts';
import type {TaskExecutor} from '../tasks/task-executor.ts';

export interface BrowserDriverSession{driver:PageDriver;close():Promise<void>}
export interface BrowserDriverFactory{open(session:BrowserSession):Promise<BrowserDriverSession>}

export function registerPublishHandler(executor:TaskExecutor,provider:BrowserProvider,driverFactory:BrowserDriverFactory){
  executor.register('PUBLISH',async(req,ctx)=>{
    ctx.transition('STARTING_PROFILE');
    const browserSession=await provider.startProfile(req.profileId);
    ctx.transition('CONNECTING_BROWSER');
    const opened=await driverFactory.open(browserSession);
    try{
      ctx.transition('NAVIGATING');
      const payload=req.payload??{},input={...(typeof payload.mediaUrl==='string'?{mediaUrl:payload.mediaUrl}:{}),...(typeof payload.text==='string'?{text:payload.text}:{})};
      const onStep=(step:'UPLOADING'|'SUBMITTING'|'VERIFYING')=>ctx.transition(step);
      switch(req.platform){
        case 'FACEBOOK': return await new FacebookBrowserPublisher(opened.driver).publish(input,onStep);
        case 'INSTAGRAM': return await new InstagramBrowserPublisher(opened.driver).publish(input,onStep);
        case 'THREADS': return await new ThreadsBrowserPublisher(opened.driver).publish(input,onStep);
        case 'TIKTOK': return await new TikTokBrowserPublisher(opened.driver).publish(input,onStep);
        default: throw Object.assign(new Error('UNSUPPORTED_PLATFORM'),{code:'UNSUPPORTED_PLATFORM',retryable:false});
      }
    }finally{await opened.close()}
  });
}
