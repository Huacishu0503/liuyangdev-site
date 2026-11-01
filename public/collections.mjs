// Presentation only: source albums and their editable IDs stay unchanged.
const volume = trip => {
  const match = (trip.place || '').match(/^(.*?)\s*·\s*第(\d+)册$/);
  return {base:match ? match[1].trim() : trip.place || trip.id,number:match ? Number(match[2]) : 1};
};
export function mergeCollections(source) {
  const groups=new Map();
  for (const trip of source) {
    const part=volume(trip), key=JSON.stringify([part.base,trip.category || '',trip.date || '']);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({trip,part});
  }
  return [...groups.values()].map(parts => {
    parts.sort((a,b)=>a.part.number-b.part.number);
    const first=parts[0].trip;
    return {...first,place:parts[0].part.base,title:first.title===first.place?parts[0].part.base:first.title,
      volumes:parts.map(({trip})=>({id:trip.id,title:trip.place,count:trip.photos.length})),
      photos:parts.flatMap(({trip},chapter)=>trip.photos.map((photo,index)=>({...photo,chapter,chapterStart:index===0}))) };
  });
}
function calendarDate(year,month,day) {
  year=Number(year);month=Number(month);day=Number(day);
  if(year<1900||year>2099||month<1||month>12||day<1||day>31)return null;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function collectionDate(trip) {
  if(trip.date) {
    const holiday=trip.date.trim().match(/^(\d{4})\s*年?\s*国庆(?:节)?$/);
    if(holiday){const valid=calendarDate(holiday[1],10,1);return valid?{date:valid.slice(0,7),label:`${holiday[1]} 年国庆`,source:'国庆假期 · 未记录具体日期'}:null;}
    const month=trip.date.trim().match(/^(\d{4})[-/.](\d{1,2})$/);
    if(month){const valid=calendarDate(month[1],month[2],1);return valid?{date:valid.slice(0,7),source:'相册日期 · 仅记录到月份'}:null;}
    const match=trip.date.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:T.*)?$/);
    const date=match&&calendarDate(match[1],match[2],match[3]);
    // An invalid explicit date must not silently become an inferred date.
    return date?{date,source:'相册日期'}:null;
  }
  const match=(trip.place || '').match(/(?:^|[^\d])(\d{4}|\d{2})[./-](\d{1,2})[./-](\d{1,2})(?:[^\d]|$)/);
  if(!match)return null;
  const date=calendarDate(match[1].length===2?'20'+match[1]:match[1],match[2],match[3]);
  return date?{date,source:'相册标题中的日期'}:null;
}
export function collectionPeriod(trip) {
  const match=(trip.date || '').trim().match(/^(\d{4})\s*[-–—~至]\s*(\d{4})$/);
  if(!match||!calendarDate(match[1],1,1)||!calendarDate(match[2],1,1)||Number(match[1])>Number(match[2]))return null;
  return {start:match[1],end:match[2],label:`${match[1]}—${match[2]}`,source:'跨年合集 · 未按逐年拆分'};
}
export function timelineCollections(trips) {
  const dated=[],undated=[],periods=[];
  for(const trip of trips){const period=collectionPeriod(trip);if(period){periods.push({trip,...period});continue;}const stamp=collectionDate(trip);if(stamp)dated.push({trip,...stamp});else undated.push(trip);}
  dated.sort((a,b)=>a.date.localeCompare(b.date));
  periods.sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
  return {dated,undated,periods};
}
