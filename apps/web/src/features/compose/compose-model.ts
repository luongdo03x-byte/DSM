import type {ContentFormat,ContentType,CropBox,Platform} from '../../../../../packages/shared/src/domain.ts';
import type {PreflightIssue} from '../../../../../packages/shared/src/preflight.ts';
export interface VariantDraft{variantId?:string;platform:Platform;format?:ContentFormat;caption:string;title?:string;hashtags:string[];mediaOrder:string[];crops:Record<string,CropBox>;coverAssetId?:string;issues:PreflightIssue[];skippedReason?:string}
export interface ComposeSnapshot{type:ContentType;title:string;body:string;hook:string;cta:string;mediaAssetIds:string[];selectedAccountIds:string[];accountPlatforms:Record<string,Platform>;variants:Record<string,VariantDraft>;schedule:{mode:'now'}|{mode:'at';date:string;time:string}}
export interface ComposeState extends ComposeSnapshot{contentId?:string;saved:ComposeSnapshot}
export type ComposeAction=
  |{type:'setField';field:'title'|'body'|'hook'|'cta';value:string}
  |{type:'setField';field:'type';value:ContentType}
  |{type:'setMedia';mediaAssetIds:string[]}
  |{type:'reorderMedia';from:number;to:number}
  |{type:'setCrop';platform:Platform;mediaAssetId:string;crop:CropBox}
  |{type:'setCover';platform:Platform;mediaAssetId:string}
  |{type:'toggleAccount';accountId:string;platform:Platform}
  |{type:'editVariant';platform:Platform;patch:Partial<VariantDraft>}
  |{type:'applyPreflight';platform:Platform;issues:PreflightIssue[]}
  |{type:'setSchedule';schedule:ComposeSnapshot['schedule']}
  |{type:'markSaved'};

function snapshot(state:ComposeState):ComposeSnapshot{
  const {type,title,body,hook,cta,mediaAssetIds,selectedAccountIds,accountPlatforms,variants,schedule}=state;
  return structuredClone({type,title,body,hook,cta,mediaAssetIds,selectedAccountIds,accountPlatforms,variants,schedule});
}
function variantFor(state:ComposeState,platform:Platform):VariantDraft{return state.variants[platform]??{platform,caption:'',hashtags:[],mediaOrder:[...state.mediaAssetIds],crops:{},issues:[]}}
function mediaChanged(state:ComposeState,nextMedia:string[]):Record<string,VariantDraft>{
  return Object.fromEntries(Object.entries(state.variants).map(([platform,variant])=>[platform,{...variant,mediaOrder:JSON.stringify(variant.mediaOrder)===JSON.stringify(state.mediaAssetIds)?[...nextMedia]:variant.mediaOrder}]));
}
export function emptyComposeState():ComposeState{
  const base:ComposeSnapshot={type:'TEXT',title:'',body:'',hook:'',cta:'',mediaAssetIds:[],selectedAccountIds:[],accountPlatforms:{},variants:{},schedule:{mode:'now'}};
  return{...base,saved:structuredClone(base)};
}
export function composeReducer(state:ComposeState,action:ComposeAction):ComposeState{
  switch(action.type){
    case'setField':return{...state,[action.field]:action.value};
    case'setMedia':return{...state,mediaAssetIds:[...action.mediaAssetIds],variants:mediaChanged(state,action.mediaAssetIds)};
    case'reorderMedia':{
      if(action.from<0||action.from>=state.mediaAssetIds.length||action.to<0||action.to>=state.mediaAssetIds.length)return state;
      const mediaAssetIds=[...state.mediaAssetIds],item=mediaAssetIds.splice(action.from,1)[0]!;mediaAssetIds.splice(action.to,0,item);
      return{...state,mediaAssetIds,variants:mediaChanged(state,mediaAssetIds)};
    }
    case'setCrop':{
      const variant=variantFor(state,action.platform);
      return{...state,variants:{...state.variants,[action.platform]:{...variant,crops:{...variant.crops,[action.mediaAssetId]:action.crop}}}};
    }
    case'setCover':return{...state,variants:{...state.variants,[action.platform]:{...variantFor(state,action.platform),coverAssetId:action.mediaAssetId}}};
    case'toggleAccount':{
      const selected=state.selectedAccountIds.includes(action.accountId);
      return{...state,selectedAccountIds:selected?state.selectedAccountIds.filter(id=>id!==action.accountId):[...state.selectedAccountIds,action.accountId],accountPlatforms:{...state.accountPlatforms,[action.accountId]:action.platform}};
    }
    case'editVariant':return{...state,variants:{...state.variants,[action.platform]:{...variantFor(state,action.platform),...action.patch,platform:action.platform}}};
    case'applyPreflight':return{...state,variants:{...state.variants,[action.platform]:{...variantFor(state,action.platform),issues:[...action.issues]}}};
    case'setSchedule':return{...state,schedule:action.schedule};
    case'markSaved':return{...state,saved:snapshot(state)};
  }
}
export function isDirty(state:ComposeState):boolean{return JSON.stringify(snapshot(state))!==JSON.stringify(state.saved)}
export function publishableTargets(state:ComposeState):{accountId:string;platform:Platform;blocked:boolean;reasons:string[]}[]{
  return state.selectedAccountIds.map(accountId=>{
    const platform=state.accountPlatforms[accountId]!,variant=state.variants[platform];
    const reasons=variant?[...(variant.skippedReason?[variant.skippedReason]:[]),...variant.issues.filter(issue=>issue.severity==='error').map(issue=>issue.message)]:['Chưa có biến thể cho nền tảng này'];
    return{accountId,platform,blocked:reasons.length>0,reasons};
  });
}
export function hashtagsFromCaption(caption:string):string[]{
  return [...new Set([...caption.matchAll(/(?<![\p{L}\p{N}_])#([\p{L}\p{M}\p{N}_]+)/gu)].map(match=>match[1]!))];
}
