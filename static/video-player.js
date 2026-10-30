(() => {'use strict';const $=id=>document.getElementById(id);const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  function createVideoPlayer(video){
    const element=node('div','video-player');element.tabIndex=0;element.setAttribute('role','region');element.setAttribute('aria-label','Video player');
    const lifetime=new AbortController(),signal=lifetime.signal;
    const listen=(target,event,fn)=>target.addEventListener(event,fn,{signal});
    let hideTimer,manualSeek=false,clickTimer;
    video.controls=false;video.removeAttribute('controls');video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('controlslist','nodownload');video.tabIndex=-1;
    const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m8 5 11 7-11 7z"/></svg>';
    const pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    const speakerIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/></svg>';
    const mutedIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3zM17 9l5 6M22 9l-5 6"/></svg>';
    const button=(label,html,className='player-button')=>{const el=node('button',className);el.type='button';el.innerHTML=html;el.setAttribute('aria-label',label);el.title=label;return el;};
    const largePlay=button('Play video',playIcon,'player-large-play');
    const spinner=node('span','player-spinner');spinner.setAttribute('aria-label','Buffering');spinner.setAttribute('role','status');
    const controls=node('div','player-controls');controls.setAttribute('aria-label','Playback controls');
    const seekWrap=node('div','player-seek');const buffered=node('span','player-buffered');const played=node('span','player-played');
    const seek=node('input','player-seek-input');seek.type='range';seek.min='0';seek.max='100';seek.step='.01';seek.value='0';seek.disabled=true;seek.setAttribute('aria-label','Seek video');
    seekWrap.append(buffered,played,seek);
    const row=node('div','player-controls-row');const play=button('Play',playIcon),mute=button('Mute',speakerIcon);
    const volume=node('input','player-volume');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.value='1';volume.setAttribute('aria-label','Volume');
    const clock=node('span','player-time','0:00 / 0:00');clock.setAttribute('aria-live','off');
    const rate=node('select','player-rate');rate.setAttribute('aria-label','Playback speed');[.5,1,1.25,1.5,2].forEach(value=>{const option=node('option','',value+'×');option.value=value;if(value===1)option.selected=true;rate.append(option);});
    const fullscreen=button('Enter fullscreen','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>');
    row.append(play,mute,volume,clock,rate,fullscreen);controls.append(seekWrap,row);element.append(video,largePlay,spinner,controls);
    const format=value=>{value=Math.max(0,Number.isFinite(value)?Math.floor(value):0);const h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=String(value%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;};
    const showControls=()=>{clearTimeout(hideTimer);element.classList.remove('controls-hidden');if(!video.paused)hideTimer=setTimeout(()=>{if(!element.contains(document.activeElement)&&!manualSeek)element.classList.add('controls-hidden');},2500);};
    const sync=()=>{
      const duration=Number.isFinite(video.duration)?video.duration:0,current=manualSeek?Number(seek.value):video.currentTime||0;
      play.innerHTML=video.paused?playIcon:pauseIcon;play.setAttribute('aria-label',video.paused?'Play':'Pause');play.title=video.paused?'Play':'Pause';
      largePlay.hidden=!video.paused;largePlay.setAttribute('aria-label',video.ended?'Replay video':'Play video');
      seek.disabled=!duration;seek.max=String(duration||100);if(!manualSeek)seek.value=String(current);
      seek.setAttribute('aria-valuetext',`${format(current)} of ${format(duration)}`);clock.textContent=`${format(current)} / ${format(duration)}`;
      played.style.width=(duration?current/duration*100:0)+'%';
      let end=0;for(let i=0;i<video.buffered.length;i++){if(video.buffered.start(i)<=current+.2)end=Math.max(end,video.buffered.end(i));}
      buffered.style.width=(duration?Math.min(100,end/duration*100):0)+'%';
      mute.innerHTML=video.muted||video.volume===0?mutedIcon:speakerIcon;mute.setAttribute('aria-label',video.muted?'Unmute':'Mute');mute.title=video.muted?'Unmute':'Mute';volume.value=String(video.muted?0:video.volume);
      element.classList.toggle('is-paused',video.paused);
    };
    const togglePlay=async()=>{try{if(video.paused){if(video.ended)video.currentTime=0;await video.play();}else video.pause();showControls();}catch(error){if(error.name!=='AbortError'){$('preview-error').textContent='Playback could not start. Try again or download the original.';$('preview-error').hidden=false;}}};
    const toggleFullscreen=async()=>{try{if(document.fullscreenElement===element)await document.exitFullscreen();else await element.requestFullscreen();}catch{fullscreen.title='Fullscreen unavailable in this browser';}};
    listen(play,'click',togglePlay);listen(largePlay,'click',togglePlay);listen(video,'click',()=>{clearTimeout(clickTimer);clickTimer=setTimeout(togglePlay,180);});listen(video,'dblclick',()=>{clearTimeout(clickTimer);toggleFullscreen();});
    listen(mute,'click',()=>{video.muted=!video.muted;sync();});listen(volume,'input',()=>{video.volume=Number(volume.value);video.muted=video.volume===0;sync();});
    listen(rate,'change',()=>video.playbackRate=Number(rate.value));listen(fullscreen,'click',toggleFullscreen);
    listen(seek,'input',()=>{manualSeek=true;showControls();sync();});listen(seek,'change',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value);manualSeek=false;sync();});listen(seek,'pointercancel',()=>{manualSeek=false;sync();});
    ['loadedmetadata','durationchange','timeupdate','progress','volumechange','ratechange','pause','ended'].forEach(event=>listen(video,event,sync));
    listen(video,'play',()=>{sync();showControls();});listen(video,'pause',()=>{element.classList.remove('is-buffering');showControls();});
    ['waiting','seeking'].forEach(event=>listen(video,event,()=>element.classList.add('is-buffering')));
    ['playing','seeked','canplay','error','ended'].forEach(event=>listen(video,event,()=>element.classList.remove('is-buffering')));
    listen(video,'contextmenu',event=>event.preventDefault());
    listen(element,'pointermove',showControls);listen(element,'focusin',showControls);listen(element,'pointerleave',()=>{if(!video.paused&&!element.contains(document.activeElement))element.classList.add('controls-hidden');});
    listen(element,'keydown',event=>{
      if(event.target.closest('input,select,button')){if(event.key.startsWith('Arrow'))event.stopPropagation();return;}
      if(event.key===' '||event.key.toLowerCase()==='k'){event.preventDefault();event.stopPropagation();togglePlay();}
      else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();if(Number.isFinite(video.duration))video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+(event.key==='ArrowRight'?5:-5)));showControls();}
      else if(event.key.toLowerCase()==='m'){event.preventDefault();video.muted=!video.muted;}
      else if(event.key.toLowerCase()==='f'){event.preventDefault();toggleFullscreen();}
    });
    listen(document,'fullscreenchange',()=>{const active=document.fullscreenElement===element;fullscreen.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');fullscreen.title=active?'Exit fullscreen':'Enter fullscreen';showControls();});
    sync();
    return {element,destroy(){clearTimeout(hideTimer);clearTimeout(clickTimer);lifetime.abort();if(document.fullscreenElement===element)document.exitFullscreen().catch(()=>{});}};
  }


window.MILVPlayer=Object.freeze({create:createVideoPlayer});})();
