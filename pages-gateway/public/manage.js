(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let trips = [], current = null, busy = false, unsaved = false;
  const text = (tag, className, value) => { const e = document.createElement(tag); e.className = className; if (value !== undefined) e.textContent = value; return e; };
  function notice(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(notice.timer); notice.timer = setTimeout(() => $('notice').hidden = true, 3800); }
  function showLogin() { $('login-panel').hidden = false; $('workspace').hidden = true; $('logout').hidden = true; }
  async function api(path, { method = 'GET', data, image } = {}) {
    const options = { method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (image) { options.body = image; options.headers['Content-Type'] = 'image/webp'; }
    else if (data !== undefined) { options.body = JSON.stringify(data); options.headers['Content-Type'] = 'application/json'; }
    let response;
    try { response = await fetch('api/' + path, options); } catch { throw new Error('网络没有连上，请稍后重试。已保存的草稿不会丢失。'); }
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== 'login') showLogin();
    if (!response.ok) throw new Error(body.error || (response.status === 413 ? '照片太大，请换一张或稍后重试。' : '暂时无法完成，请稍后重试。'));
    return body;
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['save-draft','publish','new-trip','first-trip','unpublish','archive-trip','photo-input']) $(id).disabled = value;
    $('editor').setAttribute('aria-busy', String(value));
  }
  function mergeTrip(trip) {
    const index = trips.findIndex(t => t.id === trip.id);
    if (index >= 0) trips[index] = trip; else trips.unshift(trip);
    current = trip;
  }
  function renderList() {
    $('trip-list').replaceChildren(); $('list-empty').hidden = trips.length > 0;
    for (const trip of trips) {
      const button = text('button','trip-option'); button.type = 'button'; button.setAttribute('aria-pressed', String(current?.id === trip.id));
      button.append(text('strong','',trip.place),text('small','',`${trip.photos.length} 张照片 · ${trip.published ? trip.dirty ? '有未发布修改' : '已发布' : '草稿'}`));
      button.addEventListener('click', async () => { if (busy) return; if (unsaved && !await confirmAction('切换旅行？','这页还没保存的文字和排序会丢失。已上传的照片仍在草稿里。','切换')) return; selectTrip(trip); });
      $('trip-list').append(button);
    }
  }
  function updateStatus() {
    if (!current) return;
    $('draft-status').textContent = current.published ? unsaved || current.dirty ? '有未发布修改' : '已发布' : '草稿';
    $('draft-status').classList.toggle('published',current.published && !unsaved && !current.dirty);
    $('unpublish').hidden = !current.published;
  }
  function selectTrip(trip) {
    current = trip; unsaved = false; $('editor-empty').hidden = true; $('editor').hidden = false;
    $('editor-title').textContent = trip.place + '的小回忆'; $('place').value = trip.place; $('category').value = trip.category;
    $('title').value = trip.title; $('trip-date').value = trip.date || '';
    $('description').value = trip.description || ''; $('editor-error').textContent = ''; $('upload-progress').hidden = true;
    renderList(); renderPhotos(); updateStatus();
  }
  function markUnsaved() { unsaved = true; updateStatus(); }
  $('trip-form').addEventListener('input',markUnsaved);
  function renderPhotos() {
    $('photo-list').replaceChildren(); $('drop-zone').hidden = current.photos.length > 0;
    current.photos.forEach((photo,index) => {
      const tile = text('div','photo-tile'); const img = new Image(); img.src = photo.src; img.alt = photo.alt || '旅行照片'; img.loading = 'lazy'; tile.append(img);
      if (index === 0) tile.append(text('span','cover-tag','封面'));
      const label = text('label','','照片说明'); const input = document.createElement('input'); input.value = photo.caption || ''; input.maxLength = 200; input.placeholder = '写一句小回忆';
      input.addEventListener('input',() => { photo.caption = input.value; photo.alt = input.value || current.place + '旅行照片'; markUnsaved(); }); label.append(input);tile.append(label);
      const tools = text('div','photo-tools'), controls = text('div','move-controls');
      for (const [symbol,step,aria] of [['←',-1,'照片前移'],['→',1,'照片后移']]) {
        const button = text('button','',symbol);button.type='button';button.setAttribute('aria-label',`${aria}：第 ${index+1} 张`);button.disabled = step < 0 ? index === 0 : index === current.photos.length-1;
        button.addEventListener('click',() => { if (busy) return; const destination=index+step;[current.photos[index],current.photos[destination]]=[current.photos[destination],current.photos[index]];markUnsaved();renderPhotos(); });controls.append(button);
      }
      const remove = text('button','remove','删除照片'); remove.type='button';remove.setAttribute('aria-label',`删除第 ${index+1} 张照片`);remove.addEventListener('click',async()=>{
        if (busy || !await confirmAction('删除这张照片？','确认后立即从草稿和公开相册移除，无需再次发布。删掉已发布相册的最后一张时，会自动撤下这段旅行。','删除照片')) return;
        setBusy(true);$('editor-error').textContent='';
        try {
          const result=await api('trips/'+current.id+'/photos/'+photo.id,{method:'DELETE'});
          // Keep this page's unsaved text, captions and order intact.
          current.photos=current.photos.filter(p=>p.id!==photo.id);
          current.published=result.trip.published;current.dirty=result.trip.dirty;
          renderPhotos();renderList();updateStatus();notice('照片已删除，公开相册已同步更新。');
        }catch(error){$('editor-error').textContent=error.message;}finally{setBusy(false);}
      });tools.append(controls,remove);tile.append(tools);$('photo-list').append(tile);
    });
  }
  async function loadTrips() {
    const result = await api('admin/trips'); trips = result.trips;
    $('login-panel').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
    if (trips.length) selectTrip(trips[0]); else { current=null;renderList();$('editor').hidden=true;$('editor-empty').hidden=false; }
  }
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();$('login-error').textContent='';$('login-button').disabled=true;
    try { await api('login',{method:'POST',data:{password:$('password').value}});$('password').value='';await loadTrips(); }
    catch(error){$('login-error').textContent=error.message;}finally{$('login-button').disabled=false;}
  });
  $('logout').addEventListener('click',async()=>{ if(busy) return;try{await api('logout',{method:'POST'});unsaved=false;showLogin();}catch(error){notice(error.message);} });
  async function newDialog() { if(busy)return;if(unsaved && !await confirmAction('先开始新旅行？','当前没有保存的文字与排序会丢失，已上传的照片仍在原草稿里。','开始新旅行'))return;$('new-error').textContent='';$('new-place').value='';$('new-dialog').showModal(); }
  $('new-trip').addEventListener('click',newDialog);$('first-trip').addEventListener('click',newDialog);$('close-new').addEventListener('click',()=>$('new-dialog').close());
  $('new-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('new-form').querySelector('button[type=submit]');button.disabled=true;
    try { const place=$('new-place').value.trim();const result=await api('trips',{method:'POST',data:{place,title:'和你一起去'+place,category:'旅行'}});mergeTrip(result.trip);selectTrip(current);$('new-dialog').close();notice('草稿建好啦，可以选照片了。'); }
    catch(error){$('new-error').textContent=error.message;}finally{button.disabled=false;}
  });
  let confirmResolve = null;
  function confirmAction(title,copy,button='确认') {
    $('confirm-title').textContent=title;$('confirm-copy').textContent=copy;$('confirm-ok').textContent=button;$('confirm-dialog').showModal();
    return new Promise(resolve=>confirmResolve=resolve);
  }
  function endConfirm(value){$('confirm-dialog').close();if(confirmResolve){confirmResolve(value);confirmResolve=null;}}
  $('confirm-ok').addEventListener('click',()=>endConfirm(true));$('confirm-cancel').addEventListener('click',()=>endConfirm(false));$('confirm-dialog').addEventListener('cancel',()=>{if(confirmResolve){confirmResolve(false);confirmResolve=null;}});
  function draftPayload() {
    if (!$('trip-form').reportValidity()) throw new Error('先写好地点、分类和标题，再保存。');
    return {place:$('place').value.trim(),category:$('category').value.trim(),title:$('title').value.trim(),date:$('trip-date').value,description:$('description').value.trim(),photos:current.photos.map(p=>({id:p.id,caption:p.caption||'',alt:p.alt||''}))};
  }
  async function saveCurrent() {
    const result=await api('trips/'+current.id,{method:'PATCH',data:draftPayload()});mergeTrip(result.trip);unsaved=false;renderList();updateStatus();return result.trip;
  }
  $('save-draft').addEventListener('click',async()=>{if(!current||busy)return;$('editor-error').textContent='';setBusy(true);try{await saveCurrent();notice('草稿已保存，公开相册尚未变化。');}catch(error){$('editor-error').textContent=error.message;}finally{setBusy(false);}});
  $('publish').addEventListener('click',async()=>{
    if(!current||busy)return;$('editor-error').textContent='';setBusy(true);
    try{await saveCurrent();const result=await api('trips/'+current.id+'/publish',{method:'POST'});mergeTrip(result.trip);unsaved=false;renderList();updateStatus();notice('发布好啦！另一台设备刷新相册就能看到。');}
    catch(error){$('editor-error').textContent=error.message;}finally{setBusy(false);}
  });
  $('unpublish').addEventListener('click',async()=>{
    if(!current||busy||!await confirmAction('暂时从相册撤下？','照片和草稿会保留，以后可以重新发布。','撤下'))return;
    setBusy(true);try{const result=await api('trips/'+current.id+'/unpublish',{method:'POST'});mergeTrip(result.trip);selectTrip(current);notice('已撤下，草稿还在。');}catch(error){$('editor-error').textContent=error.message;}finally{setBusy(false);}
  });
  $('archive-trip').addEventListener('click',async()=>{
    if(!current||busy||!await confirmAction('收起这段旅行？','它会从清单和公开相册中收起；服务器照片文件保留。','收起'))return;
    setBusy(true);try{await api('trips/'+current.id+'/archive',{method:'POST'});unsaved=false;await loadTrips();notice('已收起这段旅行。');}catch(error){$('editor-error').textContent=error.message;}finally{setBusy(false);}
  });
  async function compressPhoto(file) {
    if(!/\.(jpe?g|png|webp)$/i.test(file.name) && !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error(`${file.name}：暂不支持这个格式，请选择 JPEG、PNG 或 WebP。`);
    if(file.size>45*1024*1024)throw new Error(`${file.name} 太大，请先从相册导出小一点的版本。`);
    let bitmap;
    try { bitmap=await createImageBitmap(file,{imageOrientation:'from-image'}); } catch {
      const url=URL.createObjectURL(file);
      try{bitmap=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url;});}catch{throw new Error(`${file.name} 无法读取，请从相册导出为 JPEG 后重试。`);}finally{URL.revokeObjectURL(url);}
    }
    const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);if(bitmap.close)bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.84));canvas.width=canvas.height=1;
    if(!blob||blob.type!=='image/webp')throw new Error('当前浏览器不能处理照片，请用新版 Chrome、Edge 或 Safari 打开。');
    if(blob.size>12*1024*1024)throw new Error(`${file.name} 压缩后仍太大，请换一张。`);return blob;
  }
  async function uploadFiles(files) {
    if(!current||busy||!files.length)return;setBusy(true);$('editor-error').textContent='';$('upload-progress').hidden=false;
    let finished=0;
    try {
      await saveCurrent();
      for(const file of files){
        $('upload-progress').textContent=`正在整理并上传 ${finished+1} / ${files.length}：${file.name}`;
        const blob=await compressPhoto(file);const result=await api('trips/'+current.id+'/photos',{method:'POST',image:blob});mergeTrip(result.trip);finished++;renderPhotos();renderList();updateStatus();
      }
      $('upload-progress').textContent=`${finished} 张照片已放进草稿，点“保存并发布”就能出现在相册里。`;notice('照片上传好了，还差一步发布。');
    }catch(error){$('editor-error').textContent=error.message;$('upload-progress').textContent=`本次已处理 ${finished} / ${files.length} 张。已上传的照片保存在草稿中，可以继续选照片。`;}
    finally{setBusy(false);$('photo-input').value='';}
  }
  $('photo-input').addEventListener('change',event=>uploadFiles([...event.target.files]));
  $('drop-zone').addEventListener('click',()=>{if(!busy)$('photo-input').click();});$('drop-zone').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(!busy)$('photo-input').click();}});
  for(const type of ['dragenter','dragover'])$('drop-zone').addEventListener(type,event=>{event.preventDefault();$('drop-zone').classList.add('dragover');});
  for(const type of ['dragleave','drop'])$('drop-zone').addEventListener(type,event=>{event.preventDefault();$('drop-zone').classList.remove('dragover');if(type==='drop')uploadFiles([...event.dataTransfer.files]);});
  window.addEventListener('beforeunload',event=>{if(unsaved||busy){event.preventDefault();event.returnValue='';}});
  api('session').then(loadTrips).catch(()=>showLogin());
})();
