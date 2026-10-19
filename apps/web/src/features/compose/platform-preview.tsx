'use client';
import type {Platform} from '../../../../../packages/shared/src/domain.ts';
import type {VariantDraft} from './compose-model.ts';
import {platformLabel} from '../../lib/ui/status.ts';

export function PlatformPreview({platform,variant,body,onCaption}:{platform:Platform;variant:VariantDraft|undefined;body:string;onCaption:(caption:string)=>void}){
  const ratio=platform==='INSTAGRAM'?'4 / 5':platform==='TIKTOK'||platform==='YOUTUBE'?'9 / 16':'16 / 9';
  return <div className="compose-preview"><div className="compose-preview__frame" style={{aspectRatio:ratio}}><span>Xem trước nội dung · {platformLabel(platform)}</span></div><div className="field"><label htmlFor="compose-caption">Chú thích {platformLabel(platform)}</label><textarea id="compose-caption" rows={4} value={variant?.caption??body} onChange={event=>onCaption(event.target.value)}/></div>{variant?.skippedReason?<p className="feedback feedback--error">{variant.skippedReason}</p>:null}{variant?.issues.map(issue=><p className={'feedback '+(issue.severity==='error'?'feedback--error':'')} key={issue.code}>{issue.message}</p>)}</div>;
}
