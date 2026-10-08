(()=>{
'use strict';
const $=id=>document.getElementById(id),canvas=$('board'),pen=canvas.getContext('2d');
const game=new SnakeGame(),speeds={easy:185,normal:130,fast:85};let timer=null,touchStart=null;
const bestKey=()=>`snake-best-${$('difficulty').value}`;
function getBest(){try{const n=Number(localStorage.getItem(bestKey()));return Number.isFinite(n)&&n>=0?n:0;}catch{return 0;}}
let best=getBest();
function record(){if(game.score>best){best=game.score;try{localStorage.setItem(bestKey(),String(best));}catch{}}}
function paint(){const cell=canvas.width/game.size;pen.fillStyle='#0e1811';pen.fillRect(0,0,canvas.width,canvas.height);pen.strokeStyle='#203025';pen.lineWidth=1;pen.beginPath();for(let i=1;i<game.size;i++){pen.moveTo(i*cell,0);pen.lineTo(i*cell,canvas.height);pen.moveTo(0,i*cell);pen.lineTo(canvas.width,i*cell);}pen.stroke();if(game.food){const {x,y}=game.food;pen.fillStyle='#f7b956';pen.beginPath();pen.roundRect(x*cell+6,y*cell+6,cell-12,cell-12,5);pen.fill();}game.snake.forEach((p,i)=>{pen.fillStyle=i===0?'#c8f69b':'#8fce65';pen.beginPath();pen.roundRect(p.x*cell+2,p.y*cell+2,cell-4,cell-4,4);pen.fill();});const h=game.snake[0],d=game.direction;pen.fillStyle='#1b351d';for(const side of [-1,1]){const ex=h.x*cell+cell/2+d.x*6+(d.y?side*6:0),ey=h.y*cell+cell/2+d.y*6+(d.x?side*6:0);pen.beginPath();pen.arc(ex,ey,2.5,0,Math.PI*2);pen.fill();}}
function render(){record();$('score').textContent=String(game.score).padStart(3,'0');$('best').textContent=String(best).padStart(3,'0');const status=game.status;$('state').textContent={ready:'等待开始',running:'正在游戏',paused:'已暂停',over:'本局结束',won:'全场通关'}[status];$('overlay').hidden=status==='running';$('pause').disabled=status==='ready'||status==='over'||status==='won';$('pause').textContent=status==='paused'?'继续':'暂停';$('difficulty').disabled=status==='running'||status==='paused';if(status==='ready'){$('overline').textContent='ONE MORE BITE';$('overlay-title').textContent='吃一口，再长一点。';$('overlay-copy').textContent='吃掉金色食物，别撞到墙或自己。手机滑动棋盘，也能控制方向。';$('play').textContent='开始游戏';}else if(status==='paused'){$('overline').textContent='TAKE A BREATH';$('overlay-title').textContent='暂停一下。';$('overlay-copy').textContent='准备好了，再继续这一局。';$('play').textContent='继续游戏';}else if(status==='over'||status==='won'){$('overline').textContent=status==='won'?'PERFECT RUN':'NEXT ROUND?';$('overlay-title').textContent=status==='won'?'你填满了整个棋盘！':'这一局，到这里。';$('overlay-copy').textContent=`本局 ${game.score} 分 · 当前速度最高 ${best} 分`;$('play').textContent='再来一局';$('announcement').textContent=`${$('overlay-title').textContent} 本局得分 ${game.score}`;}paint();}
function stopTimer(){clearInterval(timer);timer=null;}
function run(){stopTimer();timer=setInterval(()=>{game.tick();render();if(game.status!=='running')stopTimer();},speeds[$('difficulty').value]);}
function start(){if(game.status==='over'||game.status==='won')game.reset();game.start();render();run();}
function pause(){if(game.status!=='running')return;game.pause();stopTimer();render();}
function restart(){stopTimer();game.reset();start();}
$('play').onclick=start;$('pause').onclick=()=>game.status==='paused'?start():pause();$('restart').onclick=restart;
$('difficulty').onchange=()=>{best=getBest();game.reset();render();};
document.querySelectorAll('[data-dir]').forEach(button=>button.addEventListener('pointerdown',event=>{event.preventDefault();game.turn(button.dataset.dir);}));
const keys={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
document.addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey||event.altKey||['SELECT','INPUT','TEXTAREA'].includes(event.target.tagName))return;const k=event.key.length===1?event.key.toLowerCase():event.key;if(keys[k]){event.preventDefault();game.turn(keys[k]);}else if(event.code==='Space'&&event.target.tagName!=='BUTTON'){event.preventDefault();if(!event.repeat)game.status==='running'?pause():start();}else if(k==='r'&&!event.repeat){event.preventDefault();restart();}else if(k==='Enter'&&event.target.tagName!=='BUTTON'&&game.status!=='running'){event.preventDefault();start();}});
canvas.addEventListener('pointerdown',event=>{touchStart={x:event.clientX,y:event.clientY,id:event.pointerId};canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointerup',event=>{if(!touchStart||touchStart.id!==event.pointerId)return;const dx=event.clientX-touchStart.x,dy=event.clientY-touchStart.y;touchStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<15)return;game.turn(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));});
canvas.addEventListener('pointercancel',()=>{touchStart=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);window.addEventListener('pagehide',stopTimer);
render();
})();
