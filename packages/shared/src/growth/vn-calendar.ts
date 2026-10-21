export type VnEvent={date:string;name:string;kind:'HOLIDAY'|'SALE'|'SEASON'};
const fixed:[string,string][]=[['03-08','Ngày Quốc tế Phụ nữ'],['04-30','Ngày Giải phóng miền Nam'],['05-01','Ngày Quốc tế Lao động'],['09-02','Quốc khánh Việt Nam'],['10-20','Ngày Phụ nữ Việt Nam'],['11-20','Ngày Nhà giáo Việt Nam'],['12-24','Giáng sinh']];
// Vietnamese lunar calendar is calculated in UTC+7; 2030-02-02 differs from UTC+8 calendars.
const tet:Record<number,string>={2027:'02-06',2028:'01-26',2029:'02-13',2030:'02-02'};
export function vnEvents(year:number):VnEvent[]{
  if(!Number.isInteger(year)||year<2000||year>2100)throw new Error('VN_CALENDAR_YEAR_INVALID');
  const events:VnEvent[]=fixed.map(([date,name])=>({date:`${year}-${date}`,name,kind:'HOLIDAY'}));
  for(let month=1;month<=12;month++){const part=String(month).padStart(2,'0');events.push({date:`${year}-${part}-${part}`,name:`Sale ${month}/${month}`,kind:'SALE'})}
  const novemberFirst=new Date(Date.UTC(year,10,1)).getUTCDay(),firstFriday=1+(5-novemberFirst+7)%7,blackFriday=firstFriday+21;
  events.push({date:`${year}-11-${String(blackFriday).padStart(2,'0')}`,name:'Black Friday',kind:'SALE'});
  if(tet[year])events.push({date:`${year}-${tet[year]}`,name:'Tết Nguyên đán',kind:'SEASON'});
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
