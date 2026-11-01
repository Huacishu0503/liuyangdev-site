from pathlib import Path
import json, shutil, zipfile
root=Path(__file__).resolve().parent
public=root/'public'
public.mkdir(exist_ok=True)
for path in (root.parent/'public').rglob('*'):
    relative=path.relative_to(root.parent/'public')
    if path.is_file() and relative.parts[0]!='uploads':
        dest=public/relative
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(path,dest)
shutil.copyfile(root/'worker.mjs',public/'_worker.js')
shutil.copyfile(root/'404.html',public/'404.html')
(public/'_routes.json').write_text(json.dumps({'version':1,'include':['/*'],'exclude':[]}),encoding='utf-8')
headers=(public/'_headers').read_text(encoding='utf-8').replace('/*\n','/*\n  X-Robots-Tag: noindex, nofollow\n',1)
(public/'_headers').write_text(headers,encoding='utf-8')
with zipfile.ZipFile(root/'public.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in public.rglob('*'):
        if path.is_file(): archive.write(path,path.relative_to(public).as_posix())
print('Prepared gateway files:',sum(p.is_file() for p in public.rglob('*')),'ZIP bytes:',(root/'public.zip').stat().st_size)
