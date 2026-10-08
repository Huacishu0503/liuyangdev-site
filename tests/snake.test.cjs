const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../snake-engine.js');
function engine(){assert.ok(fs.existsSync(file),'Snake game engine must exist');return require(file);}
test('a started snake moves one cell without changing length',()=>{
 const {SnakeGame}=engine();const g=new SnakeGame({size:12,random:()=>0});
 g.start();const head={...g.snake[0]};const length=g.snake.length;g.tick();
 assert.deepEqual(g.snake[0],{x:head.x+1,y:head.y});assert.equal(g.snake.length,length);
});
test('eating grows the snake, scores ten, and places food on an empty cell',()=>{
 const {SnakeGame}=engine();const g=new SnakeGame({size:12,random:()=>0});g.start();
 g.food={x:g.snake[0].x+1,y:g.snake[0].y};g.tick();assert.equal(g.score,10);assert.equal(g.snake.length,4);
 assert.ok(!g.snake.some(p=>p.x===g.food.x&&p.y===g.food.y));
});
test('wall collision ends the run without adding an invalid head',()=>{
 const {SnakeGame}=engine();const g=new SnakeGame({size:12});g.start();g.snake=[{x:11,y:2},{x:10,y:2},{x:9,y:2}];g.tick();assert.equal(g.status,'over');assert.equal(g.snake[0].x,11);
});
test('turn queue rejects reversal and buffers two valid turns',()=>{const {SnakeGame}=engine();const g=new SnakeGame();g.start();assert.equal(g.turn('left'),false);assert.equal(g.turn('up'),true);assert.equal(g.turn('left'),true);g.tick();assert.deepEqual(g.direction,{x:0,y:-1});g.tick();assert.deepEqual(g.direction,{x:-1,y:0});});
test('self collision ends game, but moving into a departing tail is legal',()=>{const {SnakeGame}=engine();const g=new SnakeGame();g.start();g.snake=[{x:3,y:3},{x:3,y:4},{x:4,y:4},{x:4,y:3},{x:5,y:3}];g.direction={x:1,y:0};g.tick();assert.equal(g.status,'over');g.reset();g.start();g.snake=[{x:3,y:3},{x:3,y:4},{x:4,y:4},{x:4,y:3}];g.direction={x:1,y:0};g.tick();assert.equal(g.status,'running');});
test('pause stops ticks, resumes, and reset clears score and queued turns',()=>{const {SnakeGame}=engine();const g=new SnakeGame();g.start();g.turn('up');g.pause();const before=JSON.stringify(g.snake);g.tick();assert.equal(JSON.stringify(g.snake),before);assert.equal(g.status,'paused');g.start();g.tick();assert.notEqual(JSON.stringify(g.snake),before);g.score=50;g.reset();assert.equal(g.score,0);assert.equal(g.status,'ready');assert.equal(g.queue.length,0);});
test('filling the last free cell wins without an infinite food loop',()=>{const {SnakeGame}=engine();const g=new SnakeGame({size:4,random:()=>0});g.start();g.snake=[];for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(!(x===1&&y===0))g.snake.push({x,y});g.direction={x:1,y:0};g.food={x:1,y:0};g.tick();assert.equal(g.status,'won');assert.equal(g.food,null);assert.equal(g.snake.length,16);});
