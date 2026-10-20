// Run: node tests/car-motion.cjs [URL]; default tests the local HTML.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true, args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:300},isMobile:true,hasTouch:true});
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    const fs=require('node:fs');
    const target=process.argv[2] || 'https://liuyangdev.site/?motion-local=1';
    await page.route('**/*',async route=>{
      if(route.request().resourceType()!=='document') {
        if(process.argv[2]) return route.continue();
        const asset=path.join(path.resolve(__dirname,'..'),new URL(route.request().url()).pathname);
        if(fs.existsSync(asset)) return route.fulfill({path:asset});
        return route.continue();
      }
      const response=process.argv[2] ? await route.fetch() : null;
      let html=response ? await response.text() : fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
      html=html.replace('renderBoard(-1);\ntick();','window.__motionScene=scene; window.__motionCamera=camera;\nrenderBoard(-1);\ntick();');
      await route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto(target);
    await page.waitForFunction(()=>window.__motionScene);
    const sample=()=>page.evaluate(()=>{
      const car=window.__motionScene.children.find(o=>o.type==='Group');
      return {carZ:car.position.z,carY:car.position.y,cameraZ:window.__motionCamera.position.z,speed:parseFloat(document.getElementById('speed').textContent),hidden:document.getElementById('overlay').classList.contains('hidden')};
    });
    const initial=await sample();
    await page.tap('#main-btn');
    await page.waitForFunction(()=>parseFloat(document.getElementById('speed').textContent)>=25,null,{timeout:30000});
    const moving=await sample();
    console.log(JSON.stringify({initial,moving,errors}));
    assert.equal(moving.hidden,true,'mobile GO must start the game');
    assert.ok(moving.carZ>initial.carZ+1,'vehicle must advance in world space, not only the camera');
    assert.ok(Math.abs(moving.carZ-moving.cameraZ-11)<1e-6,'vehicle must stay 11m ahead of chase camera');
    assert.deepEqual(errors,[],'page must have no JavaScript errors');
    // A second start must reset the model, then advance it again.
    await page.evaluate(()=>document.getElementById('main-btn').click());
    await page.waitForFunction(()=>{const speed=parseFloat(document.getElementById('speed').textContent);return speed>=10 && speed<20});
    const restarted=await sample();
    assert.ok(restarted.carZ<moving.carZ,'restart must reset distance');
    assert.ok(Math.abs(restarted.carZ-restarted.cameraZ-11)<1e-6);
    console.log('PASS: mobile start, world motion, chase-camera offset, restart, no JS errors');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
