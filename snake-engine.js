(function(root){
'use strict';
class SnakeGame{
 constructor({size=20,random=Math.random}={}){this.size=size;this.random=random;this.reset();}
 reset(){const c=Math.floor(this.size/2);this.snake=[{x:c,y:c},{x:c-1,y:c},{x:c-2,y:c}];this.direction={x:1,y:0};this.status='ready';this.score=0;this.queue=[];this.placeFood();}
 placeFood(){const free=[];for(let y=0;y<this.size;y++)for(let x=0;x<this.size;x++)if(!this.snake.some(p=>p.x===x&&p.y===y))free.push({x,y});this.food=free[Math.min(free.length-1,Math.floor(this.random()*free.length))]||null;}
 start(){if(this.status==='ready'||this.status==='paused')this.status='running';}
 pause(){if(this.status==='running')this.status='paused';}
 turn(name){const dirs={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};const next=dirs[name];const prev=this.queue.at(-1)||this.direction;if(this.status!=='running'||!next||this.queue.length>=2||(next.x===-prev.x&&next.y===-prev.y)||(next.x===prev.x&&next.y===prev.y))return false;this.queue.push(next);return true;}
 tick(){if(this.status!=='running')return;if(this.queue.length)this.direction=this.queue.shift();const head=this.snake[0];const next={x:head.x+this.direction.x,y:head.y+this.direction.y};if(next.x<0||next.y<0||next.x>=this.size||next.y>=this.size){this.status='over';return;}const ate=this.food&&next.x===this.food.x&&next.y===this.food.y;const body=ate?this.snake:this.snake.slice(0,-1);if(body.some(p=>p.x===next.x&&p.y===next.y)){this.status='over';return;}this.snake.unshift(next);if(ate){this.score+=10;this.placeFood();if(!this.food)this.status='won';}else this.snake.pop();}
}
if(typeof module!=='undefined'&&module.exports)module.exports={SnakeGame};else root.SnakeGame=SnakeGame;
})(typeof globalThis!=='undefined'?globalThis:this);
