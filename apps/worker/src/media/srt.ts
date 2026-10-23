export interface SubtitleSegment{startMs:number;endMs:number;text:string}

function clock(ms:number):string{
  if(!Number.isSafeInteger(ms)||ms<0)throw new Error('SUBTITLE_TIME_INVALID');
  const hours=Math.floor(ms/3_600_000),minutes=Math.floor(ms%3_600_000/60_000),seconds=Math.floor(ms%60_000/1000),millis=ms%1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')},${String(millis).padStart(3,'0')}`;
}
function wrap(text:string,limit:number):string{
  const words=text.replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines:string[]=[];
  let line='';
  for(const word of words){
    if(word.length>limit)throw new Error('SUBTITLE_WORD_TOO_LONG');
    if(line&&line.length+1+word.length>limit){lines.push(line);line=word}else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  return lines.join('\n');
}
export function toSrt(segments:SubtitleSegment[],maxLineChars=42):string{
  if(!Number.isInteger(maxLineChars)||maxLineChars<1)throw new Error('SUBTITLE_LINE_LIMIT_INVALID');
  return segments.map((segment,index)=>{
    if(segment.endMs<=segment.startMs)throw new Error('SUBTITLE_TIME_INVALID');
    const text=wrap(segment.text,maxLineChars);
    if(!text)throw new Error('SUBTITLE_TEXT_EMPTY');
    return `${index+1}\n${clock(segment.startMs)} --> ${clock(segment.endMs)}\n${text}\n`;
  }).join('\n');
}
function milliseconds(value:string):number{
  const match=/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(value);
  if(!match)throw new Error('SUBTITLE_TIME_INVALID');
  return ((Number(match[1])*60+Number(match[2]))*60+Number(match[3]))*1000+Number(match[4]);
}
export function parseSrt(input:string):SubtitleSegment[]{
  return input.replace(/\r/g,'').trim().split(/\n\s*\n/).filter(Boolean).map((cue,index)=>{
    const [number,timing,...lines]=cue.split('\n');
    if(Number(number)!==index+1||!timing||!lines.length)throw new Error('SUBTITLE_SRT_INVALID');
    const match=/^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/.exec(timing);
    if(!match)throw new Error('SUBTITLE_SRT_INVALID');
    return{startMs:milliseconds(match[1]!),endMs:milliseconds(match[2]!),text:lines.join(' ').trim()};
  });
}
export function applyTranscriptCleanup(original:SubtitleSegment[],candidate:SubtitleSegment[]):{segments:SubtitleSegment[];warning?:string}{
  if(candidate.length!==original.length||candidate.some((row,index)=>row.startMs!==original[index]?.startMs||row.endMs!==original[index]?.endMs||!row.text.trim()))return{segments:original,warning:'SUBTITLE_TIMESTAMPS_CHANGED'};
  return{segments:candidate};
}
