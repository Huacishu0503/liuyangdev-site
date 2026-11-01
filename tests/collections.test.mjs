import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeCollections,collectionDate,collectionPeriod,timelineCollections} from '../public/collections.mjs';
test('all imported photos survive merging, in volume order with original editable IDs',async()=>{
  const library=JSON.parse(await readFile(new URL('../private/library.json',import.meta.url),'utf8'));
  const source=library.trips.filter(t=>t.live&&!t.archived).map(t=>t.live);
  const result=mergeCollections(source);
  assert.equal(source.length,10);assert.equal(result.length,4);
  assert.equal(result.reduce((n,t)=>n+t.photos.length,0),1291);
  assert.deepEqual(result.map(t=>t.photos.length).sort((a,b)=>a-b),[98,261,393,539]);
  for(const group of result){
    const ordered=group.volumes.map(v=>source.find(t=>t.id===v.id));
    assert.deepEqual(group.photos.map(p=>p.id),ordered.flatMap(t=>t.photos.map(p=>p.id)));
    assert.equal(group.photos.filter(p=>p.chapterStart).length,ordered.length);
  }
  assert.deepEqual(timelineCollections(result).dated.map(t=>t.date),['2025-10-02']);
  assert.equal(timelineCollections(result).undated.length,3);
});
test('different dates and categories stay distinct; calendar validation does not invent dates',()=>{
  const base={id:'a',place:'南京',category:'旅行',photos:[{id:'p',src:'/p.webp'}]};
  assert.equal(mergeCollections([base,{...base,id:'b',date:'2025-01-01'},{...base,id:'c',category:'日常'}]).length,3);
  assert.equal(collectionDate({date:'2025-02-30',place:'西安25.10.2'}),null);
  assert.equal(collectionDate({place:'高中时期'}),null);
  assert.equal(collectionDate({place:'西安25.13.2'}),null);
  assert.deepEqual(collectionDate({date:'2024-02-29'}),{date:'2024-02-29',source:'相册日期'});
  const sorted=timelineCollections([{...base,date:'2025-12-01'},{...base,date:'2025-01-01'}]);
  assert.deepEqual(sorted.dated.map(t=>t.date),['2025-01-01','2025-12-01']);
});
test('month-only dates retain their precision and sort before later trips in the same year',()=>{
  const august={place:'南京+青岛',date:'2026-08'};
  const october={place:'陕西西安26.10.2',date:'2026-10-02'};
  assert.deepEqual(collectionDate(august),{date:'2026-08',source:'相册日期 · 仅记录到月份'});
  assert.equal(collectionDate({date:'2026-13'}),null);
  assert.deepEqual(timelineCollections([october,august]).dated.map(t=>t.date),['2026-08','2026-10-02']);
});
test('holiday and overlapping school years keep their precision in separate sections',()=>{
  const school={place:'高中时期',date:'2023—2026'},nanning={place:'南宁',date:'2025年国庆'};
  const result=timelineCollections([{place:'西安',date:'2026-10-02'},school,{place:'南京+青岛',date:'2026-08'},nanning]);
  assert.deepEqual(result.dated.map(t=>t.date),['2025-10','2026-08','2026-10-02']);
  assert.equal(result.dated[0].label,'2025 年国庆');assert.equal(result.periods[0].label,'2023—2026');
  assert.equal(result.undated.length,0);assert.equal(collectionDate(school),null);
  assert.equal(collectionPeriod({date:'2026—2023'}),null);
});
