// Offline Image Converter — vanilla JS
(function(){
  'use strict';

  // ---------- State ----------
  const state = {
    files: [], // {id, file, url, name, width, height, crop, focalX, focalY}
    targetFormat: 'image/webp',
    quality: 0.92,
    resizeMode: 'original',
    pxW: 0,
    pxH: 0,
    keepAspect: true,
    pct: 100,
    bgColor: '#000000',
    rotate: 0,
    flipH: false,
    flipV: false,

    // crop
    cropEnable: false,
    cropAspect: 'free',
    presetAspect: null,
    focalX: 50,
    focalY: 50,

    // watermark text
    wmText: '',
    wmOpacity: 0.25,
    wmSize: 24,
    wmPos: 'bottom-right',
    wmMargin: 16,

    // watermark logo
    logoUrl: null,
    logoImg: null,
    logoOpacity: 0.5,
    logoScale: 12,
    logoPos: 'bottom-right',
    logoMargin: 16,

    // enhance
    enhanceOn: false,
    contrast: 1.08,
    exposure: 0,
    sharpenOn: false,
    sharpenAmt: 0.5,

    // meta
    metadata: true,

    // crop modal
    cropActiveId: null,
    cropZoom: 1,

    theme: (localStorage.getItem('theme')||'light')
  };

  if (state.theme==='dark') document.documentElement.setAttribute('data-theme','dark');

  // ---------- Element refs ----------
  const $ = (sel)=>document.querySelector(sel);
  const $$ = (sel)=>document.querySelectorAll(sel);

  const els = {
    toggleTheme: $('#toggleTheme'),
    convertAll: $('#convertAll'),
    dropzone: $('#dropzone'),
    pickFiles: $('#pickFiles'),
    fileInput: $('#fileInput'),
    pickLogo: $('#pickLogo'),
    logoInput: $('#logoInput'),
    format: $('#format'),
    quality: $('#quality'),
    qLabel: $('#qLabel'),
    resizeMode: $('#resizeMode'),
    pxBox: $('#pxBox'),
    pxW: $('#pxW'),
    pxH: $('#pxH'),
    keepAspect: $('#keepAspect'),
    pctBox: $('#pctBox'),
    pct: $('#pct'),
    bgColor: $('#bgColor'),
    rotate: $('#rotate'),
    flipH: $('#flipH'),
    flipV: $('#flipV'),
    cropEnable: $('#cropEnable'),
    cropAspect: $('#cropAspect'),
    preset: $('#preset'),
    openCrop: $('#openCrop'),
    focalRow: $('#focalRow'),
    focalX: $('#focalX'),
    focalY: $('#focalY'),
    wmText: $('#wmText'),
    wmOpacity: $('#wmOpacity'),
    wmOL: $('#wmOL'),
    wmSize: $('#wmSize'),
    wmPos: $('#wmPos'),
    wmMargin: $('#wmMargin'),
    logoOpacity: $('#logoOpacity'),
    logoOL: $('#logoOL'),
    logoScale: $('#logoScale'),
    logoPos: $('#logoPos'),
    logoMargin: $('#logoMargin'),
    enhanceOn: $('#enhanceOn'),
    contrast: $('#contrast'),
    cLabel: $('#cLabel'),
    exposure: $('#exposure'),
    eLabel: $('#eLabel'),
    sharpenOn: $('#sharpenOn'),
    sharpenAmt: $('#sharpenAmt'),
    metadata: $('#metadata'),
    clearAll: $('#clearAll'),
    queue: $('#queue'),
    count: $('#count'),

    // modal
    cropModal: $('#cropModal'),
    cropImage: $('#cropImage'),
    cropBox: $('#cropBox'),
    cropSave: $('#cropSave'),
    cropClose: $('#cropClose'),
    cropReset: $('#cropReset'),
    cropZoom: $('#cropZoom')
  };

  // ---------- Utils ----------
  function uid(){ return crypto.randomUUID ? crypto.randomUUID() : 'id_'+Math.random().toString(36).slice(2); }
  function el(tag, attrs={}, children=[]) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k==='class') e.className = v;
      else if (k==='text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    children.forEach(c=> e.appendChild(c));
    return e;
  }
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  function imageDims(url){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload = () => resolve({w: img.naturalWidth, h: img.naturalHeight});
      img.onerror = reject;
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }
  function loadImage(url){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload = ()=>resolve(img);
      img.onerror = reject;
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  function placeRect(w, h, cw, ch, pos, m){
    let x=0, y=0;
    switch(pos){
      case 'top-left': x=m; y=m+h; break;
      case 'top-right': x=cw-m-w; y=m+h; break;
      case 'bottom-left': x=m; y=ch-m; break;
      case 'center': x=(cw-w)/2; y=(ch+h)/2; break;
      default: x=cw-m-w; y=ch-m;
    }
    return {x,y};
  }
  function hasSolidBg(hex){ return typeof hex==='string' && hex.length>=7 && hex.length!==9; }

  // ZIP (store only, no compression)
  function zipStore(files){
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    function push(arr){ chunks.push(arr); offset += arr.length; }
    function le16(n){ const a=new Uint8Array(2); a[0]=n&0xff; a[1]=(n>>8)&0xff; return a; }
    function le32(n){ const a=new Uint8Array(4); a[0]=n&0xff; a[1]=(n>>8)&0xff; a[2]=(n>>16)&0xff; a[3]=(n>>24)&0xff; return a; }
    function crc32(u8){
      let c = ~0>>>0;
      for (let i=0;i<u8.length;i++){ c = (c>>>8) ^ table[(c ^ u8[i]) & 0xff]; }
      return (~c)>>>0;
    }
    const table = new Uint32Array(256).map((_,n)=>{
      let c=n; for(let k=0;k<8;k++){ c = (c & 1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1); } return c>>>0;
    });

    for (const f of files){
      const nameBytes = encoder.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      // Local file header
      push(Uint8Array.from([0x50,0x4b,0x03,0x04]));
      push(le16(20)); // version 2.0
      push(le16(0));  // flags
      push(le16(0));  // method 0 = store
      push(le16(0)); push(le16(0)); // time/date zero
      push(le32(crc));
      push(le32(size));
      push(le32(size));
      push(le16(nameBytes.length));
      push(le16(0)); // extra length
      push(nameBytes);
      push(f.data);
      const lfhEndOffset = offset;

      // Central directory header
      const header = [];
      const pushH = (a)=>header.push(a);
      pushH(Uint8Array.from([0x50,0x4b,0x01,0x02]));
      pushH(le16(20)); // version made by
      pushH(le16(20)); // version needed
      pushH(le16(0)); // flags
      pushH(le16(0)); // method
      pushH(le16(0)); pushH(le16(0)); // time/date
      pushH(le32(crc));
      pushH(le32(size));
      pushH(le32(size));
      pushH(le16(nameBytes.length));
      pushH(le16(0)); // extra len
      pushH(le16(0)); // comment len
      pushH(le16(0)); // disk start
      pushH(le16(0)); // int attrs
      pushH(le32(0)); // ext attrs
      pushH(le32(lfhEndOffset - size - 30 - nameBytes.length)); // relative offset of local header
      pushH(nameBytes);
      const cd = header.reduce((acc,cur)=>{
        const out = new Uint8Array(acc.length + cur.length);
        out.set(acc,0); out.set(cur,acc.length); return out;
      }, new Uint8Array(0));
      central.push(cd);
    }

    const centralDir = central.reduce((acc,cur)=>{
      const out = new Uint8Array(acc.length + cur.length);
      out.set(acc,0); out.set(cur,acc.length); return out;
    }, new Uint8Array(0));

    const cdOffset = offset;
    const chunksBeforeCD = chunks.reduce((n,a)=>n+a.length,0);
    // Append central directory
    chunks.push(centralDir);
    offset += centralDir.length;
    const cdSize = centralDir.length;

    // End of central directory
    const eocd = [];
    const filesCount = files.length;
    eocd.push(Uint8Array.from([0x50,0x4b,0x05,0x06]));
    eocd.push(le16(0)); eocd.push(le16(0)); // disk numbers
    eocd.push(le16(filesCount)); eocd.push(le16(filesCount));
    eocd.push(le32(cdSize));
    eocd.push(le32(chunksBeforeCD)); // offset of start of central directory
    eocd.push(le16(0)); // comment length
    const eocdBuf = eocd.reduce((a,c)=>{ const o=new Uint8Array(a.length+c.length); o.set(a,0); o.set(c,a.length); return o; }, new Uint8Array(0));
    chunks.push(eocdBuf);

    const total = chunks.reduce((n,a)=>n+a.length,0);
    const out = new Uint8Array(total);
    let pos=0; for(const a of chunks){ out.set(a,pos); pos+=a.length; }
    return new Blob([out], {type:"application/zip"});
  }

  // ---------- File handling ----------
  async function addFiles(list){
    const arr = Array.from(list||[]);
    const filtered = arr.filter(f => f.type.startsWith('image/'));
    for (const file of filtered){
      const url = URL.createObjectURL(file);
      const dims = await imageDims(url);
      state.files.push({ id: uid(), file, url, name: file.name, width: dims.w, height: dims.h, crop: null, focalX:50, focalY:50 });
    }
    renderQueue();
  }

  function removeFile(id){
    const i = state.files.findIndex(f=>f.id===id);
    if (i>=0){
      URL.revokeObjectURL(state.files[i].url);
      state.files.splice(i,1);
      renderQueue();
    }
  }

  function moveFile(id, dir){
    const i = state.files.findIndex(f=>f.id===id);
    if (i<0) return;
    const j = i + (dir==='up'?-1:1);
    if (j<0 || j>=state.files.length) return;
    const t = state.files[i]; state.files[i]=state.files[j]; state.files[j]=t;
    renderQueue();
  }

  function clearAll(){
    state.files.forEach(f=> URL.revokeObjectURL(f.url));
    state.files = [];
    renderQueue();
  }

  // ---------- Crop modal ----------
  let crop = { x: 80, y: 80, w: 200, h: 200 };
  let dragging = false, dragEdge = null, dragStart = null;

  function openCrop(id){
    const f = state.files.find(x=>x.id===id) || state.files[0];
    if (!f) return;
    state.cropActiveId = f.id;
    els.cropImage.src = f.url;
    // Initialize crop
    requestAnimationFrame(()=>{
      const rect = els.cropImage.getBoundingClientRect();
      const cw = rect.width||600, ch = rect.height||400;
      const size = Math.min(cw, ch) * 0.6;
      crop.w = size; crop.h = size;
      crop.x = (cw - size)/2; crop.y = (ch - size)/2;
      applyCropBox();
    });
    els.cropZoom.value = state.cropZoom;
    els.cropModal.classList.remove('hidden');
  }
  function closeCrop(){ els.cropModal.classList.add('hidden'); state.cropActiveId = null; }

  function applyCropBox(){
    const box = els.cropBox;
    box.style.left = crop.x+'px';
    box.style.top = crop.y+'px';
    box.style.width = crop.w+'px';
    box.style.height = crop.h+'px';
  }

  function onCropMouseDown(e){
    const target = e.target;
    dragStart = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h };
    if (target.classList.contains('handle')){
      if (target.classList.contains('tl')) dragEdge='tl';
      else if (target.classList.contains('tr')) dragEdge='tr';
      else if (target.classList.contains('bl')) dragEdge='bl';
      else if (target.classList.contains('br')) dragEdge='br';
    } else {
      dragEdge='move';
    }
    dragging = true;
  }
  function onCropMouseMove(e){
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (dragEdge==='move'){
      crop.x = dragStart.cx + dx;
      crop.y = dragStart.cy + dy;
    } else {
      let nx = dragStart.cx, ny = dragStart.cy, nw = dragStart.cw, nh = dragStart.ch;
      if (dragEdge.includes('t')) { ny = dragStart.cy + dy; nh = dragStart.ch - dy; }
      if (dragEdge.includes('b')) { nh = dragStart.ch + dy; }
      if (dragEdge.includes('l')) { nx = dragStart.cx + dx; nw = dragStart.cw - dx; }
      if (dragEdge.includes('r')) { nw = dragStart.cw + dx; }
      // aspect lock
      let aspect = null;
      if (state.presetAspect) aspect = state.presetAspect;
      else if (state.cropAspect!=='free'){
        const map = {"1:1":1, "4:3":4/3, "16:9":16/9, "9:16":9/16};
        aspect = map[state.cropAspect] || null;
      }
      if (aspect){
        if (nw/nh > aspect){ nw = nh*aspect; } else { nh = nw/aspect; }
        if (dragEdge==='tl'){ nx = dragStart.cx + (dragStart.cw - nw); ny = dragStart.cy + (dragStart.ch - nh); }
        if (dragEdge==='tr'){ ny = dragStart.cy + (dragStart.ch - nh); }
        if (dragEdge==='bl'){ nx = dragStart.cx + (dragStart.cw - nw); }
      }
      crop.x = nx; crop.y = ny; crop.w = Math.max(20, nw); crop.h = Math.max(20, nh);
    }
    applyCropBox();
  }
  function onCropMouseUp(){ dragging=false; dragEdge=null; }

  function saveCrop(){
    const f = state.files.find(x=>x.id===state.cropActiveId);
    if (!f) return;
    const imgRect = els.cropImage.getBoundingClientRect();
    const scaleX = f.width / imgRect.width;
    const scaleY = f.height / imgRect.height;
    f.crop = {
      x: Math.round((crop.x) * scaleX),
      y: Math.round((crop.y) * scaleY),
      width: Math.round(crop.w * scaleX),
      height: Math.round(crop.h * scaleY)
    };
    closeCrop();
    renderQueue();
  }

  // ---------- Conversion ----------
  async function convertOne(f){
    const img = await loadImage(f.url);

    // Source crop
    let sx=0, sy=0, sw=img.naturalWidth, sh=img.naturalHeight;
    const useManualCrop = !!f.crop;
    if (useManualCrop){
      sx=f.crop.x; sy=f.crop.y; sw=f.crop.width; sh=f.crop.height;
    } else if (state.cropEnable){
      const aspectMap = { "1:1":1, "4:3":4/3, "16:9":16/9, "9:16":9/16 };
      const effectiveAspect = state.presetAspect || (state.cropAspect==='free' ? (sw / sh) : (aspectMap[state.cropAspect] || sw/sh));
      const fx = (f.focalX ?? 50) / 100; const fy = (f.focalY ?? 50) / 100;
      if (sw / sh > effectiveAspect) { sh = img.naturalHeight; sw = Math.round(sh * effectiveAspect); }
      else { sw = img.naturalWidth; sh = Math.round(sw / effectiveAspect); }
      sx = Math.round(fx * img.naturalWidth - sw/2); sy = Math.round(fy * img.naturalHeight - sh/2);
      sx = clamp(sx, 0, img.naturalWidth - sw);
      sy = clamp(sy, 0, img.naturalHeight - sh);
    }

    // Output size
    let tw = sw, th = sh;
    if (state.resizeMode==='pixels' && state.pxW>0 && state.pxH>0){
      if (state.keepAspect){
        const ratio = sw / sh;
        if (state.pxW / state.pxH > ratio){ th = state.pxH; tw = Math.round(th * ratio); }
        else { tw = state.pxW; th = Math.round(tw / ratio); }
      } else { tw = state.pxW; th = state.pxH; }
    } else if (state.resizeMode==='percent'){
      const p = clamp(Number(state.pct||100), 1, 1000)/100;
      tw = Math.max(1, Math.round(sw*p)); th = Math.max(1, Math.round(sh*p));
    }

    // Base canvas
    const base = document.createElement('canvas');
    base.width=tw; base.height=th;
    const bctx = base.getContext('2d');
    if (state.targetFormat==='image/jpeg' || hasSolidBg(state.bgColor)){ 
      bctx.fillStyle = state.targetFormat==='image/jpeg' ? (state.bgColor.slice(0,7) || '#000000') : state.bgColor;
      bctx.fillRect(0,0,tw,th);
    }
    bctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);

    // Rotate/flip
    const rad = (state.rotate % 360) * Math.PI/180;
    const cos = Math.abs(Math.cos(rad)), sin=Math.abs(Math.sin(rad));
    const rotW = Math.round(tw * cos + th * sin), rotH = Math.round(tw * sin + th * cos);
    const canvas = document.createElement('canvas'); canvas.width=rotW; canvas.height=rotH;
    const ctx = canvas.getContext('2d');
    if (state.targetFormat==='image/jpeg' || hasSolidBg(state.bgColor)){ 
      ctx.fillStyle = state.targetFormat==='image/jpeg' ? (state.bgColor.slice(0,7) || '#000000') : state.bgColor; 
      ctx.fillRect(0,0,rotW,rotH); 
    }
    ctx.translate(rotW/2, rotH/2); ctx.rotate(rad); ctx.scale(state.flipH?-1:1, state.flipV?-1:1);
    ctx.drawImage(base, -tw/2, -th/2);

    // Enhance
    if (state.enhanceOn || state.sharpenOn){
      const imgData = ctx.getImageData(0,0,canvas.width, canvas.height);
      let data = imgData.data;
      if (state.enhanceOn){
        const c = clamp(state.contrast, 0.1, 3);
        const e = clamp(Math.round(state.exposure*2.55), -255, 255);
        for (let i=0;i<data.length;i+=4){
          data[i] = clamp8(((data[i]-128)*c)+128 + e);
          data[i+1] = clamp8(((data[i+1]-128)*c)+128 + e);
          data[i+2] = clamp8(((data[i+2]-128)*c)+128 + e);
        }
      }
      if (state.sharpenOn){
        data = unsharpMask(data, canvas.width, canvas.height, state.sharpenAmt);
        imgData.data.set(data);
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Watermarks
    if (state.wmText && state.wmText.trim().length>0){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalAlpha = clamp(state.wmOpacity,0,1);
      ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = Math.max(1, Math.round(state.wmSize/10));
      ctx.font = `${state.wmSize}px sans-serif`;
      const w = ctx.measureText(state.wmText).width; const h = state.wmSize; const m = state.wmMargin;
      const pos = placeRect(w, h, canvas.width, canvas.height, state.wmPos, m);
      ctx.strokeText(state.wmText, pos.x, pos.y);
      ctx.fillText(state.wmText, pos.x, pos.y);
      ctx.globalAlpha = 1;
    }
    if (state.logoImg){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalAlpha = clamp(state.logoOpacity,0,1);
      const targetWidth = Math.round(canvas.width * (state.logoScale/100));
      const ratio = state.logoImg.naturalWidth/state.logoImg.naturalHeight;
      const w = targetWidth, h = Math.round(w/ratio), m=state.logoMargin;
      const pos = placeRect(w, h, canvas.width, canvas.height, state.logoPos, m);
      ctx.drawImage(state.logoImg, pos.x, pos.y - h, w, h);
      ctx.globalAlpha = 1;
    }

    const mime = state.targetFormat;
    const q = clamp(state.quality,0,1);
    const blob = await new Promise(res=> canvas.toBlob(res, mime, q));
    const ext = mime.split('/')[1] || 'png';
    const baseName = f.name.replace(/\.[^.]+$/, '');
    const outName = `${baseName}_converted.${ext}`;
    return { blob, name: outName };
  }

  function clamp8(v){ return Math.max(0, Math.min(255, v|0)); }
  function unsharpMask(data, w, h, amt){
    if (amt<=0) return data;
    const k = amt;
    const a = new Uint8ClampedArray(data);
    const idx=(x,y)=> (y*w + x)*4;
    const out = new Uint8ClampedArray(data.length);
    for (let y=1;y<h-1;y++){
      for (let x=1;x<w-1;x++){
        for (let c=0;c<3;c++){
          const i = idx(x,y)+c;
          const v = a[idx(x,y)+c]*(1+4*k)
                  - a[idx(x-1,y)+c]*k - a[idx(x+1,y)+c]*k
                  - a[idx(x,y-1)+c]*k - a[idx(x,y+1)+c]*k;
          out[i]=clamp8(v);
        }
        out[idx(x,y)+3]=a[idx(x,y)+3];
      }
    }
    for (let x=0;x<w;x++){ for (let c=0;c<4;c++){ out[idx(x,0)+c]=a[idx(x,0)+c]; out[idx(x,h-1)+c]=a[idx(x,h-1)+c]; } }
    for (let y=0;y<h;y++){ for (let c=0;c<4;c++){ out[idx(0,y)+c]=a[idx(0,y)+c]; out[idx(w-1,y)+c]=a[idx(w-1,y)+c]; } }
    return out;
  }

  // ---------- Rendering ----------
  function renderQueue(){
    els.count.textContent = String(state.files.length);
    els.queue.innerHTML = '';
    if (!state.files.length) return;
    for (const [i,f] of state.files.entries()){
      const li = el('li',{},[
        el('div',{class:'q-preview'},[ el('img',{src:f.url, alt:f.name}) ]),
        el('div',{class:'q-controls'},[
          el('div',{class:'small', text:`${i+1}. ${f.name}` }),
          el('div',{},[
            el('button',{onClick:()=>moveFile(f.id,'up') , title:'Move up'},[document.createTextNode('⬆️')]),
            el('button',{onClick:()=>moveFile(f.id,'down'), title:'Move down'},[document.createTextNode('⬇️')]),
            el('button',{onClick:()=>convertSingle(f), title:'Convert this'},[document.createTextNode('⬇️ Convert')]),
            el('button',{onClick:()=>openCrop(f.id), title:'Manual crop…'},[document.createTextNode('✂️ Crop')]),
            el('button',{onClick:()=>removeFile(f.id), title:'Remove'},[document.createTextNode('🗑️')]),
          ])
        ])
      ]);
      els.queue.appendChild(li);
    }
  }

  // ---------- Events ----------
  els.toggleTheme.addEventListener('click', ()=>{
    const dark = document.documentElement.getAttribute('data-theme')==='dark';
    if (dark){ document.documentElement.removeAttribute('data-theme'); localStorage.setItem('theme','light'); }
    else { document.documentElement.setAttribute('data-theme','dark'); localStorage.setItem('theme','dark'); }
  });

  els.pickFiles.addEventListener('click', ()=> els.fileInput.click());
  els.fileInput.addEventListener('change', (e)=> addFiles(e.target.files));

  els.pickLogo.addEventListener('click', ()=> els.logoInput.click());
  els.logoInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    state.logoUrl = url;
    state.logoImg = await loadImage(url);
  });

  // Dropzone
  ['dragenter','dragover'].forEach(ev=> els.dropzone.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); els.dropzone.classList.add('drag'); }));
  ;['dragleave','drop'].forEach(ev=> els.dropzone.addEventListener(ev, e=>{ e.preventDefault(); e.stopPropagation(); els.dropzone.classList.remove('drag'); }));
  els.dropzone.addEventListener('drop', (e)=>{
    const dt = e.dataTransfer;
    if (dt?.files?.length) addFiles(dt.files);
  });

  // Output settings
  els.format.addEventListener('change', e=> state.targetFormat = e.target.value);
  els.quality.addEventListener('input', e=> { state.quality = parseFloat(e.target.value); els.qLabel.textContent = `(${Math.round(state.quality*100)}%)`; });
  els.resizeMode.addEventListener('change', e=>{
    state.resizeMode = e.target.value;
    els.pxBox.classList.toggle('hidden', state.resizeMode!=='pixels');
    els.pctBox.classList.toggle('hidden', state.resizeMode!=='percent');
  });
  els.pxW.addEventListener('input', e=> state.pxW = parseInt(e.target.value||'0'));
  els.pxH.addEventListener('input', e=> state.pxH = parseInt(e.target.value||'0'));
  els.keepAspect.addEventListener('change', e=> state.keepAspect = e.target.checked);
  els.pct.addEventListener('input', e=> state.pct = parseInt(e.target.value||'100'));
  els.bgColor.addEventListener('input', e=> state.bgColor = e.target.value);
  els.rotate.addEventListener('input', e=> state.rotate = parseInt(e.target.value||'0'));
  els.flipH.addEventListener('change', e=> state.flipH = e.target.checked);
  els.flipV.addEventListener('change', e=> state.flipV = e.target.checked);

  // Crop controls
  els.cropEnable.addEventListener('change', e=> { state.cropEnable = e.target.checked; els.focalRow.classList.toggle('hidden', !state.cropEnable); });
  els.cropAspect.addEventListener('change', e=> state.cropAspect = e.target.value);
  els.preset.addEventListener('change', e=> state.presetAspect = e.target.value ? Number(e.target.value) : null );
  els.openCrop.addEventListener('click', ()=> openCrop(state.files[0]?.id));
  els.focalX.addEventListener('input', e=> state.focalX = parseInt(e.target.value));
  els.focalY.addEventListener('input', e=> state.focalY = parseInt(e.target.value));

  // Watermark
  els.wmText.addEventListener('input', e=> state.wmText = e.target.value);
  els.wmOpacity.addEventListener('input', e=> { state.wmOpacity = parseFloat(e.target.value); els.wmOL.textContent = `(${Math.round(state.wmOpacity*100)}%)`; });
  els.wmSize.addEventListener('input', e=> state.wmSize = parseInt(e.target.value||'24'));
  els.wmPos.addEventListener('change', e=> state.wmPos = e.target.value);
  els.wmMargin.addEventListener('input', e=> state.wmMargin = parseInt(e.target.value||'16'));

  els.logoOpacity.addEventListener('input', e=> { state.logoOpacity = parseFloat(e.target.value); els.logoOL.textContent = `(${Math.round(state.logoOpacity*100)}%)`; });
  els.logoScale.addEventListener('input', e=> state.logoScale = parseInt(e.target.value));
  els.logoPos.addEventListener('change', e=> state.logoPos = e.target.value);
  els.logoMargin.addEventListener('input', e=> state.logoMargin = parseInt(e.target.value||'16'));

  // Enhance
  els.enhanceOn.addEventListener('change', e=> state.enhanceOn = e.target.checked);
  els.contrast.addEventListener('input', e=> { state.contrast = parseFloat(e.target.value); els.cLabel.textContent = state.contrast.toFixed(2); });
  els.exposure.addEventListener('input', e=> { state.exposure = parseInt(e.target.value); els.eLabel.textContent = String(state.exposure); });
  els.sharpenOn.addEventListener('change', e=> state.sharpenOn = e.target.checked);
  els.sharpenAmt.addEventListener('input', e=> state.sharpenAmt = parseFloat(e.target.value));

  els.metadata.addEventListener('change', e=> state.metadata = e.target.checked);

  els.clearAll.addEventListener('click', clearAll);

  async function convertSingle(f){
    const { blob, name } = await convertOne(f);
    downloadBlob(blob, name);
  }

  els.convertAll.addEventListener('click', async ()=>{
    if (!state.files.length) return;
    const outputs = [];
    for (const f of state.files){
      const { blob, name } = await convertOne(f);
      const buf = new Uint8Array(await blob.arrayBuffer());
      outputs.push({ name, data: buf });
    }
    const zipBlob = zipStore(outputs);
    downloadBlob(zipBlob, `converted_${Date.now()}.zip`);
  });

  function downloadBlob(blob, name){
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  }

  // Crop modal events
  els.cropBox.addEventListener('mousedown', onCropMouseDown);
  document.addEventListener('mousemove', onCropMouseMove);
  document.addEventListener('mouseup', onCropMouseUp);
  els.cropSave.addEventListener('click', saveCrop);
  els.cropClose.addEventListener('click', closeCrop);
  els.cropReset.addEventListener('click', ()=>{ crop = { x:80,y:80,w:200,h:200 }; applyCropBox(); });
  els.cropZoom.addEventListener('input', (e)=>{
    state.cropZoom = parseFloat(e.target.value);
    els.cropImage.style.transform = `scale(${state.cropZoom})`;
  });

  // Init
  renderQueue();
})();