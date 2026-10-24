'use client';
import {useState} from 'react';
import type {Platform} from '../../../../../packages/shared/src/domain.ts';
import type {CaptionSuggestion} from '../../../../api/src/modules/ai/schemas.ts';
import type {PreflightIssue} from '../../../../../packages/shared/src/preflight.ts';
import {browserApi} from '../../lib/browser-runtime.ts';
import {platformLabel} from '../../lib/ui/status.ts';

type Suggestion=CaptionSuggestion&{issues:PreflightIssue[]};
export function AiPanel({brandId,platform,saveDraft,onApply}:{brandId:string;platform:Platform;saveDraft:()=>Promise<string|undefined>;onApply:(suggestion:Suggestion)=>void}){
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function generate(){
    setBusy(true);setError('');setSuggestions([]);
    try{
      const contentId=await saveDraft();
      if(!contentId){setError('Hãy nhập tiêu đề và lưu nội dung hợp lệ trước khi tạo gợi ý.');return}
      const result=await browserApi.request<{suggestions:Suggestion[]}>(`/brands/${brandId}/ai/captions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contentId,platforms:[platform],variantsPerPlatform:3})});
      setSuggestions(result.suggestions.filter(item=>item.platform===platform));
    }catch{setError('Không thể tạo gợi ý AI. Hãy kiểm tra cấu hình AI hoặc thử lại sau.')}
    finally{setBusy(false)}
  }
  return <section className="ai-panel" aria-label={`Gợi ý AI ${platformLabel(platform)}`}>
    <button className="ui-button ui-button--ghost" type="button" disabled={busy} onClick={()=>void generate()}>{busy?'Đang tạo gợi ý...':'Gợi ý bằng AI'}</button>
    {error?<p className="feedback feedback--error" role="alert">{error}</p>:null}
    {suggestions.length?<div className="ai-panel__suggestions">{suggestions.map((item,index)=><article className="ai-panel__suggestion" key={`${platform}-${index}`}><strong>Gợi ý {index+1}</strong><p>{item.caption}</p><small>{item.rationale}</small>{item.issues.map(issue=><p className="feedback" key={issue.code}>{issue.message}</p>)}<button className="ui-button ui-button--secondary" type="button" onClick={()=>{onApply(item);setSuggestions([])}}>Dùng gợi ý {index+1}</button></article>)}</div>:null}
  </section>;
}
