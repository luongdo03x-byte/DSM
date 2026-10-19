export class SlidingWindowLimiter{
  private readonly limit:number;private readonly windowMs:number;private readonly now:()=>number;private readonly sleep:(ms:number)=>Promise<void>;
  private readonly hits=new Map<string,number[]>();private readonly tails=new Map<string,Promise<void>>();
  constructor(opts:{limit:number;windowMs:number;now?:()=>number;sleep?:(ms:number)=>Promise<void>}){
    if(!Number.isSafeInteger(opts.limit)||opts.limit<1||!Number.isFinite(opts.windowMs)||opts.windowMs<=0)throw new Error('INVALID_RATE_LIMIT');
    this.limit=opts.limit;this.windowMs=opts.windowMs;this.now=opts.now??Date.now;this.sleep=opts.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  }
  async acquire(key:string):Promise<void>{
    const previous=this.tails.get(key)??Promise.resolve();let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve});const tail=previous.then(()=>hold);this.tails.set(key,tail);
    await previous;
    try{
      for(;;){
        const now=this.now(),recent=(this.hits.get(key)??[]).filter(time=>time>now-this.windowMs);
        if(recent.length<this.limit){recent.push(now);this.hits.set(key,recent);return}
        this.hits.set(key,recent);await this.sleep(Math.max(1,recent[0]!+this.windowMs-now));
      }
    }finally{release();if(this.tails.get(key)===tail)this.tails.delete(key)}
  }
}
