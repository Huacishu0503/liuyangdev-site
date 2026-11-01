const form=document.getElementById('unlock');
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button'),message=document.getElementById('message');button.disabled=true;message.textContent='正在打开我们的回忆…';
  try{const response=await fetch('/api/view/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:form.password.value}),cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(response.status===401?'密码不对，再想一想属于我们的暗号。':result.error||'暂时无法打开，请稍后重试。');form.password.value='';location.reload();}
  catch(error){message.textContent=error.message||'连接中断，请重试。';button.disabled=false;}
});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
