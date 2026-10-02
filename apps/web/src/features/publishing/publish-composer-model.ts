import type {PublishingService} from '../../../../api/src/modules/publishing/publishing.service.ts';
export class PublishComposerModel{
  private svc:PublishingService;private brandId:string;private contentId:string;private createdBy:string;private lastValid:string[]=[];private health:Record<string,boolean>={};
  constructor(svc:PublishingService,brandId:string,contentId:string,createdBy:string){this.svc=svc;this.brandId=brandId;this.contentId=contentId;this.createdBy=createdBy}
  async validate(accountIds:string[],apiHealth:Record<string,boolean>={}){this.health=apiHealth;const out=await this.svc.validateTargets({brandId:this.brandId,contentId:this.contentId,socialAccountIds:accountIds,apiHealth});this.lastValid=out.filter(x=>x.valid).map(x=>x.socialAccountId);return out}
  async submitValid(input:{schedule:'now'|'schedule';scheduledAt?:number}){if(!this.lastValid.length)throw new Error('NO_VALID_TARGETS');return this.svc.createBatch({brandId:this.brandId,contentId:this.contentId,createdBy:this.createdBy,socialAccountIds:this.lastValid,apiHealth:this.health,...(input.schedule==='schedule'&&input.scheduledAt!==undefined?{scheduledAt:input.scheduledAt}:{})})}
}
