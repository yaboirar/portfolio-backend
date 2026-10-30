(() => {
  'use strict';
  const title=document.getElementById('shared-title'),status=document.getElementById('shared-status'),content=document.getElementById('shared-content');
  const path=location.pathname.replace(/\/$/,'');
  fetch(path+'/metadata',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}).then(async response=>{
    if(!response.ok)throw new Error('This link has expired, was revoked, or is unavailable.');
    const item=await response.json();title.textContent=item.title;document.title=item.title;
    const description=document.getElementById('shared-description');description.textContent=item.description||'';description.hidden=!item.description;
    const video=document.createElement('video');video.src=path+'/file';video.preload='metadata';video.playsInline=true;
    video.addEventListener('error',()=>{status.hidden=false;status.textContent='Playback is unavailable. The link may have expired or reached its transfer allowance.';});
    const player=window.MILVPlayer.create(video);status.hidden=true;content.append(player.element);
    window.addEventListener('pagehide',()=>{player.destroy();video.pause();video.removeAttribute('src');video.load();},{once:true});
  }).catch(error=>{title.textContent='Link unavailable';status.textContent=error.message;});
})();
