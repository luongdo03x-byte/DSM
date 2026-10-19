import type {TikTokCreatorInfo,TikTokPostSettings} from '../../../../api/src/integrations/tiktok/tiktok.adapter.ts';

const labels:Record<string,string>={PUBLIC_TO_EVERYONE:'Mọi người',MUTUAL_FOLLOW_FRIENDS:'Bạn bè',FOLLOWER_OF_CREATOR:'Người theo dõi',SELF_ONLY:'Chỉ mình tôi'};
export function tiktokSettingsState(creatorInfo:TikTokCreatorInfo,auditApproved:boolean){
  return{privacyOptions:creatorInfo.privacyLevelOptions.filter(value=>auditApproved||value==='SELF_ONLY').map(value=>({value,label:labels[value]??value})),privacyRequired:true as const,commentLocked:creatorInfo.commentDisabled,duetLocked:creatorInfo.duetDisabled,stitchLocked:creatorInfo.stitchDisabled,...(!auditApproved?{notice:'Ứng dụng chưa được TikTok duyệt; chỉ có thể đăng ở chế độ Chỉ mình tôi.'}:{})};
}
export function canSubmit(settings:Partial<TikTokPostSettings>,state:ReturnType<typeof tiktokSettingsState>):boolean{
  if(!settings.privacyLevel||!state.privacyOptions.some(option=>option.value===settings.privacyLevel))return false;
  if(state.commentLocked&&settings.disableComment===false)return false;
  if(state.duetLocked&&settings.disableDuet===false)return false;
  if(state.stitchLocked&&settings.disableStitch===false)return false;
  return true;
}
