'use client';
import {useState} from 'react';
import type {CropBox} from '../../../../../packages/shared/src/domain.ts';

export function CropDialog({onApply,onClose}:{onApply:(crop:CropBox)=>void;onClose:()=>void}){
  const [crop,setCrop]=useState<CropBox>({x:0,y:0,width:100,height:100});
  return <div className="compose-dialog-backdrop" role="presentation"><div className="ui-card compose-dialog" role="dialog" aria-modal="true" aria-label="Cắt ảnh"><h2>Cắt ảnh</h2><p>Nhập vùng cắt theo phần trăm ảnh gốc.</p><div className="form-grid">{(['x','y','width','height'] as const).map(key=><label className="field" key={key}>{key}<input type="number" min={key==='x'||key==='y'?0:1} max="100" value={crop[key]} onChange={event=>setCrop(current=>({...current,[key]:Number(event.target.value)}))}/></label>)}</div><div className="form-actions"><button type="button" className="ui-button ui-button--ghost" onClick={onClose}>Hủy</button><button type="button" className="ui-button ui-button--primary" onClick={()=>{if(crop.x+crop.width<=100&&crop.y+crop.height<=100&&crop.width>0&&crop.height>0)onApply(crop)}}>Áp dụng</button></div></div></div>;
}
