'use client';
import type {TikTokCreatorInfo,TikTokPostSettings} from '../../../../api/src/integrations/tiktok/tiktok.adapter.ts';
import {tiktokSettingsState} from './tiktok-settings-model.ts';

export function TikTokSettings({creatorInfo,auditApproved,settings,onChange}:{creatorInfo:TikTokCreatorInfo;auditApproved:boolean;settings:Partial<TikTokPostSettings>;onChange:(settings:Partial<TikTokPostSettings>)=>void}){
  const state=tiktokSettingsState(creatorInfo,auditApproved);
  const change=(patch:Partial<TikTokPostSettings>)=>onChange({...settings,...patch});
  return <fieldset className="section-stack"><legend>Cài đặt TikTok</legend>
    {state.notice?<p className="feedback">{state.notice}</p>:null}
    <div className="field"><label htmlFor="tiktok-privacy">Quyền riêng tư *</label><select id="tiktok-privacy" required value={settings.privacyLevel??''} onChange={event=>change({privacyLevel:event.target.value})}><option value="">Chọn quyền riêng tư</option>{state.privacyOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    {([['disableComment','Bình luận',state.commentLocked],['disableDuet','Duet',state.duetLocked],['disableStitch','Stitch',state.stitchLocked]] as const).map(([key,label,locked])=><label key={key}><input type="checkbox" checked={!locked&&!settings[key]} disabled={locked} onChange={event=>change({[key]:!event.target.checked})}/>{label}{locked?' (tài khoản đã tắt)':''}</label>)}
    <label><input type="checkbox" checked={settings.brandContentToggle??false} onChange={event=>change({brandContentToggle:event.target.checked})}/>Nội dung có thương hiệu</label>
    <label><input type="checkbox" checked={settings.brandOrganicToggle??false} onChange={event=>change({brandOrganicToggle:event.target.checked})}/>Nội dung quảng bá thương hiệu của tôi</label>
  </fieldset>;
}
