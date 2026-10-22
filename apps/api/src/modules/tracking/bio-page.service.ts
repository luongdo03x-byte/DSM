import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {BioPageLink} from '../../../../../packages/shared/src/domain.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';

export class BioPageService {
  private readonly repos:Repositories;
  constructor(repos:Repositories){this.repos=repos}

  async save(brandId:string,input:{slug:string;title:string;links:BioPageLink[]}){
    const slug=input.slug.trim().toLowerCase(),title=input.title.trim();
    if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)||!title||title.length>160)throw new Error('INVALID_BIO_PAGE');
    if(!Array.isArray(input.links)||input.links.length>50)throw new Error('INVALID_BIO_PAGE');
    const seen=new Set<string>();
    for(const link of input.links){
      if(!link||typeof link.trackedLinkId!=='string'||typeof link.label!=='string'||!link.label.trim()||link.label.length>120||!Number.isInteger(link.position)||link.position<0||seen.has(link.trackedLinkId))throw new Error('INVALID_BIO_PAGE');
      seen.add(link.trackedLinkId);
      const tracked=await this.repos.trackedLinks.get(link.trackedLinkId);
      if(!tracked||tracked.brandId!==brandId)throw new Error('BIO_LINK_NOT_FOUND');
    }
    const existing=(await this.repos.bioPages.findBy({slug}))[0];
    if(existing&&existing.brandId!==brandId)throw new Error('BIO_SLUG_TAKEN');
    const page={id:existing?.id??id('bio'),brandId,slug,title,links:input.links.map(link=>({...link,label:link.label.trim()}))};
    return existing?this.repos.bioPages.update(existing.id,page):this.repos.bioPages.insert(page);
  }

  async getPublic(slug:string){
    const page=(await this.repos.bioPages.findBy({slug:slug.toLowerCase()}))[0];
    if(!page)throw new Error('BIO_PAGE_NOT_FOUND');
    const links=[];
    for(const item of [...page.links].sort((a,b)=>a.position-b.position)){
      const tracked=await this.repos.trackedLinks.get(item.trackedLinkId);
      if(tracked&&tracked.brandId===page.brandId)links.push({label:item.label,position:item.position,url:'/r/'+tracked.code});
    }
    return{slug:page.slug,title:page.title,links};
  }
}
