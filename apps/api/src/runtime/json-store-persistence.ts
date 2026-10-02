import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {MemoryStore} from '../../../../packages/shared/src/store.ts';

const mapFields=['users','workspaces','brands','products','media','contents','variants','campaigns','authSessions','socialAccounts','credentials','browserNodes','browserProfiles','browserRegistrations','publishBatches','publishJobs','publishedPosts','trackedLinks'] as const;
const arrayFields=['memberships','audit','publishAttempts','postMetrics','clickEvents'] as const;

type Snapshot={version:1;maps:Record<string,[string,unknown][]>;arrays:Record<string,unknown[]>};

export class JsonStorePersistence{
  private file:string;
  constructor(file:string){this.file=file}
  async load(){
    let raw:string;
    try{raw=await readFile(this.file,'utf8')}catch(error:any){if(error?.code==='ENOENT')return new MemoryStore();throw error}
    const parsed=JSON.parse(raw) as Snapshot;if(parsed.version!==1)throw new Error('UNSUPPORTED_STORE_SNAPSHOT');const store=new MemoryStore();
    for(const field of mapFields){const value=parsed.maps[field]??[];(store[field] as Map<string,unknown>).clear();for(const [key,item] of value)(store[field] as Map<string,unknown>).set(key,item)}
    for(const field of arrayFields){const target=store[field] as unknown[];target.splice(0,target.length,...(parsed.arrays[field]??[]))}
    return store
  }
  async save(store:MemoryStore){
    const maps:Record<string,[string,unknown][]>=Object.create(null),arrays:Record<string,unknown[]>=Object.create(null);
    for(const field of mapFields)maps[field]=[...(store[field] as Map<string,unknown>).entries()];
    for(const field of arrayFields)arrays[field]=[...(store[field] as unknown[])];
    const snapshot:Snapshot={version:1,maps,arrays};await mkdir(dirname(this.file),{recursive:true});const temporary=`${this.file}.tmp`;await writeFile(temporary,JSON.stringify(snapshot),'utf8');await rename(temporary,this.file)
  }
}
