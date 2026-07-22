(function(){
  // Mobile hamburger nav (runs on every page that has the shared header)
  const navBar=document.querySelector('.site-header .nav'), navLinks=navBar&&navBar.querySelector('.nav-links');
  if(navBar&&navLinks){
    const t=document.createElement('button');
    t.className='nav-toggle'; t.type='button'; t.setAttribute('aria-label','Open menu'); t.setAttribute('aria-expanded','false'); t.textContent='☰';
    navBar.insertBefore(t,navLinks);
    t.addEventListener('click',()=>{const open=navLinks.classList.toggle('open'); t.setAttribute('aria-expanded',open); t.setAttribute('aria-label',open?'Close menu':'Open menu');});
  }

  const $ = (s, c=document)=>c.querySelector(s);
  const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));
  const fmt = b => !b ? '0 KB' : b < 1024*1024 ? Math.round(b/1024)+' KB' : (b/1024/1024).toFixed(1)+' MB';
  const esc = s => s.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

  $$('.img-tool').forEach(tool=>{
    const mode=tool.dataset.tool||'convert', to=tool.dataset.to||'', target=tool.dataset.target||'';
    const toolLabel=mode==='compress'?('compress-'+target+'kb'):(location.pathname==='/'?'home-convert-jpg':location.pathname.slice(1));
    const input=$('.file-input',tool), drop=$('.uploader',tool), btn=$('.run-btn',tool), status=$('.status',tool), result=$('.result',tool);
    const original=$('.original-size',tool), final=$('.final-size',tool), saved=$('.saved-size',tool), dl=$('.download-link',tool), fileName=$('.file-name',tool);
    let files=[], blobUrl=null;
    fileName.classList.add('file-list');

    function setStatus(msg,type=''){status.textContent=msg; status.className='status show '+type;}

    function render(){
      if(!files.length){
        fileName.textContent='No file selected';
      }else{
        fileName.innerHTML=files.map((f,i)=>`<span class="file-chip"><span class="chip-name">${esc(f.name)}</span><span class="chip-size">${fmt(f.size)}</span><button type="button" class="chip-x" data-i="${i}" aria-label="Remove ${esc(f.name)}">✕</button></span>`).join('');
      }
      btn.disabled=!files.length;
      if(files.length){
        setStatus(`${files[0].name} ready (${fmt(files[0].size)}). Press the button to process. Results are best-effort and honestly reported.`);
      }else{
        status.className='status';
      }
    }

    function addFiles(list){
      const incoming=Array.from(list||[]);
      if(!incoming.length) return;
      files=[incoming[0]];
      render();
    }

    fileName.addEventListener('click',e=>{
      // The chip list sits inside the clickable uploader; without this,
      // removing a file also pops the file picker.
      e.stopPropagation();
      const x=e.target.closest('.chip-x');
      if(x){ files.splice(Number(x.dataset.i),1); render(); return; }
    });

    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
    drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
    drop.addEventListener('click',()=>input.click());
    input.addEventListener('change',()=>{addFiles(input.files); input.value='';});

    let progressEl=null;
    function showProgress(){
      if(progressEl) return;
      progressEl=document.createElement('div');
      progressEl.className='progressbar';
      progressEl.setAttribute('role','progressbar');
      progressEl.setAttribute('aria-label','Processing');
      progressEl.innerHTML='<div class="bar"></div>';
      status.insertAdjacentElement('afterend',progressEl);
    }
    function hideProgress(){ if(progressEl){progressEl.remove(); progressEl=null;} }

    const btnLabel=btn.textContent;
    btn.addEventListener('click',async()=>{
      if(!files.length) return;
      if(blobUrl) URL.revokeObjectURL(blobUrl);
      result.classList.remove('show'); btn.disabled=true; btn.textContent='Working…';
      setStatus('Working on it now. Large photos can take a few seconds - no need to click again.');
      showProgress();
      try{
        const fd=new FormData();
        fd.append('file',files[0]);
        let endpoint;
        if(mode==='compress'){ endpoint='/api/compress-image'; fd.append('targetSize',target); }
        else{ endpoint='/api/convert'; fd.append('to',to); }
        const res=await fetch(endpoint,{method:'POST',body:fd});
        if(!res.ok){let j={}; try{j=await res.json()}catch{} throw new Error(j.message||j.error||`Server returned ${res.status}`)}
        const blob=await res.blob(); blobUrl=URL.createObjectURL(blob);
        const cd=res.headers.get('Content-Disposition')||''; const m=cd.match(/filename="?([^";]+)"?/);
        const name=m?m[1]:('getimagepress-output.'+(mode==='compress'?'jpg':(to||'jpg')));
        dl.href=blobUrl; dl.download=name;
        original.textContent=fmt(files[0].size); final.textContent=fmt(blob.size);
        const pct=Math.round((1-blob.size/files[0].size)*100);
        saved.textContent=(pct>=0?'-':'+')+Math.abs(pct)+'%';
        result.classList.add('show');
        const warning=res.headers.get('X-Warning-Message');
        setStatus(warning||'Done. Download your image below.','ok');
        window.getIMAGEpressDownloadComplete=function(){ if(window.gtag) gtag('event','download_complete',{tool:toolLabel}); };
      }catch(err){setStatus(err.message||'Something went wrong. Please try a smaller file or a different tool.','err')}
      finally{hideProgress(); btn.textContent=btnLabel; btn.disabled=!files.length;}
    });

    render();
  });
})();
