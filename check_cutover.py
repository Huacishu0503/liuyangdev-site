"""Read-only cutover evidence; never prints authentication material."""
from pathlib import Path
import concurrent.futures, json, os, time, tomllib
import dns.message, dns.query, dns.rdatatype
import requests

ROOT = Path(__file__).resolve().parent
ACCOUNT = '70b076761bb78adbd7714e6668d8df05'
report = {'time': time.time()}
for record_type in ['NS', 'DS']:
    try:
        response = dns.query.udp(dns.message.make_query('liuyangdev.site', record_type, want_dnssec=True), '64.96.2.1', timeout=5)
        sections = list(response.answer) + list(response.authority)
        report['parent_' + record_type.lower()] = [str(rdata) for rrset in sections if rrset.rdtype == dns.rdatatype.from_text(record_type) for rdata in rrset]
    except Exception as error:
        report['parent_' + record_type.lower() + '_error'] = type(error).__name__

credentials = tomllib.loads((Path(os.environ['APPDATA']) / 'xdg.config/.wrangler/config/default.toml').read_text())
session = requests.Session()
session.headers['Authorization'] = 'Bearer ' + credentials['oauth_token']
requests_to_make = {
    'zones': 'zones?name=liuyangdev.site&account.id=' + ACCOUNT,
    'domains': f'accounts/{ACCOUNT}/pages/projects/our-story-liuyang-2026/domains',
}

def check_api(item):
    key, path = item
    try:
        response = session.get('https://api.cloudflare.com/client/v4/' + path, timeout=20)
        data = response.json()
        if not data.get('success'):
            return key, {'http': response.status_code, 'errors': data.get('errors')}
        if key == 'zones':
            return key, [{'name': zone['name'], 'status': zone['status']} for zone in data['result']]
        return key, [{'name': domain['name'], 'status': domain['status'], 'certificate': domain.get('validation_data', {}).get('status')} for domain in data['result']]
    except Exception as error:
        return key, {'error': type(error).__name__}

with concurrent.futures.ThreadPoolExecutor(2) as executor:
    for key, result in executor.map(check_api, requests_to_make.items()):
        report[key] = result

(ROOT / 'private/cutover-status.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
