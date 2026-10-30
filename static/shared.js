(() => {
  'use strict';
  const title=document.getElementById('shared-title'),status=document.getElementById('shared-status'),content=document.getElementById('shared-content');
  const path=location.pathname.replace(/\/$/,'');
  const pause=()=>new Promise(resolve=>setTimeout(resolve,1500));
  async function metadata(){
    for(let attempt=0;attempt<100;attempt++){
      const response=await fetch(path+'/metadata',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
      if(response.status===202){status.hidden=false;status.textContent='Preparing a copy with embedded metadata removed…';await pause();continue;}
      if(!response.ok)throw new Error(response.status===503?'The cleaned copy could not be prepared. Please try again later.':'This link has expired, was revoked, or is temporarily unavailable.');
      return response.json();
    }
    throw new Error('Preparation is taking longer than expected. Reopen the link to retry.');
  }
  function renderDetails(item){
    if(!item.details_enabled||!item.details)return;
    const toggle=document.getElementById('shared-details-toggle'),panel=document.getElementById('shared-details'),fields=document.getElementById('shared-fields');
    for(const [key,label] of [['title','Title'],['type','Type'],['duration','Duration'],['dimensions','Dimensions']]){
      if(!item.details[key])continue;const term=document.createElement('dt'),value=document.createElement('dd');term.textContent=label;value.textContent=item.details[key];fields.append(term,value);
    }
    const download=document.getElementById('shared-download');download.href=path+'/download';let busy=false;
    download.addEventListener('click',async event=>{event.preventDefault();if(busy)return;busy=true;download.setAttribute('aria-busy','true');try{await metadata();status.hidden=true;const link=document.createElement('a');link.href=path+'/download';link.download='';document.body.append(link);link.click();link.remove();}catch(error){status.hidden=false;status.textContent=error.message;}finally{busy=false;download.removeAttribute('aria-busy');}});
    toggle.hidden=false;toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}});
  }
  metadata().then(async item=>{
    title.textContent=item.title;document.title=item.title;renderDetails(item);
    const description=document.getElementById('shared-description');description.textContent=item.description||'';description.hidden=!item.description;
    if(item.kind==='image'){
      const image=document.createElement('img');image.className='shared-image';image.alt=item.title;image.src=path+'/file';image.addEventListener('contextmenu',event=>event.preventDefault());image.addEventListener('error',()=>{status.hidden=false;status.textContent='The image could not load. Reopen the link to retry.';});content.append(image);
    }else if(item.kind==='poem'){
      const response=await fetch(path+'/file',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('This file is unavailable.');const poem=document.createElement('pre');poem.className='shared-poem';poem.textContent=await response.text();content.append(poem);
    }else{
      const video=document.createElement('video');video.src=path+'/file';video.preload='metadata';video.playsInline=true;
      video.addEventListener('error',()=>{status.hidden=false;status.textContent='Playback is unavailable. The link may have expired or reached its transfer allowance.';});
      const player=window.MILVPlayer.create(video);content.append(player.element);
      const fit=()=>{const element=player.element;element.style.flex='none';if(document.fullscreenElement===element){element.style.width='100%';element.style.height='100%';return;}const style=getComputedStyle(content),width=content.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=content.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),ratio=video.videoWidth&&video.videoHeight?video.videoWidth/video.videoHeight:16/9;const fitted=Math.max(0,Math.min(width,height*ratio));element.style.width=fitted+'px';element.style.height=fitted/ratio+'px';};
      const observer=new ResizeObserver(fit);observer.observe(content);video.addEventListener('loadedmetadata',fit);document.addEventListener('fullscreenchange',fit);fit();
      window.addEventListener('pagehide',()=>{observer.disconnect();document.removeEventListener('fullscreenchange',fit);video.removeEventListener('loadedmetadata',fit);player.destroy();video.pause();video.removeAttribute('src');video.load();},{once:true});
    }
    status.hidden=true;
  }).catch(error=>{title.textContent='File unavailable';status.hidden=false;status.textContent=error.message;});
})();
