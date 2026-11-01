import {Miniflare} from 'miniflare';
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pbkdf2Sync,createHash,randomBytes} from 'node:crypto';

const root = resolve(import.meta.dirname,'..');
const original = JSON.parse(await readFile(join(root,'private/library.json'),'utf8'));
const origin = 'http://localhost';
const password = 'isolated-test-password';
let mf,db,bucket,cookie='',photoBytes;
const json = response => response.json();
async function request(path,{method='GET',data,image,auth=true,headers={}}={}) {
  const h = new Headers(headers);
  if (auth && cookie) h.set('Cookie',cookie);
  if (method !== 'GET') h.set('Origin',origin);
  for(const [key,value] of Object.entries(headers)) { if(value===null) h.delete(key); else h.set(key,value); }
  let body;
  if (image) {body=image;h.set('Content-Type','image/webp');}
  if (data!==undefined) {body=JSON.stringify(data);h.set('Content-Type','application/json');}
  return mf.dispatchFetch(origin+path,{method,headers:h,body});
}
async function ok(path,options) {
  const r=await request(path,options),body=await json(r);
  assert.ok(r.ok,`${path}: ${r.status} ${JSON.stringify(body)}`);return body;
}
async function create(place='本地测试') { return (await ok('/api/trips',{method:'POST',data:{place}})).trip; }
async function upload(trip,image=photoBytes) { return ok(`/api/trips/${trip.id}/photos`,{method:'POST',image}); }
async function publish(trip) {return ok(`/api/trips/${trip.id}/publish`,{method:'POST'});}
async function live(id) {return (await ok('/api/trips')).trips.find(t=>t.id===id);}
before(async()=>{
  const salt=randomBytes(24);
  const backend={
    name:'story-backend',
    modules:true,scriptPath:join(root,'src/worker.mjs'),compatibilityDate:'2026-07-01',
    d1Databases:['DB'],r2Buckets:process.env.TEST_PHOTO_KV?[]:['PHOTOS'],kvNamespaces:process.env.TEST_PHOTO_KV?['PHOTO_KV']:[],
    bindings:{STORY_DEV:'1',STORY_PASSWORD_SALT:salt.toString('hex'),STORY_PASSWORD_HASH:pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')},
    serviceBindings:{ASSETS:async req=>{
      const path=new URL(req.url).pathname;
      if(!/^\/(uploads\/[a-f0-9]{64}\.webp|index\.html|assets\/soft-light\.wav)$/.test(path)) return new Response('Not found',{status:404});
      try{return new Response(await readFile(join(root,'public',path.slice(1))),{headers:{'Content-Type':path.endsWith('webp')?'image/webp':'text/plain'}});}
      catch{return new Response('Not found',{status:404});}
    }}
  };
  mf=new Miniflare(process.env.TEST_GATEWAY ? {workers:[{name:'gateway',modules:true,scriptPath:join(root,'pages-gateway/worker.mjs'),compatibilityDate:'2026-07-01',serviceBindings:{STORY:'story-backend',ASSETS:backend.serviceBindings.ASSETS}},backend]} : backend);
  db=await mf.getD1Database('DB','story-backend');bucket=process.env.TEST_PHOTO_KV?await mf.getKVNamespace('PHOTO_KV','story-backend'):await mf.getR2Bucket('PHOTOS','story-backend');
  const schema=await readFile(join(root,'migrations/0001_initial.sql'),'utf8');
  for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  await db.prepare('CREATE TABLE photo_files(hash TEXT PRIMARY KEY, bytes INTEGER NOT NULL)').run();
  await db.batch(original.trips.map((trip,i)=>db.prepare('INSERT INTO trips(id,data,position,archived) VALUES(?,?,?,?)').bind(trip.id,JSON.stringify(trip),i,trip.archived?1:0)));
  photoBytes=await readFile(join(root,'tests/fixture.webp'));
  const initial=await request('/api/login',{method:'POST',data:{password}});cookie=initial.headers.get('Set-Cookie').split(';')[0];
});
after(async()=>{await mf?.dispose();});

test('public migration matches every original live album and photo',async()=>{
  const expected=original.trips.filter(t=>t.live&&!t.archived).map(t=>t.live);
  const actual=(await ok('/api/trips')).trips;
  assert.deepEqual(actual,expected);
  assert.equal(actual.length,10);assert.equal(actual.reduce((n,t)=>n+t.photos.length,0),1291);
  assert.equal(JSON.stringify(actual).includes('"hash"'),false);
  for(const trip of actual) {
    const r=await request(trip.photos[0].src);assert.equal(r.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),trip.photos[0].src.split('/').pop().slice(0,-5));
  }
});
test('auth, CSRF protection, password, secure cookie, session and login throttling',async()=>{
  assert.equal((await request('/api/admin/trips',{auth:false})).status,401);
  assert.equal((await request('/api/session',{auth:false})).status,401);
  assert.equal((await request('/api/login',{method:'POST',data:{password},headers:{Origin:'https://other.invalid'}})).status,403);
  assert.equal((await request('/api/login',{method:'POST',data:{password},headers:{Origin:null}})).status,403);
  assert.equal((await request('/api/login',{method:'POST',data:{password:'wrong'}})).status,401);
  const logged=await request('/api/login',{method:'POST',data:{password}});
  assert.equal(logged.status,200);
  const header=logged.headers.get('Set-Cookie');assert.match(header,/HttpOnly; SameSite=Strict/);assert.match(header,/Path=\/;/);
  cookie=header.split(';')[0];
  assert.equal((await ok('/api/session')).authenticated,true);
  const trips=(await ok('/api/admin/trips')).trips;
  assert.equal(trips.length,original.trips.filter(t=>!t.archived).length);
  assert.ok(trips.filter(t=>t.published).every(t=>!t.dirty));
  for(let i=0;i<5;i++) assert.equal((await request('/api/login',{method:'POST',data:{password:'wrong'},headers:{'CF-Connecting-IP':'192.0.2.20'}})).status,401);
  assert.equal((await request('/api/login',{method:'POST',data:{password},headers:{'CF-Connecting-IP':'192.0.2.20'}})).status,429);
  const session=await db.prepare('SELECT token_hash FROM sessions').first();assert.notEqual(session.token_hash,cookie.split('=')[1]);
});
test('upload, duplicate handling, publication, draft isolation and immediate deletion',async()=>{
  const trip=await create();
  assert.equal((await request(`/api/trips/${trip.id}/publish`,{method:'POST'})).status,400);
  const first=await upload(trip);assert.equal(first.trip.photos.length,1);
  const duplicate=await upload(trip);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.trip.photos.length,1);
  assert.equal(await live(trip.id),undefined);
  await publish(trip);assert.equal((await live(trip.id)).photos.length,1);
  await ok(`/api/trips/${trip.id}`,{method:'PATCH',data:{title:'未发布的新标题',description:'未发布说明'}});
  assert.notEqual((await live(trip.id)).title,'未发布的新标题');
  const remove=await ok(`/api/trips/${trip.id}/photos/${first.trip.photos[0].id}`,{method:'DELETE'});
  assert.equal(remove.trip.photos.length,0);assert.equal(remove.trip.published,false);assert.equal(remove.trip.title,'未发布的新标题');
  assert.equal(await live(trip.id),undefined);
  assert.equal((await request(first.trip.photos[0].src)).status,200);
  assert.equal((await ok(`/api/trips/${trip.id}/photos/${first.trip.photos[0].id}`,{method:'DELETE'})).trip.photos.length,0);
});
test('deletion preserves unrelated live captions, cover, shared storage and snapshots',async()=>{
  const a=await create('相册甲'), b=await create('相册乙');
  let t=(await upload(a)).trip;
  const second=await readFile(join(root,'tests/fixture2.webp'));
  t=(await upload(a,second)).trip;
  await upload(b);await publish(a);await publish(b);
  const [first,last]=t.photos;
  await ok(`/api/trips/${a.id}`,{method:'PATCH',data:{description:'暂未发布',photos:[{...last,caption:'草稿说明'},{...first,caption:'另一张草稿'}]}});
  await ok(`/api/trips/${a.id}/photos/${first.id}`,{method:'DELETE'});
  const published=await live(a.id);
  assert.equal(published.photos.length,1);assert.equal(published.cover,last.src);assert.equal(published.description,'');assert.equal(published.photos[0].caption,'');
  assert.equal((await live(b.id)).photos.length,1);assert.equal((await request(first.src)).status,200);
  const backup=await db.prepare('SELECT data FROM trip_backups WHERE trip_id=?').bind(a.id).first();assert.ok(backup);
  assert.equal((await request(last.src,{method:'HEAD'})).status,200);
  const full=await request(last.src);const etag=full.headers.get('ETag');
  const cached=await request(last.src,{headers:{'If-None-Match':etag}});assert.equal(cached.status,304);
  const partial=await request(last.src,{headers:{Range:'bytes=0-9'}});assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,10);
});
test('simultaneous uploads retain all photos and do not lose updates',async()=>{
  const trip=await create('并发测试');
  const bytes=await Promise.all(Array.from({length:8},(_,i)=>readFile(join(root,`tests/concurrent-${i}.webp`))));
  const results=await Promise.all(bytes.map(b=>upload(trip,b)));
  assert.equal(results.length,8);
  const row=await db.prepare('SELECT data FROM trips WHERE id=?').bind(trip.id).first();
  const stored=JSON.parse(row.data);assert.equal(stored.photos.length,8);assert.equal(new Set(stored.photos.map(p=>p.hash)).size,8);
});
test('malformed requests, forged photo ids, invalid formats, limits and archive',async()=>{
  const trip=await create('校验测试');
  assert.equal((await request('/api/trips',{method:'POST',data:[]})).status,400);
  assert.equal((await request(`/api/trips/${trip.id}/photos`,{method:'POST',image:Buffer.from('not a webp')})).status,400);
  assert.equal((await request(`/api/trips/${trip.id}`,{method:'PATCH',data:{photos:[{id:'0'.repeat(32)}]}})).status,400);
  assert.equal((await request(`/api/trips/${trip.id}`,{method:'PATCH',data:{place:''}})).status,400);
  assert.equal((await request(`/api/trips/${'0'.repeat(32)}/photos`,{method:'POST',image:photoBytes})).status,404);
  assert.equal((await request('/uploads/../private/secrets.json')).status,404);
  await upload(trip);await publish(trip);
  await ok(`/api/trips/${trip.id}/unpublish`,{method:'POST'});assert.equal(await live(trip.id),undefined);
  await publish(trip);await ok(`/api/trips/${trip.id}/archive`,{method:'POST'});
  assert.equal(await live(trip.id),undefined);
  assert.equal((await request(`/api/trips/${trip.id}`,{method:'PATCH',data:{title:'不可恢复编辑'}})).status,404);
  const full=await create('上限测试');
  const row=await db.prepare('SELECT data FROM trips WHERE id=?').bind(full.id).first();
  const data=JSON.parse(row.data);data.photos=Array.from({length:200},()=>({id:randomBytes(16).toString('hex'),hash:randomBytes(32).toString('hex'),src:'/uploads/'+ 'a'.repeat(64)+'.webp',caption:'',alt:''}));
  await db.prepare('UPDATE trips SET data=? WHERE id=?').bind(JSON.stringify(data),full.id).run();
  assert.equal((await request(`/api/trips/${full.id}/photos`,{method:'POST',image:photoBytes})).status,400);
});
test('custom covers preserve photo order and survive deleting a different photo',async()=>{
  const trip=await create('封面测试');
  await upload(trip);
  await upload(trip,await readFile(join(root,'tests/fixture2.webp')));
  await upload(trip,await readFile(join(root,'tests/concurrent-0.webp')));
  const draft=(await ok('/api/admin/trips')).trips.find(t=>t.id===trip.id);
  assert.equal(draft.photos.length,3);
  const chosen=draft.photos[2].src;
  assert.equal((await request(`/api/trips/${trip.id}`,{method:'PATCH',data:{cover:'https://outside.invalid/photo.jpg'}})).status,400);
  await ok(`/api/trips/${trip.id}`,{method:'PATCH',data:{cover:chosen}});await publish(trip);
  assert.equal((await live(trip.id)).cover,chosen);
  assert.deepEqual((await live(trip.id)).photos.map(p=>p.id),draft.photos.map(p=>p.id));
  await ok(`/api/trips/${trip.id}/photos/${draft.photos[0].id}`,{method:'DELETE'});
  assert.equal((await live(trip.id)).cover,chosen);
  await ok(`/api/trips/${trip.id}/photos/${draft.photos[2].id}`,{method:'DELETE'});
  assert.equal((await live(trip.id)).cover,draft.photos[1].src);
  await ok(`/api/trips/${trip.id}/archive`,{method:'POST'});
});
test('logout invalidates the session',async()=>{
  assert.equal((await ok('/api/logout',{method:'POST'})).ok,true);
  assert.equal((await request('/api/admin/trips')).status,401);
  assert.equal((await request('/api/session')).status,401);
});
test('album lock protects metadata and every photo; viewer cannot manage or forge an admin session',async()=>{
  const path=original.trips.find(t=>t.live).live.photos[0].src;
  assert.equal((await request('/api/trips',{auth:false})).status,401);
  for(const url of [path,path.replace('/uploads/','/%75ploads/'),'//uploads/'+path.split('/').pop()]) assert.equal((await request(url,{auth:false})).status,401);
  assert.equal((await request('/api/view/login',{method:'POST',data:{password:'wrong'},auth:false})).status,401);
  const login=await request('/api/view/login',{method:'POST',data:{password},auth:false});
  assert.equal(login.status,200);
  const viewer=login.headers.get('Set-Cookie').split(';')[0];
  const headers={Cookie:viewer};
  assert.equal((await request('/api/trips',{auth:false,headers})).status,200);
  const photo=await request(path,{auth:false,headers});assert.equal(photo.status,200);assert.match(photo.headers.get('Cache-Control'),/private, no-store/);
  assert.equal((await request('/api/admin/trips',{auth:false,headers})).status,401);
  assert.equal((await request('/api/trips',{method:'POST',data:{place:'forbidden'},auth:false,headers})).status,401);
  assert.equal((await request('/api/admin/trips',{auth:false,headers:{Cookie:viewer.replace('our_story_viewer','our_story_manager_v2')}})).status,401);
  await request('/api/view/logout',{method:'POST',auth:false,headers});
  assert.equal((await request(path,{auth:false,headers})).status,401);
});
