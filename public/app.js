(async () => {
  'use strict';
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  const config = window.STORY_CONFIG || {};
  let refreshTimeline=()=>{};
  const $ = id => document.getElementById(id);
  const storageKey = 'our-story-preview-v1';
  const baseSignature = JSON.stringify([config.startAt, config.names]);
  let personal = {};
  try { const stored = JSON.parse(localStorage.getItem(storageKey)); if (stored?.base === baseSignature) personal = stored.value || {}; } catch {}
  const defaultNames = Array.isArray(config.names) ? config.names : ['你', '我'];
  let startAt = personal.startAt ?? config.startAt;
  let names = personal.names || defaultNames;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Start within the first real interaction when the browser blocks autoplay.
  // Explicit pause is remembered and never overridden by unrelated clicks.
  const ambient = $('ambient-audio');
  const soundButtons = [...document.querySelectorAll('.ambient-toggle')];
  let soundPaused = false, soundStarting = false, soundFailed = false;
  try { soundPaused = localStorage.getItem('our-story-bgm-v1') === 'paused'; } catch {}
  const music = config.music || {};
  ambient.src = music.src || 'assets/canon-lee-galloway.mp3';
  ambient.volume = Math.max(0, Math.min(0.25, Number.isFinite(music.volume) ? music.volume : 0.22));
  function rememberSound() { try { localStorage.setItem('our-story-bgm-v1', soundPaused ? 'paused' : 'on'); } catch {} }
  function soundUI() {
    const playing = !ambient.paused && !ambient.ended;
    const label = playing ? '暂停背景音乐' : '播放背景音乐';
    soundButtons.forEach(button => {
      button.dataset.state = playing ? 'playing' : soundPaused ? 'paused' : soundFailed ? 'error' : 'waiting';
      button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(playing));
      button.title = playing ? `${music.title || '卡农'} · 轻点暂停` : soundFailed ? '音乐暂未加载，轻点重试' : soundPaused ? '背景音乐已暂停，轻点继续' : '轻点页面，让旋律陪你翻看回忆';
      const caption = button.querySelector('.ambient-label');
      if (caption) caption.textContent = playing ? '音乐中' : soundPaused ? '已暂停' : '开启音乐';
    });
  }
  function stopSoundUnlock() { document.removeEventListener('click', soundUnlock, true); document.removeEventListener('keydown', soundUnlock, true); }
  async function startSound() {
    if (soundPaused || soundStarting || !ambient.paused) return;
    soundStarting = true; soundFailed = false;
    try { await ambient.play(); stopSoundUnlock(); }
    catch (error) { if (!soundPaused && error.name !== 'NotAllowedError' && error.name !== 'AbortError') soundFailed = true; }
    finally { soundStarting = false; soundUI(); }
  }
  function soundUnlock(event) {
    if (event.target.closest?.('.ambient-toggle') || soundPaused || (event.type === 'keydown' && (event.ctrlKey || event.metaKey || event.altKey))) return;
    startSound();
  }
  function armSoundUnlock() { document.addEventListener('click', soundUnlock, true); document.addEventListener('keydown', soundUnlock, true); }
  soundButtons.forEach(button => button.addEventListener('click', () => {
    if (!ambient.paused) { soundPaused = true; ambient.pause(); stopSoundUnlock(); }
    else { soundPaused = false; if (ambient.error) ambient.load(); armSoundUnlock(); startSound(); }
    rememberSound(); soundUI();
  }));
  ambient.addEventListener('playing', () => { soundFailed = false; stopSoundUnlock(); soundUI(); });
  ambient.addEventListener('pause', soundUI);
  ambient.addEventListener('error', () => { soundFailed = true; soundUI(); });
  soundUI();
  if (!soundPaused) { armSoundUnlock(); startSound(); }
  let travelUnlocked = false, pendingUnlock = null, unlockResolver = null, navigationId = 0;
  let releaseMemories;
  const memoriesPermission = new Promise(resolve => { releaseMemories = resolve; });
  const travelLock = $('travel-lock');
  function requestTravelPassword() {
    if (pendingUnlock) return pendingUnlock;
    $('travel-password').value = ''; $('travel-lock-error').textContent = '';
    pendingUnlock = new Promise(resolve => { unlockResolver = resolve; });
    travelLock.showModal(); document.body.classList.add('modal-open'); $('travel-password').focus();
    return pendingUnlock;
  }
  async function switchView(view, push = false) {
    view = view === 'memories' ? 'memories' : 'home';
    const currentNavigation = ++navigationId;
    if (view === 'memories' && !travelUnlocked) {
      if (!await requestTravelPassword() || currentNavigation !== navigationId) return;
      travelUnlocked = true; releaseMemories();
    }
    if (view === 'home') {
      travelUnlocked = false;
      if (travelLock.open) travelLock.close();
      ['album-dialog','lightbox'].forEach(id => { if ($(id).open) $(id).close(); });
    }
    for (const name of ['home', 'memories']) {
      const visible = name === view;
      $(`${name}-view`).hidden = !visible;
      $(`${name}-tab`).setAttribute('aria-selected', String(visible));
      $(`${name}-tab`).tabIndex = visible ? 0 : -1;
    }
    document.body.dataset.view = view;
    document.documentElement.classList.toggle('is-memories', view === 'memories');
    if (push && location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
    const panel = $(`${view}-view`);
    if (!reducedMotion && panel.animate) panel.animate([{opacity:0, transform:'translateY(7px)'},{opacity:1, transform:'translateY(0)'}], {duration:260,easing:'ease-out'});
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view, true)));
  document.querySelector('.page-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const view = event.key === 'Home' ? 'home' : event.key === 'End' ? 'memories' : document.body.dataset.view === 'home' ? 'memories' : 'home';
    switchView(view, true); $(`${view}-tab`).focus();
  });
  window.addEventListener('popstate', () => switchView(location.hash === '#memories' ? 'memories' : 'home'));
  window.addEventListener('hashchange', () => switchView(location.hash === '#memories' ? 'memories' : 'home'));
  $('travel-lock-close').addEventListener('click', () => travelLock.close());
  travelLock.addEventListener('close', () => {
    const resolve = unlockResolver; unlockResolver = null; pendingUnlock = null;
    if (resolve) {
      resolve(false);
      if (location.hash === '#memories') history.replaceState(null,'','#home');
    }
    document.body.classList.toggle('modal-open', !!document.querySelector('dialog[open]'));
  });
  $('travel-unlock-form').addEventListener('submit', async event => {
    event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
    const requestId = navigationId;
    $('travel-lock-error').textContent = '正在打开回忆…';
    try {
      const response=await fetch('/api/view/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('travel-password').value})});
      const result=await response.json();
      if (!response.ok) throw new Error(response.status===401?'密码不正确，请再试一次。':result.error||'暂时无法打开，请重试。');
      if (requestId !== navigationId || !travelLock.open) return;
      $('travel-password').value='';
      const resolve=unlockResolver;unlockResolver=null;pendingUnlock=null;
      travelLock.close(); resolve?.(true);
    } catch(error) { if (travelLock.open) $('travel-lock-error').textContent=error.message||'连接中断，请重试。'; }
    finally { button.disabled=false; }
  });
  switchView(location.hash === '#memories' ? 'memories' : 'home');
  let cuddleCount = 0;
  const cuddleMessages = ['贴贴成功！快乐 +1 ♡','汪！今天的喜欢也是满格。','靠近一点，再靠近一点。','小狗认证：你是最可爱的人！','普通的日子，有你就软乎乎。'];
  $('pet-puppies').addEventListener('click', () => {
    $('puppy-message').textContent = cuddleMessages[cuddleCount++ % cuddleMessages.length];
    if (reducedMotion) return;
    $('pet-puppies').animate([{transform:'rotate(0) scale(1)'},{transform:'rotate(-3deg) scale(1.06)',offset:.35},{transform:'rotate(2deg) scale(1.04)',offset:.7},{transform:'rotate(0) scale(1)'}],{duration:480,easing:'ease-out'});
    const heart = document.createElement('span');heart.className='cuddle-heart';heart.textContent='♡';$('puppy-hearts').append(heart);setTimeout(()=>heart.remove(),1200);
  });

  const toast = message => { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timeout); toast.timeout = setTimeout(() => $('toast').hidden = true, 3500); };
  const syncScroll = () => document.body.classList.toggle('modal-open', !!document.querySelector('dialog[open]'));
  const openDialog = dialog => { dialog.showModal(); syncScroll(); };
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', syncScroll);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog || dialog === $('lightbox')) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });
  function setNumber(id, value) {
    const node = $(id);
    if (node.textContent === value) return;
    node.textContent = value;
    if (!reducedMotion && typeof node.animate === 'function') {
      node.animate([{ opacity: 0.8, transform: 'translateY(1.5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out' });
    }
  }
  function tick() {
    const valid = typeof startAt === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(startAt) && Number.isFinite(Date.parse(startAt));
    const elapsed = valid ? Date.now() - Date.parse(startAt) : -1;
    if (!valid || elapsed < 0) {
      ['days', 'hours', 'minutes', 'seconds'].forEach(id => $(id).textContent = '—');
      $('timer-status').textContent = valid ? '约定的相伴时光，尚未开始' : '等待写下我们的第一天';
      $('since-label').textContent = valid ? '期待属于我们的那一天' : '从属于我们的那一天开始';
      $('set-date').textContent = '写下纪念日 ↗';
      return;
    }
    const seconds = Math.floor(elapsed / 1000);
    setNumber('days', String(Math.floor(seconds / 86400)));
    setNumber('hours', String(Math.floor(seconds / 3600) % 24).padStart(2, '0'));
    setNumber('minutes', String(Math.floor(seconds / 60) % 60).padStart(2, '0'));
    setNumber('seconds', String(seconds % 60).padStart(2, '0'));
    $('since-label').textContent = `始于 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(startAt))}`;
    $('timer-status').textContent = personal.startAt ? '♡ 今天也在喜欢你 · 本机预览' : '♡ 今天也在认真喜欢你';
    $('set-date').textContent = '我们的纪念日 ↗';
  }
  function updateNames() { $('names').textContent = `${names[0] || '你'} & ${names[1] || '我'}`; }
  updateNames(); tick();
  setInterval(() => { if (!document.hidden) tick(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  const settings = $('settings-dialog');
  function showSettings() {
    $('name-one').value = names[0] || ''; $('name-two').value = names[1] || '';
    const date = startAt && Number.isFinite(Date.parse(startAt)) ? new Date(Date.parse(startAt) + 8 * 3600000).toISOString().slice(0, 19) : '';
    $('start-date').value = date; $('date-error').textContent = ''; openDialog(settings);
  }
  $('set-date').addEventListener('click', showSettings); $('customize').addEventListener('click', showSettings);
  $('close-settings').addEventListener('click', () => settings.close());
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const dateValue = $('start-date').value;
    if (!dateValue) { $('date-error').textContent = '请先选择你们真实的恋爱开始时间。'; return; }
    const selected = `${dateValue}+08:00`;
    if (!Number.isFinite(Date.parse(selected)) || Date.parse(selected) > Date.now()) { $('date-error').textContent = '请选择已经到来的日期，计时会从真实的那一天开始。'; return; }
    names = [$('name-one').value.trim() || defaultNames[0], $('name-two').value.trim() || defaultNames[1]];
    startAt = selected; personal = { names, startAt };
    let saved = true;
    try { localStorage.setItem(storageKey, JSON.stringify({ base: baseSignature, value: personal })); } catch { saved = false; }
    tick(); updateNames(); refreshTimeline(); settings.close(); toast(saved ? '已保存在当前浏览器，时光开始流动。' : '当前预览已更新，浏览器未允许保存。');
  });
  $('reset-settings').addEventListener('click', () => {
    try { localStorage.removeItem(storageKey); } catch {}
    personal = {}; startAt = config.startAt; names = defaultNames; updateNames(); tick(); refreshTimeline(); settings.close(); toast('已恢复网站默认内容。');
  });
  const demoTrips = [
    { id: 'illustration-coast', place: '海边', title: '把喜欢写进海风里', date: '', category: '海边', cover: 'assets/coast.svg', description: '听海浪，等落日。这里先放一张海岸插画，等你们真实的照片与故事到来。', photos: [{ src: 'assets/coast.svg', caption: '海边插画示意 · 并非真实旅行照片', alt: '海岸与小路的插画' }, { src: 'assets/twilight.svg', caption: '暮色插画示意 · 留给一起看过的落日', alt: '紫色暮光中的海面、月亮与船的插画' }] },
    { id: 'illustration-mountain', place: '山间', title: '去有风的地方', date: '', category: '山间', cover: 'assets/mountain.svg', description: '走慢一点，让山风把这一刻留住。这里是山野插画，未来可以换成你们一起走过的路。', photos: [{ src: 'assets/mountain.svg', caption: '山间插画示意 · 并非真实旅行照片', alt: '薄雾山峦与松树林插画' }] },
    { id: 'illustration-city', place: '城市', title: '和你，漫无目的', date: '', category: '城市', cover: 'assets/city.svg', description: '不用赶路，街角也有小小的浪漫。这里是街景插画，等待你们自己的城市记忆。', photos: [{ src: 'assets/city.svg', caption: '城市插画示意 · 并非真实旅行照片', alt: '街道、暖光窗户与自行车插画' }] }
  ];
  await memoriesPermission;
  let sourceTrips = Array.isArray(config.trips) ? config.trips : [];
  try {
    const response = await fetch('api/trips', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (response.status === 401) { location.reload(); return; }
    if (response.ok) { const library = await response.json(); if (Array.isArray(library.trips)) sourceTrips = library.trips; }
  } catch { /* Local static previews keep the configured illustrations. */ }
  const provided = sourceTrips.filter(t => t && typeof t.id === 'string' && Array.isArray(t.photos) && t.photos.some(p => typeof p?.src === 'string' && p.src));
  const isDemo = provided.length === 0;
  let trips = (isDemo ? demoTrips : provided).map(t => ({ ...t, photos: t.photos.filter(p => typeof p?.src === 'string' && p.src) }));
  // Keep additional volumes beside their original collection, in reading order.
  const volumeOf = trip => {
    const match = (trip.place || '').match(/^(.*?)\s*·\s*第(\d+)册$/);
    return match ? {base:match[1].trim(),number:Number(match[2])} : {base:trip.place || trip.id,number:1};
  };
  const collectionOrder = new Map();
  trips.filter(t => volumeOf(t).number === 1).forEach(t => {
    const base = volumeOf(t).base;
    if (!collectionOrder.has(base)) collectionOrder.set(base, collectionOrder.size);
  });
  trips.forEach(t => { const base = volumeOf(t).base; if (!collectionOrder.has(base)) collectionOrder.set(base, collectionOrder.size); });
  trips.sort((a,b) => collectionOrder.get(volumeOf(a).base) - collectionOrder.get(volumeOf(b).base) || volumeOf(a).number - volumeOf(b).number);
  const {mergeCollections,collectionDate,timelineCollections}=await import('./collections.mjs?v=3');
  trips=mergeCollections(trips);
  function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  function photo(src, alt, lazy = true, priority = false) {
    const img = new Image();
    img.alt = alt || '我们的旅行照片';
    img.decoding = 'async';
    img.loading = lazy ? 'lazy' : 'eager';
    if (priority) img.fetchPriority = 'high';
    img.src = src;
    img.addEventListener('error', () => { img.alt = '照片暂时无法加载，请检查照片路径'; img.classList.add('photo-error'); }, { once: true });
    return img;
  }
  $('memory-total').textContent = String(trips.length).padStart(2, '0');
  $('photo-total').textContent = String(trips.reduce((sum, trip) => sum + trip.photos.length, 0)).padStart(2, '0');
  const keepsakes = [trips[trips.length - 1], trips[0]].filter(Boolean);
  keepsakes.forEach((trip, index) => {
    const print = element('div', 'memory-print');
    print.append(photo(trip.cover || trip.photos[0].src, '', false), element('span', '', index === 0 ? 'with you, always.' : 'our little moments'));
    $('memory-prints').append(print);
  });
  const categories = ['全部足迹', ...new Set(trips.map(t => t.category || t.place || '旅行'))];
  categories.forEach((category, index) => {
    const button = element('button', 'filter', category); button.type = 'button'; button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.addEventListener('click', () => {
      $('filters').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      renderTrips(index === 0 ? trips : trips.filter(t => (t.category || t.place || '旅行') === category));
    }); $('filters').append(button);
  });
  if (!isDemo) {
    $('demo-note').textContent = '下一站，还是想和你一起。';
  }
  const chapterLines = ['那些想靠近的瞬间', '把风景，慢慢看进心里', '平常的小事，也值得珍藏', '这一页之后，还有我们'];
  function letterLine(trip) { return trip.category === '日常' ? '日子不必总是特别。\n那些平常的、细碎的瞬间，\n有你在，就值得好好收藏。' : '走过的路会渐渐远去，\n留下的喜欢，却可以翻看很多遍。\n这一封，写给一起看过风景的我们。'; }
  let lastFilteredTrips=trips;
  refreshTimeline=()=>renderTimeline(lastFilteredTrips);
  function renderTrips(items) {
    lastFilteredTrips=items;
    renderTimeline(items);
    $('trip-grid').replaceChildren(); $('empty-filter').hidden = items.length > 0;
    $('archive-label').textContent = `${String(items.length).padStart(2, '0')} 本相册`;
    items.forEach((trip, index) => {
      const button = element('button', 'trip-card'); button.type = 'button'; button.style.setProperty('--card-order', Math.min(index, 5)); button.setAttribute('aria-label', `展开${trip.place || '旅行'}，${trip.photos.length} 张照片${isDemo ? '（插画示意）' : ''}`);
      const visual = element('div', 'trip-visual');
      const eagerCard = index < 2;
      const cover = element('div', 'trip-cover'); cover.append(photo(trip.cover || trip.photos[0].src, trip.photos[0].alt, !eagerCard, index === 0)); visual.append(cover);
      if (trip.photos.length > 1) {
        const peeks = element('div', 'trip-peeks');
        trip.photos.slice(1, 3).forEach(p => { const frame = element('span', 'trip-peek'); frame.append(photo(p.src, p.alt || p.caption, !eagerCard)); peeks.append(frame); });
        if (trip.photos.length === 2) peeks.classList.add('single-peek');
        visual.append(peeks);
      } else visual.classList.add('single-cover');
      visual.append(element('span', 'trip-number', String(trips.indexOf(trip) + 1).padStart(2, '0')));
      visual.append(element('span', 'trip-preview', isDemo ? '插画示意' : `${trip.photos.length} 个瞬间`));
      const arrow = element('span', 'trip-open', '↗'); arrow.setAttribute('aria-hidden', 'true'); visual.append(arrow);
      const info = element('div', 'trip-info'); const detail = element('div');
      detail.append(element('p', 'trip-meta', `${trip.category || '旅行'}${trip.date ? ' · ' + trip.date : ''}`), element('h3', '', trip.place || '一起去旅行'));
      if (trip.title && trip.title !== trip.place) detail.append(element('p', 'trip-subtitle', trip.title));
      detail.append(element('p', 'trip-letter-line', trip.category === '日常' ? '平常的日子，也因为你而闪闪发光。' : '风景留在照片里，你留在我的故事里。'));
      info.append(detail, element('span', 'trip-category', '拆开来信 ♡')); button.append(visual, info);
      button.addEventListener('click', () => openAlbum(trip)); $('trip-grid').append(button);
    });
  }
  let timelineShown = 0;
  function timelineCard(trip, stamp) {
    const eager = timelineShown < 2; timelineShown += 1;
    const button=element('button','timeline-card');button.type='button';
    button.setAttribute('aria-label',`打开${trip.place}，${trip.photos.length}张照片`);
    const image=element('div','timeline-print');image.append(photo(trip.cover||trip.photos[0].src,trip.place+'回忆封面',!eager,eager&&timelineShown===1));
    const copy=element('div','timeline-copy');
    if(stamp)copy.append(element('span','timeline-date',stamp.label||stamp.date.replaceAll('-',' . ')),element('small','timeline-date-source',stamp.source));
    else copy.append(element('span','timeline-date','珍藏的片段'));
    copy.append(element('h3','',trip.place),element('p','',trip.description|| (trip.category==='日常'?'平常的日子，也想和你一起记住。':'有些风景，想和你再看一遍。')),element('span','timeline-count',`${trip.photos.length} 个瞬间 · 拆开来信 ↗`));
    button.append(image,copy);button.addEventListener('click',()=>openAlbum(trip));return button;
  }
  function renderTimeline(items) {
    timelineShown = 0;
    const {dated,undated,periods}=timelineCollections(items);$('timeline-dated').replaceChildren();$('timeline-undated').replaceChildren();$('timeline-period-cards').replaceChildren();$('timeline-anniversary').replaceChildren();
    const anniversary=typeof startAt==='string'&&Number.isFinite(Date.parse(startAt))?collectionDate({date:startAt.slice(0,10)}):null;
    if(anniversary){const note=element('div','timeline-origin');note.append(element('span','timeline-date',anniversary.date.replaceAll('-',' . ')),element('h3','','我们的第一天'),element('p','','从这一天开始，一起把普通日子过成回忆。'),element('small','timeline-date-source',personal.startAt?'纪念日 · 本机设置':'我们的纪念日'));$('timeline-anniversary').append(note);}
    $('timeline-anniversary').hidden=!anniversary;
    for(const period of periods)$('timeline-period-cards').append(timelineCard(period.trip,period));
    $('timeline-periods').hidden=!periods.length;
    $('timeline-journey-note').textContent=dated.some(t=>t.label?.includes('国庆'))?'从'+dated.find(t=>t.label?.includes('国庆')).label.replaceAll(' ','')+'开始，给每段旅程写下日期。':'把每次出发，留在时间里。';
    $('timeline-journey-heading').hidden=!dated.length;
    const events=dated;
    let previousYear='';
    for(const event of events){
      const year=event.date.slice(0,4);
      if(year!==previousYear){$('timeline-dated').append(element('p','timeline-year',year));previousYear=year;}
      const node=element('div','timeline-node');
      node.append(timelineCard(event.trip,event));
      $('timeline-dated').append(node);
    }
    for(const trip of undated)$('timeline-undated').append(timelineCard(trip));
    $('timeline-undated-section').hidden=!undated.length;
  }
  function readingMode(timeline) {
    $('timeline-view').hidden=!timeline;$('trip-grid').hidden=timeline;
    $('collection-mode').setAttribute('aria-pressed',String(!timeline));$('timeline-mode').setAttribute('aria-pressed',String(timeline));
    document.querySelector('.collection-title h2').textContent=timeline?'沿着时间，读我们的故事':'寄给我们的旅行来信';
  }
  $('collection-mode').addEventListener('click',()=>readingMode(false));
  $('timeline-mode').addEventListener('click',()=>readingMode(true));
  let currentTrip = null; let currentPhoto = 0;
  let renderedPhotos=0, chapterPhotos=null;
  const photoBatchSize=36;
  function appendPhotoBatch() {
    const trip=currentTrip,end=Math.min(renderedPhotos+photoBatchSize,trip.photos.length);
    trip.photos.slice(renderedPhotos,end).forEach((p,offset)=>{
      const index=renderedPhotos+offset;
      if(p.chapterStart||index===0){
        const chapter=element('section','story-chapter');const heading=element('div','chapter-heading');
        heading.append(element('span','',`CHAPTER ${String(p.chapter+1).padStart(2,'0')}`),element('h3','',chapterLines[p.chapter%chapterLines.length]));
        chapterPhotos=element('div','chapter-photos');chapter.append(heading,chapterPhotos);$('album-photos').append(chapter);
      }
      const button=element('button','album-photo');button.type='button';button.setAttribute('aria-label',`全屏查看第 ${index+1} 张：${p.alt||p.caption||'旅行照片'}`);
      button.append(photo(p.src,p.alt||p.caption,index>=4),element('span','album-photo-number',String(index+1).padStart(2,'0')));
      if(p.caption)button.append(element('p','',p.caption));
      button.addEventListener('click',()=>{currentPhoto=index;openDialog(lightbox);showPhoto();});chapterPhotos.append(button);
    });
    renderedPhotos=end;const more=$('album-load-more');more.hidden=end===trip.photos.length;more.textContent=`继续翻开 · 还有 ${trip.photos.length-end} 个瞬间 ↓`;
  }
  $('album-load-more').addEventListener('click',appendPhotoBatch);
  const album = $('album-dialog'); const lightbox = $('lightbox');
  function openAlbum(trip) {
    currentTrip = trip; $('album-place').textContent = `${trip.category || '旅行'} / ${trip.photos.length} 个瞬间${isDemo ? ' / 插画示意' : ''}`;
    $('album-title').textContent = trip.place || trip.title || '我们的故事'; $('album-description').textContent = trip.description || (trip.title !== trip.place ? trip.title : '') || '';
    $('album-photos').replaceChildren();
    $('album-story').hidden = true;
    album.classList.remove('letter-expanded');
    $('letter-arrival').classList.remove('is-opened');
    $('reveal-letter').hidden = false; $('letter-open-note').hidden = true;
    $('letter-cover').src = trip.cover || trip.photos[0].src;
    $('letter-cover').alt = `${trip.place || '旅行'}的回忆封面`;
    $('letter-intro').textContent = trip.description || letterLine(trip);
    $('photo-thumbnails').replaceChildren();
    $('album-collection-position').textContent = `${String(trips.indexOf(trip) + 1).padStart(2, '0')} / ${String(trips.length).padStart(2, '0')} · 我们的回忆`;
    $('album-trip-previous').disabled = trips.length < 2;
    $('album-trip-next').disabled = trips.length < 2;
    renderedPhotos=0;chapterPhotos=null;$('album-load-more').hidden=true;
    if (!album.open) openDialog(album); album.scrollTop = 0;
  }
  $('reveal-letter').addEventListener('click', () => {
    if(!renderedPhotos)appendPhotoBatch();
    $('album-story').hidden = false; $('letter-arrival').classList.add('is-opened');
    album.classList.add('letter-expanded');
    $('reveal-letter').hidden = true; $('letter-open-note').hidden = false;
    $('album-story').focus({preventScroll:true});
    if (!reducedMotion && $('album-story').animate) $('album-story').animate([{opacity:0,transform:'translateY(22px)'},{opacity:1,transform:'translateY(0)'}],{duration:700,easing:'ease-out'});
    album.scrollTo({top:Math.max(0, $('album-story').offsetTop - 115),behavior:reducedMotion ? 'instant' : 'smooth'});
  });
  function navigateAlbum(step) { openAlbum(trips[(trips.indexOf(currentTrip) + step + trips.length) % trips.length]); }
  $('album-trip-previous').addEventListener('click', () => navigateAlbum(-1));
  $('album-trip-next').addEventListener('click', () => navigateAlbum(1));
  function showPhoto() {
    const item = currentTrip.photos[currentPhoto]; $('full-photo').src = item.src; $('full-photo').alt = item.alt || item.caption || '我们的旅行照片';
    $('photo-caption').textContent = item.caption || currentTrip.title || ''; $('photo-count').textContent = `${String(currentPhoto + 1).padStart(2, '0')} / ${String(currentTrip.photos.length).padStart(2, '0')}`;
    const single = currentTrip.photos.length < 2; $('previous-photo').hidden = single; $('next-photo').hidden = single;
    const rail = $('photo-thumbnails'); rail.hidden = single;
    rail.replaceChildren();
    const start=Math.max(0,Math.min(currentPhoto-5,currentTrip.photos.length-11));
    currentTrip.photos.slice(start,start+11).forEach((p,offset)=>{const index=start+offset;const thumbnail=element('button','photo-thumbnail');thumbnail.type='button';thumbnail.setAttribute('aria-label',`跳到第 ${index+1} 张照片`);thumbnail.setAttribute('aria-current',String(index===currentPhoto));thumbnail.append(photo(p.src,'',false));thumbnail.addEventListener('click',()=>{currentPhoto=index;showPhoto();});rail.append(thumbnail);});
    const active = rail.querySelector('[aria-current="true"]');
    if (active) rail.scrollTo({left:active.offsetLeft - rail.clientWidth / 2 + active.clientWidth / 2, behavior:reducedMotion ? 'instant' : 'smooth'});
  }
  function navigatePhoto(direction) { currentPhoto = (currentPhoto + direction + currentTrip.photos.length) % currentTrip.photos.length; showPhoto(); }
  $('previous-photo').addEventListener('click', () => navigatePhoto(-1)); $('next-photo').addEventListener('click', () => navigatePhoto(1));
  $('close-lightbox').addEventListener('click', () => lightbox.close()); document.querySelector('.close-album').addEventListener('click', () => album.close());
  lightbox.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigatePhoto(event.key === 'ArrowLeft' ? -1 : 1); } });
  let touchStart = null;
  lightbox.addEventListener('touchstart', event => { if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
  lightbox.addEventListener('touchend', event => { if (!touchStart || !event.changedTouches.length) return; const dx = event.changedTouches[0].clientX - touchStart.x; const dy = event.changedTouches[0].clientY - touchStart.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) navigatePhoto(dx < 0 ? 1 : -1); touchStart = null; }, { passive: true });
  $('native-fullscreen').hidden = !document.fullscreenEnabled;
  $('native-fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await lightbox.requestFullscreen(); } catch { toast('当前浏览器使用沉浸式相册欣赏。'); } });
  lightbox.addEventListener('close', () => { if (document.fullscreenElement === lightbox) document.exitFullscreen().catch(() => {}); });
  renderTrips(trips);
})();
