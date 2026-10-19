type LocalParts={year:number;month:number;day:number;hour:number;minute:number;offset:string};
const pad=(value:number)=>String(value).padStart(2,'0');

function localParts(ms:number,timeZone:string):LocalParts{
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
  const parts=Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part=>[part.type,part.value]));
  return{year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute),offset:parts.timeZoneName??'GMT'};
}

export function toUtcMs(localDate:string,localTime:string,timeZone:string):number{
  const date=/^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate),time=/^(\d{2}):(\d{2})$/.exec(localTime);
  if(!date||!time)throw new Error('INVALID_LOCAL_TIME');
  const [year,month,day,hour,minute]=[Number(date[1]),Number(date[2]),Number(date[3]),Number(time[1]),Number(time[2])];
  const desired=Date.UTC(year,month-1,day,hour,minute);
  const checked=new Date(desired);
  if(checked.getUTCFullYear()!==year||checked.getUTCMonth()+1!==month||checked.getUTCDate()!==day||hour>23||minute>59)throw new Error('INVALID_LOCAL_TIME');
  let guess=desired;
  for(let n=0;n<4;n++){
    const found=localParts(guess,timeZone);
    const represented=Date.UTC(found.year,found.month-1,found.day,found.hour,found.minute);
    const delta=desired-represented;
    if(delta===0)return guess;
    guess+=delta;
  }
  throw new Error('INVALID_LOCAL_TIME');
}

export function fromUtcMs(ms:number,timeZone:string):{date:string;time:string;label:string}{
  const value=localParts(ms,timeZone),date=`${value.year}-${pad(value.month)}-${pad(value.day)}`,time=`${pad(value.hour)}:${pad(value.minute)}`;
  return{date,time,label:`${time}, ${pad(value.day)}/${pad(value.month)}/${value.year} (${value.offset})`};
}

export function monthGrid(year:number,month1to12:number,_timeZone:string):{date:string;inMonth:boolean}[][]{
  if(!Number.isInteger(year)||!Number.isInteger(month1to12)||month1to12<1||month1to12>12)throw new Error('INVALID_MONTH');
  const first=new Date(Date.UTC(year,month1to12-1,1));
  const mondayOffset=(first.getUTCDay()+6)%7;
  const cells=Array.from({length:42},(_,index)=>{
    const day=new Date(Date.UTC(year,month1to12-1,1-mondayOffset+index));
    return{date:`${day.getUTCFullYear()}-${pad(day.getUTCMonth()+1)}-${pad(day.getUTCDate())}`,inMonth:day.getUTCMonth()+1===month1to12};
  });
  return Array.from({length:6},(_,week)=>cells.slice(week*7,week*7+7));
}
