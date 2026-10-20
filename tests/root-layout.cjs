// Run with Node; verifies the game is published at the domain root.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(html.includes('id="main-btn"'),'homepage must contain the game start control');
assert.ok(html.includes('car.position.z=S.x'),'homepage must include the vehicle motion fix');
assert.ok(!fs.existsSync(path.join(root,'brake')),'obsolete brake subdirectory must be removed');
assert.ok(!html.includes('href="../"'),'homepage must not contain an obsolete parent link');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"|url\(['"]?([^)'"\s]+)['"]?\)/g)){
 const ref=match[1]||match[2];
 if(/^(data:|https?:|\/\/)/.test(ref))continue;
 assert.ok(fs.existsSync(path.resolve(root,ref)),`missing root asset: ${ref}`);
}
assert.equal(fs.readFileSync(path.join(root,'CNAME'),'utf8').trim(),'liuyangdev.site');
console.log('PASS: root game, motion fix, local assets, CNAME, no brake subdirectory');
