(() => {
  'use strict';
  const canvas = document.getElementById('cosmos');
  if (!canvas) return;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  const scene = canvas.parentElement;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, stars = [], frame = 0, lastTime = 0;
  let sceneVisible = true, offsetX = 0, offsetY = 0, targetX = 0, targetY = 0;
  let seed = 190503;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  function resize() {
    width = scene.clientWidth; height = scene.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, width < 800 ? 1.5 : 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    seed = 190503;
    stars = Array.from({ length: width < 800 ? 32 : 76 }, () => ({
      x: random() * width, y: random() * height * 0.65,
      radius: 0.2 + random() * 0.6, phase: random() * Math.PI * 2,
      speed: 0.35 + random() * 0.55, brightness: 0.06 + random() * 0.25
    }));
    draw(0);
  }
  function draw(time) {
    const ctx = context, seconds = time / 1000;
    ctx.clearRect(0, 0, width, height);
    offsetX += (targetX - offsetX) * 0.035;
    offsetY += (targetY - offsetY) * 0.035;
    for (const star of stars) {
      const shimmer = motionPreference.matches ? 0.7 : 0.65 + 0.35 * Math.sin(seconds * star.speed + star.phase);
      ctx.fillStyle = `rgba(221,234,241,${star.brightness * shimmer})`;
      ctx.beginPath(); ctx.arc(star.x + offsetX, star.y + offsetY, star.radius, 0, Math.PI * 2); ctx.fill();
      if (star.radius > 1.2 && shimmer > 0.9) {
        ctx.strokeStyle = `rgba(229,232,218,${(shimmer - 0.9) * 1.4})`;
        ctx.lineWidth = 0.5; ctx.beginPath();
        ctx.moveTo(star.x - 4, star.y); ctx.lineTo(star.x + 4, star.y);
        ctx.moveTo(star.x, star.y - 4); ctx.lineTo(star.x, star.y + 4); ctx.stroke();
      }
    }
    if(!motionPreference.matches) {
      const cycle=(seconds+9)%27;
      if(cycle<1.35) {
        const progress=cycle/1.35, alpha=Math.sin(progress*Math.PI)*.35;
        const x=width*(.9-progress*.38), y=height*(.08+progress*.22);
        const tail=width<800?55:115;
        const trail=ctx.createLinearGradient(x,y,x+tail,y-tail*.45);
        trail.addColorStop(0,`rgba(226,235,232,${alpha})`);trail.addColorStop(1,'rgba(226,235,232,0)');
        ctx.strokeStyle=trail;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+tail,y-tail*.45);ctx.stroke();
      }
    }
  }
  function animate(time) {
    if(document.hidden || !sceneVisible || motionPreference.matches) { frame=0; return; }
    if(time-lastTime>(width<800?45:33)) { draw(time);lastTime=time; }
    frame=requestAnimationFrame(animate);
  }
  function resume() { if(!frame && !document.hidden && sceneVisible && !motionPreference.matches) frame=requestAnimationFrame(animate); }
  if('IntersectionObserver' in window) new IntersectionObserver(entries=>{sceneVisible=entries[0].isIntersecting;resume();}).observe(scene);
  if(matchMedia('(pointer: fine)').matches) window.addEventListener('pointermove',event=>{
    targetX=(event.clientX/innerWidth-.5)*8;targetY=(event.clientY/innerHeight-.5)*5;
  },{passive:true});
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',resume);
  motionPreference.addEventListener('change',()=>{draw(0);resume();});
  resize();resume();
})();
