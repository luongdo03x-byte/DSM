'use client';
import type {DragEvent} from 'react';

export function MediaStrip({ids,originalOrder,onReorder,onRemove}:{ids:string[];originalOrder:Record<string,number>;onReorder:(from:number,to:number)=>void;onRemove:(index:number)=>void}){
  function drop(event:DragEvent<HTMLLIElement>,to:number){event.preventDefault();const from=Number(event.dataTransfer.getData('text/plain'));if(Number.isInteger(from))onReorder(from,to)}
  return <ol className="compose-media-list" aria-label="Thứ tự ảnh và video">{ids.map((id,index)=><li key={id} className="compose-media-item" data-testid="compose-media-item" data-order={originalOrder[id]??index+1} draggable onDragStart={event=>event.dataTransfer.setData('text/plain',String(index))} onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event,index)}><strong>{index+1}</strong><span>Tệp {originalOrder[id]??index+1}</span><button type="button" aria-label={'Xóa tệp '+(index+1)} onClick={()=>onRemove(index)}>×</button></li>)}</ol>;
}
