"""Verify only the isolated Cloudflare trial, including a disposable workflow."""
import argparse, concurrent.futures, hashlib, json, os, re, time, threading
from pathlib import Path
from urllib.parse import urlsplit
import requests
import certifi, urllib3

parser=argparse.ArgumentParser()
parser.add_argument('url')
parser.add_argument('--doh',action='store_true',help='Diagnose through verified public DNS without changing system DNS or disabling TLS')
parser.add_argument('--quick',action='store_true',help='Verify snapshots, sampled checksums and full management workflow; assets were fully checked on the shared backend already')
parser.add_argument('--direct',action='store_true',help='Use a direct connection for this verification process only, leaving system settings unchanged')
args=parser.parse_args()
BASE=args.url.rstrip('/')
if urlsplit(BASE).scheme!='https' or not (urlsplit(BASE).hostname.endswith(('.workers.dev','.pages.dev')) or urlsplit(BASE).hostname in {'test.liuyangdev.site','liuyangdev.site','www.liuyangdev.site'}):
    raise SystemExit('Verification mutations are restricted to the isolated trial hosts')
ROOT=Path(__file__).resolve().parent
library=json.loads((ROOT/'private/library.json').read_text(encoding='utf-8'))
manifest=json.loads((ROOT/'private/asset-manifest.json').read_text(encoding='utf-8'))
expected=[t['live'] for t in library['trips'] if t.get('live') and not t.get('archived')]
adapter=None
if args.doh:
    host=urlsplit(BASE).hostname
    records=requests.get('https://1.1.1.1/dns-query',params={'name':host,'type':'A'},headers={'Accept':'application/dns-json'},timeout=20).json()['Answer']
    address=next(r['data'] for r in records if r['type']==1)
    class VerifiedDNSAdapter(requests.adapters.BaseAdapter):
        def __init__(self):
            proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
            manager=urllib3.ProxyManager(proxy,cert_reqs='CERT_REQUIRED',ca_certs=certifi.where()) if proxy else urllib3.PoolManager(cert_reqs='CERT_REQUIRED',ca_certs=certifi.where())
            self.pool=manager.connection_from_host(address,443,'https',pool_kwargs={'server_hostname':host,'assert_hostname':host})
        def send(self,request,**kwargs):
            url=urlsplit(request.url)
            if url.hostname!=host: raise RuntimeError('Diagnostic adapter is scoped to the trial hostname')
            headers=dict(request.headers);headers['Host']=host
            raw=self.pool.urlopen(request.method,url.path+('?' +url.query if url.query else ''),headers=headers,body=request.body,preload_content=False,retries=False,timeout=urllib3.Timeout(connect=15,read=35))
            response=requests.Response();response.status_code=raw.status;response.headers=requests.structures.CaseInsensitiveDict(raw.headers);response.url=request.url;response.request=request;response.raw=raw
            return response
        def close(self): pass
    adapter=VerifiedDNSAdapter()
def remote_session():
    result=requests.Session()
    if args.direct: result.trust_env=False
    if 'session' in globals(): result.cookies.update(session.cookies)
    if adapter: result.mount(BASE,adapter)
    return result
session=remote_session()
thread_state=threading.local()
def api(path,method='GET',data=None,image=None):
    options={'headers':{'Origin':BASE},'timeout':35}
    if image is not None:
        options.update(data=image);options['headers']['Content-Type']='image/webp'
    elif data is not None:
        options.update(json=data)
    response=session.request(method,BASE+'/api/'+path,**options)
    if not response.ok: raise RuntimeError(f'{method} {path}: HTTP {response.status_code}')
    return response.json()

report={'url':BASE,'published_albums':len(expected),'published_photos':sum(len(t['photos']) for t in expected),'production_dns_changed':urlsplit(BASE).hostname in {'liuyangdev.site','www.liuyangdev.site'},'dns_diagnostic_override_used':args.doh}
report['verification_uses_system_proxy']=not args.direct
password_file=Path('C:/Users/31229/Documents/Codex/2026-10-25/referenced-chatgpt-conversation-this-is-an-2/outputs/照片管理登录信息.txt')
password=re.search(r'管理密码[：:]\s*(\S+)',password_file.read_text(encoding='utf-8-sig')).group(1)
api('login','POST',{'password':password})
assert api('health')['uploadsReady'] is True
assert api('trips')['trips']==expected
report['public_snapshots_match']=True
print('Published albums and all 1291 photo metadata match.',flush=True)

# Verify every file is publicly reachable with its original size. The immutable
# upload tool has already checked content-addressed asset hashes on upload.
def check_file(item):
    if not hasattr(thread_state,'session'): thread_state.session=remote_session()
    for attempt in range(3):
        try:
            response=thread_state.session.get(BASE+'/'+item['path'],headers={'Range':'bytes=0-0','Accept-Encoding':'identity'},allow_redirects=True,timeout=25)
            size = int(response.headers.get('Content-Range','/-1').rsplit('/',1)[-1]) if response.status_code==206 else len(response.content)
            if response.status_code in (200,206) and size==item['bytes']:
                return None
        except (requests.RequestException,urllib3.exceptions.HTTPError):
            pass
    return item['path']
failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for index,result in enumerate(pool.map(check_file,[] if args.quick else manifest),1):
        if result: failures.append(result)
        if index%250==0: print(f'Checked {index}/{len(manifest)} assets.',flush=True)
if failures:
    (ROOT/'private/failed-assets.json').write_text(json.dumps(failures),encoding='utf-8')
    raise RuntimeError(f'{len(failures)} asset checks failed; see private report')
report['assets_checked']=0 if args.quick else len(manifest)
report['quick_gateway_check']=args.quick
sample_paths={'index.html','app.js','album.css','manage.js','assets/soft-light.wav'}
for trip in expected: sample_paths.update([trip['photos'][0]['src'].lstrip('/'),trip['photos'][-1]['src'].lstrip('/')])
samples=[m for m in manifest if m['path'] in sample_paths]
for item in samples:
    response=session.get(BASE+'/'+item['path'],timeout=30);response.raise_for_status()
    assert hashlib.sha256(response.content).hexdigest()==hashlib.sha256((ROOT/'public'/item['path']).read_bytes()).hexdigest(),item['path']
report['checksums_sampled']=len(samples)
for path in ['/.dev.vars','/private/secrets.json','/seed.sql','/photo-seed.sql','/tls/privkey.pem']:
    assert session.get(BASE+path,timeout=20).status_code in (401,404),path
report['private_paths_not_published']=True

password_file=Path('C:/Users/31229/Documents/Codex/2026-10-25/referenced-chatgpt-conversation-this-is-an-2/outputs/照片管理登录信息.txt')
password=re.search(r'管理密码[：:]\s*(\S+)',password_file.read_text(encoding='utf-8-sig')).group(1)
api('login','POST',{'password':password})
assert api('session')['authenticated'] is True
report['existing_password_login']=True
trip_id=None
try:
    trip=api('trips','POST',{'place':'迁移功能验证（临时）','title':'验证后自动移除'})['trip'];trip_id=trip['id']
    image=(ROOT/'tests/fixture.webp').read_bytes()
    trip=api(f'trips/{trip_id}/photos','POST',image=image)['trip']
    photo=trip['photos'][0]
    assert api(f'trips/{trip_id}/photos','POST',image=image)['duplicate'] is True
    api(f'trips/{trip_id}/publish','POST')
    assert any(t['id']==trip_id for t in api('trips')['trips'])
    # KV cold reads can need propagation; do not confuse that with metadata loss.
    for attempt in range(24):
        response=session.get(BASE+photo['src'],timeout=20)
        if response.status_code==200 and hashlib.sha256(response.content).digest()==hashlib.sha256(image).digest(): break
        time.sleep(3)
    else: raise RuntimeError('New uploaded photo did not become readable within propagation window')
    api(f'trips/{trip_id}','PATCH',{'title':'不应被删除操作发布的草稿'})
    api(f'trips/{trip_id}/photos/{photo["id"]}','DELETE')
    assert all(t['id']!=trip_id for t in api('trips')['trips'])
    draft=next(t for t in api('admin/trips')['trips'] if t['id']==trip_id)
    assert draft['title']=='不应被删除操作发布的草稿' and not draft['published'] and not draft['photos']
    report['upload_publish_delete_workflow']=True
finally:
    if trip_id: api(f'trips/{trip_id}/archive','POST')
assert api('trips')['trips']==expected
api('logout','POST')
report['original_public_albums_unchanged_after_test']=True
direct=requests.Session();direct.trust_env=False
try:
    response=direct.get(BASE+'/api/health',timeout=15)
    report['desktop_direct_access']=response.ok
except requests.RequestException:
    report['desktop_direct_access']=False
report['phone_network_test_pending']=True
report_name='formal-domain-verification.json' if report['production_dns_changed'] else ('gateway-verification.json' if args.quick else 'remote-verification.json')
(ROOT/report_name).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
