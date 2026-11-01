"""Prepare an isolated Cloudflare copy; never publish server secrets or TLS files."""
from pathlib import Path, PurePosixPath
import hashlib, hmac, json, re, secrets, tarfile

ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT.parent / 'site-migration/our-story-private.tar.gz'
PASSWORD_FILE = Path('C:/Users/31229/Documents/Codex/2026-10-25/referenced-chatgpt-conversation-this-is-an-2/outputs/照片管理登录信息.txt')
PUBLIC = ROOT / 'public'
PRIVATE = ROOT / 'private'
PRIVATE.mkdir(exist_ok=True)
PUBLIC.mkdir(exist_ok=True)
allowed_root = {'index.html','app.js','album.css','cinema.css','config.js','cosmos.js','cute.css','manage.css','manage.html','manage.js','style.css'}
manifest = []
with tarfile.open(ARCHIVE) as archive:
    library_bytes = archive.extractfile('data/library.json').read()
    library = json.loads(library_bytes)
    env_text = archive.extractfile('private/manager.env').read().decode()
    old_env = dict(line.split('=',1) for line in env_text.splitlines() if '=' in line and not line.startswith('#'))
    for member in archive:
        if not member.isfile():
            continue
        path = PurePosixPath(member.name)
        if '..' in path.parts or path.is_absolute():
            raise RuntimeError('Unsafe archive path')
        output = None
        if path.parts[0] == 'site':
            relative = PurePosixPath(*path.parts[1:])
            if str(relative) in allowed_root or (relative.parts[0] == 'assets' and all(not p.startswith('.') for p in relative.parts)):
                output = PUBLIC / str(relative)
        elif len(path.parts) == 3 and path.parts[:2] == ('data','uploads') and re.fullmatch(r'[a-f0-9]{64}\.webp',path.name):
            output = PUBLIC / 'uploads' / path.name
        if output:
            contents = archive.extractfile(member).read()
            digest = hashlib.sha256(contents).hexdigest()
            if output.parent.name == 'uploads' and output.stem != digest:
                raise RuntimeError('Image checksum mismatch')
            output.parent.mkdir(parents=True,exist_ok=True)
            output.write_bytes(contents)
            manifest.append({'path':output.relative_to(PUBLIC).as_posix(),'bytes':len(contents),'sha256':digest})

# Confirm the existing password before deriving a Workers-compatible verifier.
password_text = PASSWORD_FILE.read_text(encoding='utf-8-sig')
match = re.search(r'管理密码[：:]\s*(\S+)',password_text)
if not match:
    raise RuntimeError('Cannot locate existing management password')
password = match.group(1)
old_salt = old_env['STORY_PASSWORD_SALT'].strip().strip("\"'")
old_hash = old_env['STORY_PASSWORD_HASH'].strip().strip("\"'")
check = hashlib.scrypt(password.encode(),salt=bytes.fromhex(old_salt),n=16384,r=8,p=1,dklen=32).hex()
if not hmac.compare_digest(check,old_hash):
    raise RuntimeError('Existing management password did not match snapshot verifier')
salt = secrets.token_bytes(24)
verifier = hashlib.pbkdf2_hmac('sha256',password.encode(),salt,100000,dklen=32).hex()
secret_values = {'STORY_PASSWORD_SALT':salt.hex(),'STORY_PASSWORD_HASH':verifier}
(PRIVATE/'secrets.json').write_text(json.dumps(secret_values),encoding='utf-8')
(ROOT/'.dev.vars').write_text('\n'.join(f'{k}="{v}"' for k,v in secret_values.items())+'\nSTORY_DEV="1"\n',encoding='utf-8')
(PRIVATE/'library.json').write_bytes(library_bytes)
quote = lambda s: "'"+s.replace("'","''")+"'"
sql = []
for index,trip in enumerate(library['trips']):
    data = json.dumps(trip,ensure_ascii=False,separators=(',',':'))
    statement = f"INSERT OR IGNORE INTO trips(id,data,position,archived) VALUES({quote(trip['id'])},{quote(data)},{index},{int(bool(trip.get('archived')))});"
    if len(statement.encode()) >= 100000:
        raise RuntimeError('Seed statement exceeds D1 limit')
    sql.append(statement)
(ROOT/'seed.sql').write_text('\n'.join(sql),encoding='utf-8')
photo_sql = [f"INSERT OR IGNORE INTO photo_files(hash,bytes) VALUES({quote(m['sha256'])},{m['bytes']});" for m in manifest if m['path'].startswith('uploads/')]
(ROOT/'photo-seed.sql').write_text('\n'.join(photo_sql),encoding='utf-8')
for trip in library['trips']:
    for photo in trip.get('photos',[]) + (trip.get('live') or {}).get('photos',[]):
        if not (PUBLIC/photo['src'].lstrip('/')).is_file():
            raise RuntimeError('Missing referenced photo')
live = [t['live'] for t in library['trips'] if t.get('live') and not t.get('archived')]
report = {'published_albums':len(live),'published_photos':sum(len(t['photos']) for t in live),'stored_photos':sum(m['path'].startswith('uploads/') for m in manifest),'asset_files':len(manifest),'asset_bytes':sum(m['bytes'] for m in manifest),'all_trips_including_archived':len(library['trips']),'existing_password_verified':True,'production_dns_changed':False}
(PRIVATE/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'preparation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(PUBLIC/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n/uploads/*\n  Cache-Control: public, max-age=31536000, immutable\n/manage.html\n  Cache-Control: no-store\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
