from pathlib import Path
import getpass,hashlib,json,paramiko
ROOT=Path(__file__).resolve().parent
OLD=Path('C:/Users/31229/Documents/Codex/2026-10-25/referenced-chatgpt-conversation-this-is-an-2')
ssh=paramiko.SSHClient()
ssh.load_host_keys(str(OLD/'work/new-story-known-hosts'))
ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect('114.132.218.113',username='ubuntu',password=getpass.getpass('Source server password: '),look_for_keys=False,allow_agent=False,timeout=20)
stdin,stdout,stderr=ssh.exec_command('sudo -n cat /var/lib/our-story/library.json',timeout=30)
data=stdout.read();status=stdout.channel.recv_exit_status();ssh.close()
if status: raise RuntimeError('Cannot read source metadata')
library=json.loads(data)
previous=(ROOT/'private/library.json').read_bytes()
(ROOT/'private/origin-before-cutover.json').write_bytes(data)
report={'source_library_unchanged_since_backup':hashlib.sha256(data).digest()==hashlib.sha256(previous).digest(),'published_albums':sum(bool(t.get('live')) and not t.get('archived') for t in library['trips']),'published_photos':sum(len(t['live']['photos']) for t in library['trips'] if t.get('live') and not t.get('archived'))}
(ROOT/'private/origin-cutover-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
