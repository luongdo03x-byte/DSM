'use client';
import {useCallback,useEffect,useReducer,useRef,useState} from 'react';
import Link from 'next/link';
import type {ContentItem,ContentVariant,Platform,SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import type {PreflightIssue} from '../../../../../packages/shared/src/preflight.ts';
import {browserApi} from '../../lib/browser-runtime.ts';
import {uploadMediaAsset} from '../../lib/media-upload.ts';
import {toUtcMs} from '../../lib/ui/brand-time.ts';
import {platformLabel} from '../../lib/ui/status.ts';
import {PageHeader} from '../../components/ui/page-header.tsx';
import {Card} from '../../components/ui/card.tsx';
import {MediaStrip} from './media-strip.tsx';
import {CropDialog} from './crop-dialog.tsx';
import {PlatformPreview} from './platform-preview.tsx';
import {SchedulePicker} from './schedule-picker.tsx';
import {composeReducer,emptyComposeState,hashtagsFromCaption,isDirty,publishableTargets,type ComposeState} from './compose-model.ts';
import {TikTokSettings} from './tiktok-settings.tsx';
import {canSubmit,tiktokSettingsState} from './tiktok-settings-model.ts';
import type {TikTokCreatorInfo,TikTokPostSettings} from '../../../../api/src/integrations/tiktok/tiktok.adapter.ts';

type Validation={socialAccountId:string;platform:Platform;valid:boolean;errors?:string[];warnings?:string[]};
type PublishResult={results?:Array<{jobId?:string;socialAccountId:string}>};
const json={headers:{'content-type':'application/json'}};
const path=(brandId:string,contentId:string)=>`/brands/${brandId}/content/${contentId}`;

export function ComposePage({brandId,contentId:initialContentId}:{brandId:string;contentId?:string}){
  const [state,dispatch]=useReducer(composeReducer,undefined,emptyComposeState);
  const stateRef=useRef(state);stateRef.current=state;
  const contentIdRef=useRef(initialContentId);
  const saveQueue=useRef<Promise<void>>(Promise.resolve());
  const originalOrder=useRef<Record<string,number>>({});
  const [accounts,setAccounts]=useState<SocialAccount[]>([]);
  const [timeZone,setTimeZone]=useState('Asia/Ho_Chi_Minh');
  const [activePlatform,setActivePlatform]=useState<Platform>('FACEBOOK');
  const [cropTarget,setCropTarget]=useState<string>();
  const [uploading,setUploading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [saveLabel,setSaveLabel]=useState('');
  const [validation,setValidation]=useState<Validation[]>([]);
  const [tiktokCreator,setTiktokCreator]=useState<(TikTokCreatorInfo&{auditApproved:boolean})>();

  useEffect(()=>{let mounted=true;void Promise.all([
    browserApi.request<SocialAccount[]>(`/brands/${brandId}/accounts`),
    browserApi.request<{timezone:string}>(`/brands/${brandId}`),
    initialContentId?browserApi.request<ContentItem&{mediaAssetIds:string[]}>(path(brandId,initialContentId)):Promise.resolve(null)
  ]).then(async([accountRows,brand,item])=>{
    if(!mounted)return;setAccounts(accountRows);setTimeZone(brand.timezone||'Asia/Ho_Chi_Minh');
    if(initialContentId){
      if(!item)throw new Error('CONTENT_NOT_FOUND');
      for(const field of ['type','title','body','hook','cta'] as const)dispatch({type:'setField',field,value:(item[field]??(field==='type'?'TEXT':'')) as never});
      item.mediaAssetIds.forEach((id,index)=>{originalOrder.current[id]=index+1});dispatch({type:'setMedia',mediaAssetIds:item.mediaAssetIds});
      const variants=await browserApi.request<ContentVariant[]>(`${path(brandId,initialContentId)}/variants`);
      if(mounted){for(const variant of variants)dispatch({type:'editVariant',platform:variant.platform,patch:{variantId:variant.id,caption:variant.caption??'',hashtags:variant.hashtags,...(variant.title?{title:variant.title}:{}),...(variant.format?{format:variant.format}:{}),...(variant.skippedReason?{skippedReason:variant.skippedReason}:{}),...(variant.tiktokSettings?{tiktokSettings:variant.tiktokSettings}:{})}});setTimeout(()=>dispatch({type:'markSaved'}),0)}
    }
  }).catch(()=>{if(mounted)setError('Không thể tải dữ liệu Composer.')});return()=>{mounted=false}},[brandId,initialContentId]);

  useEffect(()=>{const listener=(event:BeforeUnloadEvent)=>{if(isDirty(stateRef.current)){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener)},[]);
  useEffect(()=>{const account=accounts.find(row=>row.platform==='TIKTOK'&&state.selectedAccountIds.includes(row.id));if(!account){setTiktokCreator(undefined);return}let mounted=true;void browserApi.request<TikTokCreatorInfo&{auditApproved:boolean}>(`/brands/${brandId}/accounts/${account.id}/tiktok/creator-info`).then(info=>{if(mounted)setTiktokCreator(info)}).catch(()=>{if(mounted)setError('Không thể tải cài đặt tài khoản TikTok.')});return()=>{mounted=false}},[accounts,brandId,state.selectedAccountIds]);
  useEffect(()=>{if(!isDirty(state)||!state.title.trim())return;const timer=setTimeout(()=>{void saveDraft()},800);return()=>clearTimeout(timer)},[state.type,state.title,state.body,state.hook,state.cta,state.mediaAssetIds,state.variants.TIKTOK?.tiktokSettings]);

  const saveDraft=useCallback(async():Promise<string|undefined>=>{
    let savedId:string|undefined;
    saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
      const current=stateRef.current;
      if(!current.title.trim())return;
      if(current.type==='ALBUM'&&current.mediaAssetIds.length<2)return;
      if((current.type==='IMAGE'||current.type==='VIDEO')&&!current.mediaAssetIds.length)return;
      setSaveLabel('Đang lưu bản nháp...');
      const payload={type:current.type,title:current.title,body:current.body,hook:current.hook,cta:current.cta,mediaAssetIds:current.mediaAssetIds};
      const id=contentIdRef.current;
      if(id){await browserApi.request(path(brandId,id),{method:'PATCH',...json,body:JSON.stringify(payload)});if(current.type!=='TEXT')await browserApi.request(`${path(brandId,id)}/media`,{method:'PUT',...json,body:JSON.stringify({mediaAssetIds:current.mediaAssetIds})});savedId=id}
      else{const created=await browserApi.request<ContentItem>(`/brands/${brandId}/content`,{method:'POST',...json,body:JSON.stringify(payload)});contentIdRef.current=created.id;savedId=created.id;window.history.replaceState(null,'',`/app/brands/${brandId}/compose/${created.id}`)}
      const tiktokSettings=current.variants.TIKTOK?.tiktokSettings;
      if(savedId&&tiktokSettings&&Object.keys(tiktokSettings).length){
        const rows=await browserApi.request<ContentVariant[]>(`${path(brandId,savedId)}/variants/copy`,{method:'POST'});
        const tiktok=rows.find(row=>row.platform==='TIKTOK');
        if(tiktok)await browserApi.request(`${path(brandId,savedId)}/variants/${tiktok.id}`,{method:'PATCH',...json,body:JSON.stringify({tiktokSettings})});
      }
      dispatch({type:'markSaved',snapshot:current});setSaveLabel('Đã lưu bản nháp');
    });
    try{await saveQueue.current;return savedId??contentIdRef.current}catch{setSaveLabel('Chưa lưu được bản nháp');setError('Không thể lưu bản nháp. Vui lòng thử lại.');return undefined}
  },[brandId]);

  async function upload(files:FileList|null){if(!files?.length)return;setUploading(true);setError('');try{const ids=await Promise.all([...files].map(file=>uploadMediaAsset(browserApi,brandId,file)));const start=Object.keys(originalOrder.current).length;ids.forEach((id,index)=>{originalOrder.current[id]=start+index+1});dispatch({type:'setMedia',mediaAssetIds:[...stateRef.current.mediaAssetIds,...ids]})}catch{setError('Không thể tải media. Hãy kiểm tra định dạng và thử lại.')}finally{setUploading(false)}}

  async function prepareVariants(id:string,current:ComposeState){
    const rows=await browserApi.request<ContentVariant[]>(`${path(brandId,id)}/variants/copy`,{method:'POST'});
    for(const row of rows){
      const draft=current.variants[row.platform];
      dispatch({type:'editVariant',platform:row.platform,patch:{variantId:row.id,...(row.format?{format:row.format}:{}),caption:draft?.caption??row.caption??current.body,hashtags:draft?.hashtags??hashtagsFromCaption(current.body),mediaOrder:draft?.mediaOrder??current.mediaAssetIds,...(row.skippedReason?{skippedReason:row.skippedReason}:{})}});
    }
    return rows;
  }

  async function publish(){
    setBusy(true);setError('');setSuccess('');setValidation([]);
    try{
      const current=stateRef.current;
      if(!current.selectedAccountIds.length)throw new Error('Hãy chọn ít nhất một tài khoản.');
      if(current.selectedAccountIds.some(accountId=>current.accountPlatforms[accountId]==='TIKTOK')){const settings=current.variants.TIKTOK?.tiktokSettings;if(!tiktokCreator||!canSubmit(settings??{},tiktokSettingsState(tiktokCreator,tiktokCreator.auditApproved)))throw new Error('Hãy chọn quyền riêng tư và kiểm tra cài đặt TikTok.');}
      if(current.type==='ALBUM'&&current.mediaAssetIds.length<2)throw new Error('Album cần ít nhất 2 ảnh.');
      const id=await saveDraft();if(!id)throw new Error('Hãy nhập tiêu đề và media hợp lệ.');
      const rows=await prepareVariants(id,current);
      const issuesByPlatform=new Map<Platform,PreflightIssue[]>();
      for(const platform of new Set(current.selectedAccountIds.map(accountId=>current.accountPlatforms[accountId]!))){
        const row=rows.find(value=>value.platform===platform);if(!row)continue;
        const draft=current.variants[platform];
        if(draft?.mediaOrder.length){await browserApi.request(`${path(brandId,id)}/variants/${row.id}/media`,{method:'PUT',...json,body:JSON.stringify({items:draft.mediaOrder.map(assetId=>({mediaAssetId:assetId,isCover:assetId===(draft.coverAssetId??draft.mediaOrder[0]),...(draft.crops[assetId]?{crop:draft.crops[assetId]}:{})}))})})}
        if(!row.skippedReason)await browserApi.request(`${path(brandId,id)}/variants/${row.id}`,{method:'PATCH',...json,body:JSON.stringify({caption:draft?.caption??current.body,body:current.body,hashtags:draft?.hashtags??hashtagsFromCaption(current.body),cta:current.cta,status:'READY',...(platform==='TIKTOK'?{tiktokSettings:{disableComment:tiktokCreator?.commentDisabled??false,disableDuet:tiktokCreator?.duetDisabled??false,disableStitch:tiktokCreator?.stitchDisabled??false,brandContentToggle:false,brandOrganicToggle:false,...draft?.tiktokSettings}}:{})})});
        const response=await browserApi.request<{issues:PreflightIssue[]}>(`${path(brandId,id)}/variants/${row.id}/preflight`);issuesByPlatform.set(platform,response.issues);dispatch({type:'applyPreflight',platform,issues:response.issues});
      }
      const localTargets=publishableTargets({...current,variants:Object.fromEntries(rows.map(row=>[row.platform,{...current.variants[row.platform],platform:row.platform,variantId:row.id,issues:issuesByPlatform.get(row.platform)??[],skippedReason:row.skippedReason}])) as ComposeState['variants']});
      const candidates=localTargets.filter(target=>!target.blocked).map(target=>target.accountId);
      if(!candidates.length)throw new Error('Không có tài khoản nào vượt qua kiểm tra nội dung.');
      const validationRows=await browserApi.request<Validation[]>(`/brands/${brandId}/publish/validate`,{method:'POST',...json,body:JSON.stringify({contentId:id,socialAccountIds:candidates})});setValidation(validationRows);
      const validIds=validationRows.filter(row=>row.valid).map(row=>row.socialAccountId);
      if(!validIds.length)throw new Error('Không có tài khoản nào sẵn sàng đăng.');
      let scheduledAt:number|undefined;
      if(current.schedule.mode==='at'){
        if(!current.schedule.date||!current.schedule.time)throw new Error('Hãy chọn ngày và giờ lên lịch.');
        scheduledAt=toUtcMs(current.schedule.date,current.schedule.time,timeZone);
        if(scheduledAt<Date.now()+300_000)throw new Error('Lịch đăng cần cách hiện tại ít nhất 5 phút.');
        if(scheduledAt>Date.now()+75*86_400_000)throw new Error('Lịch đăng tối đa 75 ngày.');
      }
      const result=await browserApi.request<PublishResult>(`/brands/${brandId}/publish`,{method:'POST',...json,body:JSON.stringify({contentId:id,socialAccountIds:validIds,...(scheduledAt?{scheduledAt}:{})})});
      const count=result.results?.filter(row=>row.jobId).length??0;setSuccess(`Đã đưa ${count} bài vào hàng đợi`);
    }catch(cause){setError(cause instanceof Error&&/^[À-ỹ]/u.test(cause.message)?cause.message:'Không thể xuất bản. Hãy kiểm tra nội dung và tài khoản rồi thử lại.')}finally{setBusy(false)}
  }

  const selectedPlatforms=[...new Set(state.selectedAccountIds.map(id=>state.accountPlatforms[id]!).filter(Boolean))];
  return <div className="section-stack"><PageHeader title="Tạo bài" description="Soạn nội dung gốc, kiểm tra từng nền tảng và chọn thời điểm đăng." actions={<Link className="ui-button ui-button--ghost" href={`/app/brands/${brandId}/content`}>Về thư viện</Link>}/>
    {error?<div className="feedback feedback--error" role="alert">{error}</div>:null}{success?<div className="feedback feedback--success" role="status">{success}</div>:null}
    <div className="compose-layout"><Card><h2>Nội dung gốc</h2><div className="form-grid">
      <div className="field"><label htmlFor="compose-type">Loại nội dung</label><select id="compose-type" value={state.type} onChange={event=>dispatch({type:'setField',field:'type',value:event.target.value as ComposeState['type']})}><option value="TEXT">Văn bản</option><option value="IMAGE">Hình ảnh</option><option value="ALBUM">Album</option><option value="VIDEO">Video</option></select></div>
      <div className="field"><label htmlFor="compose-title">Tiêu đề</label><input id="compose-title" value={state.title} onChange={event=>dispatch({type:'setField',field:'title',value:event.target.value})} onBlur={()=>void saveDraft()}/></div>
      <div className="field field--wide"><label htmlFor="compose-body">Nội dung gốc</label><textarea id="compose-body" rows={5} value={state.body} onChange={event=>dispatch({type:'setField',field:'body',value:event.target.value})} onBlur={()=>void saveDraft()}/></div>
      <div className="field"><label htmlFor="compose-hook">Mở đầu</label><input id="compose-hook" value={state.hook} onChange={event=>dispatch({type:'setField',field:'hook',value:event.target.value})} onBlur={()=>void saveDraft()}/></div>
      <div className="field"><label htmlFor="compose-cta">Lời kêu gọi</label><input id="compose-cta" value={state.cta} onChange={event=>dispatch({type:'setField',field:'cta',value:event.target.value})} onBlur={()=>void saveDraft()}/></div>
    </div><p className="muted">{saveLabel||'Bản nháp sẽ tự lưu khi bạn rời ô nhập.'}</p>
    {state.type!=='TEXT'?<div className="field"><label htmlFor="compose-media">Tệp ảnh hoặc video</label><input id="compose-media" type="file" multiple={state.type==='ALBUM'} accept={state.type==='VIDEO'?'video/*':'image/*'} onChange={event=>void upload(event.target.files)}/>{uploading?<small>Đang tải tệp...</small>:null}<MediaStrip ids={state.mediaAssetIds} originalOrder={originalOrder.current} onReorder={(from,to)=>dispatch({type:'reorderMedia',from,to})} onRemove={index=>dispatch({type:'setMedia',mediaAssetIds:state.mediaAssetIds.filter((_,i)=>i!==index)})}/></div>:null}</Card>
    <Card><h2>Tài khoản nhận bài</h2><div className="account-choice-list">{accounts.map(account=><label className="account-choice" key={account.id}><input type="checkbox" checked={state.selectedAccountIds.includes(account.id)} onChange={()=>{dispatch({type:'toggleAccount',accountId:account.id,platform:account.platform});setActivePlatform(account.platform)}}/><span><strong>{platformLabel(account.platform)}</strong><br/><small>{account.username??account.id}</small></span></label>)}</div><SchedulePicker schedule={state.schedule} timeZone={timeZone} onChange={schedule=>dispatch({type:'setSchedule',schedule})}/><div className="form-actions"><button className="ui-button ui-button--ghost" type="button" onClick={()=>void saveDraft()}>Lưu bản nháp</button><button className="ui-button ui-button--primary" type="button" disabled={busy||uploading} onClick={()=>void publish()}>{busy?'Đang kiểm tra...':state.schedule.mode==='at'?'Lên lịch':'Đăng ngay'}</button></div></Card></div>
    {selectedPlatforms.length?<Card><h2>Xem trước theo nền tảng</h2><div className="studio-platform-tabs" role="tablist" aria-label="Xem trước nền tảng">{selectedPlatforms.map(platform=><button key={platform} role="tab" aria-selected={activePlatform===platform} type="button" onClick={()=>setActivePlatform(platform)}>{platformLabel(platform)}</button>)}</div><PlatformPreview platform={activePlatform} variant={state.variants[activePlatform]} body={state.body} onCaption={caption=>dispatch({type:'editVariant',platform:activePlatform,patch:{caption,hashtags:hashtagsFromCaption(caption)}})}/>{activePlatform==='TIKTOK'&&tiktokCreator?<TikTokSettings creatorInfo={tiktokCreator} auditApproved={tiktokCreator.auditApproved} settings={state.variants.TIKTOK?.tiktokSettings??{}} onChange={(tiktokSettings:Partial<TikTokPostSettings>)=>dispatch({type:'editVariant',platform:'TIKTOK',patch:{tiktokSettings}})}/>:null}{state.mediaAssetIds.length?<div className="row-actions">{state.mediaAssetIds.map(id=><span key={id}><button type="button" className="ui-button ui-button--ghost" onClick={()=>dispatch({type:'setCover',platform:activePlatform,mediaAssetId:id})}>Đặt ảnh bìa {id.slice(-6)}</button><button type="button" className="ui-button ui-button--ghost" onClick={()=>setCropTarget(id)}>Cắt ảnh</button></span>)}</div>:null}</Card>:null}
    {validation.length?<Card><h2>Kiểm tra xuất bản</h2>{validation.map(row=><p key={row.socialAccountId}>{platformLabel(row.platform)}: {row.valid?'Sẵn sàng':row.errors?.join(', ')}</p>)}</Card>:null}
    {cropTarget?<CropDialog onClose={()=>setCropTarget(undefined)} onApply={crop=>{dispatch({type:'setCrop',platform:activePlatform,mediaAssetId:cropTarget,crop});setCropTarget(undefined)}}/>:null}
  </div>;
}
