const COOKIE = 'our_story_manager_v2';
const VIEW_COOKIE = 'our_story_viewer';
const SESSION_SECONDS = 12 * 3600;
const MAX_IMAGE = 12 * 1024 * 1024;
const encoder = new TextEncoder();
const idPattern = '[a-f0-9]{32}';
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};
function reply(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra
  } });
}
function clean(value, maximum, required = false) {
  if (typeof value !== 'string') fail(400, '填写内容格式不正确。');
  value = value.trim();
  if (Array.from(value).length > maximum || (required && !value)) fail(400, '请填写有效内容，文字不要超过长度限制。');
  return value;
}
export function publicTrip(trip) {
  const result = Object.fromEntries(['id','place','title','category','date','description'].map(k => [k, trip[k] || '']));
  result.photos = (trip.photos || []).map(p => Object.fromEntries(['id','src','caption','alt'].map(k => [k, p[k] || ''])));
  result.cover = result.photos.some(p=>p.src===trip.cover) ? trip.cover : result.photos[0]?.src || '';
  return result;
}
function adminTrip(trip) {
  const result = structuredClone(trip);
  result.published = !!trip.live;
  // Imported dictionaries can have different property order.
  const normalize = t => t ? JSON.stringify(publicTrip(t)) : null;
  result.dirty = normalize(trip) !== normalize(trip.live);
  delete result.live;
  return result;
}
async function readBody(request, maximum) {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) fail(400, '文件太大或请求不完整，请重新选择照片。');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let total = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) { await reader.cancel(); fail(400, '文件太大，请重新选择照片。'); }
    chunks.push(value);
  }
  if (length !== null && Number(length) !== total) fail(400, '上传中断，请重试。');
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function readJson(request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') fail(400, '请求格式不正确。');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await readBody(request, 65536))); }
  catch (error) { if (error instanceof ApiError) throw error; fail(400, '请求内容不正确。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求内容不正确。');
  return value;
}
export function webpDimensions(bytes) {
  const text = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 30 || text(0,4) !== 'RIFF' || text(8,4) !== 'WEBP' || view.getUint32(4,true) + 8 !== bytes.length) fail(400, '请选择有效的静态照片。');
  let offset = 12, dimensions = null, imageChunk = false;
  const uint24 = i => bytes[i] | bytes[i+1] << 8 | bytes[i+2] << 16;
  while (offset + 8 <= bytes.length) {
    const kind = text(offset,4), size = view.getUint32(offset+4,true), p = offset+8;
    if (p+size > bytes.length) fail(400, '图片文件不完整，请重新选择。');
    if (kind === 'ANIM' || kind === 'ANMF') fail(400, '暂时只支持静态照片。');
    if (kind === 'VP8X' && size >= 10) dimensions = [1+uint24(p+4), 1+uint24(p+7)];
    else if (kind === 'VP8 ' && size >= 10 && text(p+3,3) === '\x9d\x01\x2a') {
      imageChunk = true;
      dimensions ||= [view.getUint16(p+6,true)&0x3fff,view.getUint16(p+8,true)&0x3fff];
    } else if (kind === 'VP8L' && size >= 5 && bytes[p] === 0x2f) {
      imageChunk = true;
      const bits = view.getUint32(p+1,true);
      dimensions ||= [(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];
    }
    offset += 8 + size + (size & 1);
  }
  if (offset !== bytes.length || !imageChunk || !dimensions || !dimensions.every(d => d >= 1 && d <= 4096)) fail(400, '照片格式或尺寸不受支持，请重新选择。');
  return dimensions;
}
function token(request, viewer = false) {
  return new RegExp(`(?:^|;\\s*)${viewer ? VIEW_COOKIE : COOKIE}=([a-f0-9]{64})(?:;|$)`).exec(request.headers.get('Cookie') || '')?.[1] || '';
}
function cookie(request, value = '', seconds = SESSION_SECONDS, env, viewer = false) {
  const isLocal = env.STORY_DEV === '1' && ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
  return `${viewer ? VIEW_COOKIE : COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${isLocal ? '' : '; Secure'}`;
}
async function authenticated(request, env, viewer = false) {
  const value = token(request,viewer);
  if (!value) return false;
  const row = await env.DB.prepare('SELECT expires FROM sessions WHERE token_hash=?').bind(await sha256((viewer ? 'viewer:' : '')+value)).first();
  return !!row && row.expires > Math.floor(Date.now()/1000);
}
async function canView(request,env) { return await authenticated(request,env) || await authenticated(request,env,true); }
async function login(request, env, viewer = false) {
  if (!/^[a-f0-9]{32,128}$/.test(env.STORY_PASSWORD_SALT || '') || !/^[a-f0-9]{64}$/.test(env.STORY_PASSWORD_HASH || '')) fail(503, '管理后台尚未配置完成。');
  const now = Math.floor(Date.now()/1000);
  const peer = await sha256(request.headers.get('CF-Connecting-IP') || 'local');
  const row = await env.DB.prepare(`INSERT INTO login_attempts(peer_hash,started,attempts) VALUES(?,?,1)
    ON CONFLICT(peer_hash) DO UPDATE SET
    started=CASE WHEN login_attempts.started<=?-900 THEN excluded.started ELSE login_attempts.started END,
    attempts=CASE WHEN login_attempts.started<=?-900 THEN 1 ELSE login_attempts.attempts+1 END
    RETURNING attempts`).bind(peer,now,now,now).first();
  if (row.attempts > 5) fail(429, '密码输错次数较多，请 15 分钟后再试。');
  const body = await readJson(request), password = body.password;
  if (typeof password !== 'string' || !password || Array.from(password).length > 200) fail(401, '管理密码不正确。');
  const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const salt = Uint8Array.from(env.STORY_PASSWORD_SALT.match(/../g), b => parseInt(b,16));
  const hash = hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256));
  if (!equal(hash,env.STORY_PASSWORD_HASH)) fail(401, '管理密码不正确。');
  const value = randomId()+randomId();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE peer_hash=? OR started<?').bind(peer,now-86400),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
    env.DB.prepare('INSERT INTO sessions(token_hash,expires) VALUES(?,?)').bind(await sha256((viewer ? 'viewer:' : '')+value),now+SESSION_SECONDS)
  ]);
  return reply({authenticated:true},200,{'Set-Cookie':cookie(request,value,SESSION_SECONDS,env,viewer)});
}
async function mutateTrip(env, id, mutate) {
  // Revision checks prevent simultaneous uploads/edits from overwriting each other.
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await env.DB.prepare('SELECT data,revision FROM trips WHERE id=? AND archived=0').bind(id).first();
    if (!row) fail(404, '没有找到这段旅行。');
    const trip = JSON.parse(row.data);
    const extra = mutate(trip) || {};
    if (extra.duplicate) return {trip:adminTrip(trip),duplicate:true};
    trip.updatedAt = Math.floor(Date.now()/1000);
    const day = new Date().toISOString().slice(0,10), oldest = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const result = await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO trip_backups(day,trip_id,data) SELECT ?,id,data FROM trips WHERE id=? AND revision=?').bind(day,id,row.revision),
      env.DB.prepare('UPDATE trips SET data=?,revision=revision+1,archived=? WHERE id=? AND revision=?').bind(JSON.stringify(trip),trip.archived?1:0,id,row.revision),
      env.DB.prepare('DELETE FROM trip_backups WHERE day<?').bind(oldest)
    ]);
    if (result[1].meta.changes === 1) return {trip:adminTrip(trip),...extra};
  }
  fail(409, '正在保存其他修改，请稍后重试。');
}
async function api(request, env, path) {
  if (request.method === 'GET') {
    if (path === '/view/session') { const valid=await canView(request,env); return reply({authenticated:valid},valid?200:401); }
    if (path === '/health') return reply({ok:true,uploadsReady:!!(env.PHOTOS || env.PHOTO_KV)});
    if (path === '/session') { const valid = await authenticated(request,env); return reply({authenticated:valid},valid?200:401); }
    if (path === '/trips' || path === '/admin/trips') {
      if (path === '/trips' && !await canView(request,env)) fail(401,'请先输入相册密码。');
      if (path === '/admin/trips' && !await authenticated(request,env)) fail(401, '请先输入管理密码。');
      const {results} = await env.DB.prepare('SELECT data FROM trips WHERE archived=0 ORDER BY position,id').all();
      const trips = results.map(row => JSON.parse(row.data));
      return reply({trips:path === '/trips' ? trips.filter(t=>t.live).map(t=>t.live) : trips.map(adminTrip)});
    }
    fail(404, '没有这个入口。');
  }
  if (!['POST','PATCH','DELETE'].includes(request.method)) fail(405, '不支持这种操作。');
  const expectedOrigin = env.STORY_ORIGIN || new URL(request.url).origin;
  if (request.headers.get('Origin') !== expectedOrigin) fail(403, '请求来源不正确，请从照片管理页面操作。');
  if (path === '/view/login' && request.method === 'POST') return login(request,env,true);
  if (path === '/view/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256('viewer:'+token(request,true))).run();
    return reply({ok:true},200,{'Set-Cookie':cookie(request,'',0,env,true)});
  }
  if (path === '/login' && request.method === 'POST') return login(request,env);
  if (!await authenticated(request,env)) fail(401, '请先输入管理密码。');
  if (path === '/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token(request))).run();
    return reply({ok:true},200,{'Set-Cookie':cookie(request,'',0,env)});
  }
  if (path === '/trips' && request.method === 'POST') {
    const body = await readJson(request);
    const trip = {id:randomId(),place:clean(body.place ?? '',40,true),title:clean(body.title ?? '我们的旅行',80,true),category:clean(body.category ?? '旅行',30,true),date:'',description:'',photos:[],live:null,updatedAt:Math.floor(Date.now()/1000)};
    const result = await env.DB.prepare(`INSERT INTO trips(id,data,position)
      SELECT ?,?,COALESCE(MIN(position),0)-1 FROM trips
      HAVING (SELECT COUNT(*) FROM trips WHERE archived=0)<100`).bind(trip.id,JSON.stringify(trip)).run();
    if (result.meta.changes !== 1) fail(400, '最多先保存 100 段旅行。');
    return reply({trip:adminTrip(trip)},201);
  }
  const photoMatch = new RegExp(`^/trips/(${idPattern})/photos/(${idPattern})$`).exec(path);
  if (request.method === 'DELETE' && photoMatch) {
    return reply(await mutateTrip(env,photoMatch[1],trip => {
      trip.photos = trip.photos.filter(p=>p.id!==photoMatch[2]);
      if(trip.cover && !trip.photos.some(p=>p.src===trip.cover)) trip.cover=trip.photos[0]?.src||'';
      if (trip.live) {
        trip.live.photos = trip.live.photos.filter(p=>p.id!==photoMatch[2]);
        if (trip.live.photos.length) {
          if(!trip.live.photos.some(p=>p.src===trip.live.cover)) trip.live.cover = trip.live.photos[0].src;
        }
        else trip.live = null;
      }
    }));
  }
  const match = new RegExp(`^/trips/(${idPattern})(?:/(photos|publish|unpublish|archive))?$`).exec(path);
  if (!match) fail(404, '没有这个入口。');
  const [,id,action] = match;
  if (request.method === 'PATCH' && !action) {
    const body = await readJson(request);
    return reply(await mutateTrip(env,id,trip => {
      for (const [field,length,required] of [['place',40,true],['title',80,true],['category',30,true],['date',20,false],['description',1000,false]]) {
        if (Object.hasOwn(body,field)) trip[field] = clean(body[field],length,required);
      }
      if (Object.hasOwn(body,'photos')) {
        if (!Array.isArray(body.photos) || body.photos.length>200) fail(400, '照片列表不正确。');
        const existing = new Map(trip.photos.map(p=>[p.id,p])), seen = new Set();
        trip.photos = body.photos.map(item => {
          if (!item || typeof item !== 'object' || !existing.has(item.id) || seen.has(item.id)) fail(400, '照片信息不正确，请刷新管理页。');
          seen.add(item.id);
          return {...existing.get(item.id),caption:clean(item.caption ?? '',200),alt:clean(item.alt ?? '',200)||trip.place+'旅行照片'};
        });
      }
      if (Object.hasOwn(body,'cover')) {
        const cover=clean(body.cover,200,true);
        if(!trip.photos.some(p=>p.src===cover)) fail(400,'请选择这本相册中的照片作为封面。');
        trip.cover=cover;
      }
    }));
  }
  if (request.method !== 'POST' || !action) fail(404, '没有这个入口。');
  let image, digest;
  if (action === 'photos') {
    if (!env.PHOTOS && !env.PHOTO_KV) fail(503, '测试站的照片上传正在开通，现有相册可以正常查看。');
    // Check ownership/existence before reading or storing the image.
    const existing = await env.DB.prepare('SELECT id FROM trips WHERE id=? AND archived=0').bind(id).first();
    if (!existing) fail(404, '没有找到这段旅行。');
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'image/webp') fail(400, '请使用页面里的选照片按钮上传。');
    image = await readBody(request,MAX_IMAGE); webpDimensions(image); digest = await sha256(image);
    // Content-addressed files remain available to other albums and recovery snapshots.
    const stored = await env.DB.prepare('SELECT hash FROM photo_files WHERE hash=?').bind(digest).first();
    if (!stored) {
      if (env.PHOTOS) await env.PHOTOS.put(`${digest}.webp`,image,{httpMetadata:{contentType:'image/webp',cacheControl:'public, max-age=31536000, immutable'}});
      else await env.PHOTO_KV.put(`${digest}.webp`,image);
      await env.DB.prepare('INSERT OR IGNORE INTO photo_files(hash,bytes) VALUES(?,?)').bind(digest,image.byteLength).run();
    }
  }
  return reply(await mutateTrip(env,id,trip => {
    if (action === 'photos') {
      if (trip.photos.some(p=>p.hash===digest)) return {duplicate:true};
      if (trip.photos.length>=200) fail(400, '一段旅行最多先上传 200 张照片。');
      trip.photos.push({id:randomId(),src:`/uploads/${digest}.webp`,caption:'',alt:trip.place+'旅行照片',hash:digest});
    } else if (action === 'publish') {
      if (!trip.photos.length) fail(400, '先选几张照片，再发布。');
      trip.live = publicTrip(trip);
    } else if (action === 'unpublish') trip.live = null;
    else if (action === 'archive') { trip.archived = true; trip.live = null; }
  }));
}
async function photo(request, env) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  const path = new URL(request.url).pathname;
  if (!/^\/uploads\/[a-f0-9]{64}\.webp$/.test(path)) return new Response('Not found',{status:404});
  // Imported photos are immutable assets; new photos live in R2.
  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404) return asset;
  if (!env.PHOTOS && env.PHOTO_KV) {
    const bytes = await env.PHOTO_KV.get(path.slice('/uploads/'.length),'arrayBuffer');
    if (!bytes) return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
    const etag = `"${path.split('/').pop().slice(0,-5)}"`;
    const headers = new Headers({'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable','ETag':etag,'Accept-Ranges':'bytes'});
    if (request.headers.get('If-None-Match')?.split(',').some(t=>t.trim()===etag||t.trim()==='*')) return new Response(null,{status:304,headers});
    let body = bytes, status = 200;
    const range = request.headers.get('Range'), ifRange = request.headers.get('If-Range');
    if (range && (!ifRange || ifRange === etag)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
      let start = match[1] ? Number(match[1]) : Math.max(0,bytes.byteLength-Number(match[2]));
      let end = match[1] ? (match[2] ? Math.min(Number(match[2]),bytes.byteLength-1) : bytes.byteLength-1) : bytes.byteLength-1;
      if (start>=bytes.byteLength || start>end) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
      body = bytes.slice(start,end+1); status = 206;
      headers.set('Content-Range',`bytes ${start}-${end}/${bytes.byteLength}`);
    }
    headers.set('Content-Length',String(body.byteLength));
    return new Response(request.method==='HEAD'?null:body,{status,headers});
  }
  const object = await env.PHOTOS?.get(path.slice('/uploads/'.length),{onlyIf:request.headers,range:request.headers});
  if (!object) return new Response('Not found',{status:404});
  const headers = new Headers({'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable','ETag':object.httpEtag,'Accept-Ranges':'bytes'});
  if (!('body' in object)) return new Response(null,{status:request.headers.has('If-None-Match')?304:412,headers});
  let status = 200;
  if (request.headers.has('Range') && object.range?.length !== undefined && object.range?.offset !== undefined) {
    status = 206;
    headers.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);
    headers.set('Content-Length',String(object.range.length));
  } else headers.set('Content-Length',String(object.size));
  return new Response(request.method==='HEAD'?null:object.body,{status,headers});
}
function httpsRedirect(request) {
  const url = new URL(request.url);
  if (['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return null;
  let insecure = url.protocol === 'http:';
  const visitor = request.headers.get('CF-Visitor');
  if (visitor) {
    try { insecure = JSON.parse(visitor).scheme === 'http'; }
    catch { /* Keep the request URL scheme when edge metadata is malformed. */ }
  }
  if (!insecure) return null;
  url.protocol = 'https:';
  const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
  return Response.redirect(url.toString(), status);
}
function robotsTxt() {
  return new Response('User-agent: *\nDisallow: /\n', {headers:{
    'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'
  }});
}
async function favicon(request, env) {
  const iconUrl = new URL(request.url); iconUrl.pathname = '/assets/heart.svg';
  const icon = await env.ASSETS.fetch(new Request(iconUrl, {method:'GET'}));
  const headers = new Headers(icon.headers);
  headers.set('Content-Type','image/svg+xml');
  headers.set('Cache-Control','public, max-age=86400');
  headers.set('X-Content-Type-Options','nosniff');
  return new Response(request.method === 'HEAD' ? null : icon.body, {status:icon.status, headers});
}
export default {
  async fetch(request,env) {
    try {
      const redirect = httpsRedirect(request);
      if (redirect) return redirect;
      const url = new URL(request.url);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(request,env,url.pathname.slice(4)||'/');
      const path=decodeURIComponent(url.pathname);
      // Crawlers and browsers request these before any album session exists.
      if (path === '/robots.txt' && ['GET','HEAD'].includes(request.method)) return robotsTxt();
      if (path === '/favicon.ico' && ['GET','HEAD'].includes(request.method)) return favicon(request, env);
      if (path.startsWith('/uploads/')) {
        if (!await canView(request,env)) return reply({error:'请先输入相册密码。'},401);
        url.pathname=path;
        const response=await photo(new Request(url,request),env);
        const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('Vary','Cookie');
        return new Response(response.body,{status:response.status,headers});
      }
      if (['/','/index.html','/index','/lock'].includes(path)) {
        const target=new URL(request.url);target.pathname=await canView(request,env)?'/index.html':'/lock.html';
        const response=await env.ASSETS.fetch(new Request(target,request));
        const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('Vary','Cookie');
        return new Response(response.body,{status:response.status,headers});
      }
      if (path === '/manage') { const target=new URL(request.url);target.pathname='/manage.html';return env.ASSETS.fetch(new Request(target,request)); }
      if (!['/lock.html','/lock.js','/lock.css','/assets/heart.svg','/manage.html','/manage.js','/manage.css','/favicon.ico','/robots.txt'].includes(path) && !await canView(request,env)) return reply({error:'请先输入相册密码。'},401);
      const response=await env.ASSETS.fetch(request);
      const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('Vary','Cookie');
      return new Response(response.body,{status:response.status,headers});
    } catch (error) {
      if (error instanceof ApiError) return reply({error:error.message},error.status);
      // Do not expose bodies, cookies, password hashes or database errors.
      return reply({error:'暂时无法保存，请稍后重试。'},503);
    }
  }
};
