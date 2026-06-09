const TAG_COLORS = {
  'Title':'#9aa1b1','Verse':'#5fcf80','Chorus':'#7c9cff','Pre-Chorus':'#c98be0',
  'Bridge':'#e6a44c','Tag':'#e06c6c','Ending':'#7fd6cf','Refrain':'#d4b85a','Intro':'#88a0b8'
};
const SECTION_RE = /^(title|verse|chorus|pre[-\s]?chorus|bridge|tag|ending|refrain|intro|interlude|vamp)\b/i;
const BG_PRESETS = ['#000000','#0B132B','#1B263B','#2C1A1D','#13261E','#1E1A2E','#3A2A0A','#FFFFFF','#1C1F27'];

// label = dropdown text, css = font-family used in preview, ppt = exact PowerPoint face name
const FONTS = [
  {label:'Arial',          css:"Arial, sans-serif",                ppt:'Arial'},
  {label:'Calibri',        css:"Calibri, 'Segoe UI', sans-serif",  ppt:'Calibri'},
  {label:'Georgia',        css:"Georgia, serif",                   ppt:'Georgia'},
  {label:'Times New Roman',css:"'Times New Roman', Times, serif",  ppt:'Times New Roman'},
  {label:'Verdana',        css:"Verdana, sans-serif",              ppt:'Verdana'},
  {label:'Trebuchet MS',   css:"'Trebuchet MS', sans-serif",       ppt:'Trebuchet MS'},
  {label:'Open Sans',      css:"'Open Sans', sans-serif",          ppt:'Open Sans'},
  {label:'Lato',           css:"'Lato', sans-serif",               ppt:'Lato'},
  {label:'Roboto',         css:"'Roboto', sans-serif",             ppt:'Roboto'},
  {label:'Montserrat',     css:"'Montserrat', sans-serif",         ppt:'Montserrat'},
  {label:'Raleway',        css:"'Raleway', sans-serif",            ppt:'Raleway'},
  {label:'Source Sans 3',  css:"'Source Sans 3', sans-serif",      ppt:'Source Sans Pro'},
  {label:'Oswald',         css:"'Oswald', sans-serif",             ppt:'Oswald'},
  {label:'Merriweather',   css:"'Merriweather', serif",            ppt:'Merriweather'},
  {label:'PT Serif',       css:"'PT Serif', serif",                ppt:'PT Serif'},
  {label:'Playfair Display',css:"'Playfair Display', serif",       ppt:'Playfair Display'}
];
function fontByLabel(l){ return FONTS.find(f=>f.label===l) || FONTS[0]; }

// Aspect presets: PowerPoint inches, plus CSS ratio for the preview canvas
const ASPECTS = {
  '16:9':  {w:13.333, h:7.5, cssRatio:'16/9'},
  '4:3':   {w:10.0,   h:7.5, cssRatio:'4/3'},
  '16:10': {w:12.0,   h:7.5, cssRatio:'16/10'}
};
let aspect = '16:9';
function aspectCfg(){ return ASPECTS[aspect]; }
function slidePtH(){ return aspectCfg().h * 72; }            // slide height in points
function boxWidthPt(){ return (aspectCfg().w - 0.8) * 72; }  // usable text width (0.4in pad each side)

let slides = [];
let songTitle = '';
let activeBg = '#000000';
let halign = 'center', valign = 'middle';
let breakMode = 'lyric';
let dragId = null;
let selectedId = null;
let clipboard = null;
let viewMode = 'editor';
let uid = 1;

const $ = s => document.querySelector(s);

function buildFontSelect(){
  $('#font').innerHTML = FONTS.map(f=>`<option>${f.label}</option>`).join('');
}

function normTag(raw){
  const m = raw.match(SECTION_RE);
  if(!m) return null;
  let t = m[1].toLowerCase().replace(/\s+/g,'-');
  if(t==='pre-chorus'||t==='prechorus') return 'Pre-Chorus';
  const map={title:'Title',verse:'Verse',chorus:'Chorus',bridge:'Bridge',tag:'Tag',ending:'Ending',refrain:'Refrain',intro:'Intro',interlude:'Intro',vamp:'Tag'};
  return map[t] || (t.charAt(0).toUpperCase()+t.slice(1));
}
function tagColor(tag){
  const base = (tag||'').split(' ')[0];
  return TAG_COLORS[base] || '#9aa1b1';
}

// ---- ChordPro import ----
function isChordPro(text){
  return /\[[A-G][^\]]*\]/.test(text) || /\{\s*(title|comment|artist|key|ccli)\s*:?/i.test(text);
}
function parseChordPro(text){
  const out=[];
  let title='';
  for(let raw of text.split('\n')){
    const line=raw.replace(/\r$/,'');
    const trimmed=line.trim();
    if(!trimmed){ out.push(''); continue; }

    const dir=trimmed.match(/^\{\s*([a-z_]+)\s*:?\s*(.*?)\s*\}$/i);
    if(dir){
      const key=dir[1].toLowerCase(), val=dir[2].trim();
      if(key==='title') title=val;
      else if(key==='comment'||key==='c') out.push(val); // section label
      // all other directives (artist,key,tempo,time,ccli*,copyright,footer...) dropped
      continue;
    }
    if(/^\{.*\}$/.test(trimmed)) continue;

    // drop trailing CCLI / metadata block
    if(/^CCLI\b/i.test(trimmed) || /^©/.test(trimmed) || /^For use solely/i.test(trimmed)
       || /SongSelect/i.test(trimmed) || /www\.ccli\.com/i.test(trimmed)) continue;

    // strip chords, rejoin chord-placement hyphen splits, collapse spaces
    let lyric=line.replace(/\[[^\]]*\]/g,'');
    lyric=lyric.replace(/\s*-\s*/g,'-');
    lyric=lyric.replace(/([A-Za-z'])-([A-Za-z'])/g,'$1$2');
    lyric=lyric.replace(/\s{2,}/g,' ').trim();
    if(lyric) out.push(lyric);
  }
  let body=out;
  while(body.length && body[0]==='') body.shift();
  while(body.length && body[body.length-1]==='') body.pop();
  return (title?title+'\n':'') + body.join('\n');
}

function buildBgSwatches(){
  const box = $('#bgSwatches'); box.innerHTML='';
  BG_PRESETS.forEach(c=>{
    const d=document.createElement('div');
    d.className='swatch'+(c.toLowerCase()===activeBg.toLowerCase()?' active':'');
    d.style.background=c;
    if(c==='#FFFFFF') d.style.borderColor='#555';
    d.onclick=()=>{activeBg=c; $('#bgColor').value=c.toLowerCase(); buildBgSwatches(); if(typeof applyStyleToAll==='function' && slides.length) applyStyleToAll();};
    box.appendChild(d);
  });
}

function setupSeg(id, setter){
  $('#'+id).querySelectorAll('button').forEach(b=>{
    b.onclick=()=>{
      $('#'+id).querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      setter(b.dataset.v);
    };
  });
}
setupSeg('halign', v=>{ halign=v; if(slides.length) applyStyleToAll(); });
setupSeg('valign', v=>{ valign=v; if(slides.length) applyStyleToAll(); });
setupSeg('breakMode', v=>{
  breakMode=v;
  $('#modeLyric').style.display = v==='lyric'?'block':'none';
  $('#modeDisplay').style.display = v==='display'?'block':'none';
});

function styleSnapshot(){
  return {
    font:$('#font').value,
    fontSize:parseInt($('#fontSize').value)||40,
    bold:$('#bold').checked,
    bg:$('#bgColor').value,
    txt:$('#txtColor').value,
    halign, valign,
    aspect,
    lineSpacing:parseFloat($('#lineSpacing').value)||1.15
  };
}

// Measure wrapped-line count using a real font string the browser actually honors.
let measureCtx = document.createElement('canvas').getContext('2d');
function estimateRenderedLines(lines, fontLabel, fontSizePt, bold){
  const f = fontByLabel(fontLabel);
  measureCtx.font = (bold?'700 ':'400 ') + fontSizePt + 'px ' + f.css;
  let total = 0;
  for(const raw of lines){
    const line = (raw||'').trim();
    if(!line){ total += 1; continue; }
    const words = line.split(/\s+/);
    let cur = '', wrapped = 1;
    for(const w of words){
      const test = cur ? cur+' '+w : w;
      if(measureCtx.measureText(test).width > boxWidthPt() && cur){ wrapped++; cur = w; }
      else cur = test;
    }
    total += wrapped;
  }
  return total;
}

function generate(){
  const raw = $('#lyrics').value.split('\n').map(l=>l.trimEnd());
  let started=false; songTitle='';
  const tokens=[];
  for(let i=0;i<raw.length;i++){
    const line=raw[i].trim();
    if(!line){ tokens.push({type:'blank'}); continue; }
    if(!started){ songTitle=line; started=true; continue; }
    const t=normTag(line);
    if(t && line.split(/\s+/).length<=3){ tokens.push({type:'section',tag:t,label:line}); }
    else tokens.push({type:'line',text:line});
  }

  const respect=$('#respectSections').checked;
  const st=styleSnapshot();
  slides=[];
  // optional title slide built from the first line
  if($('#titleSlide').checked && songTitle){
    slides.push({id:uid++,lines:[songTitle],tag:'Title',...st});
  }
  let curTag='Verse', buf=[];

  const per=parseInt($('#linesPer').value)||2;
  const maxDisp=parseInt($('#maxDisplay').value)||3;

  function flushLyric(){
    while(buf.length){
      const chunk=buf.splice(0,per);
      slides.push({id:uid++,lines:chunk,tag:curTag,...st});
    }
  }
  function flushDisplay(){
    // pack lines greedily until adding the next would exceed maxDisp rendered lines
    let chunk=[];
    const push=()=>{ if(chunk.length){ slides.push({id:uid++,lines:chunk,tag:curTag,...st}); chunk=[]; } };
    for(const ln of buf){
      const trial=[...chunk, ln];
      if(estimateRenderedLines(trial, st.font, st.fontSize, st.bold) > maxDisp && chunk.length){
        push(); chunk=[ln];
      } else {
        chunk=trial;
      }
    }
    push();
    buf.length=0;
  }
  const flush = breakMode==='display' ? flushDisplay : flushLyric;

  for(const tk of tokens){
    if(tk.type==='section'){ if(respect) flush(); curTag=tk.tag; }
    else if(tk.type==='line'){ buf.push(tk.text); }
    else if(tk.type==='blank'){ if(respect) flush(); }
  }
  flush();
  render();
}

// ---- shared helpers ----
function slideCanvasHTML(s, pxSize){
  return s.lines.map(l=>`<div class="ln" style="font-size:${pxSize}px;line-height:${s.lineSpacing};font-weight:${s.bold?700:400}">${escapeHtml(l)||'&nbsp;'}</div>`).join('');
}
function moveSlide(fromId, beforeIndex){
  const from=slides.findIndex(x=>x.id===fromId);
  if(from<0) return;
  const [moved]=slides.splice(from,1);
  // beforeIndex is the index in the ORIGINAL array we want to land before
  let to=beforeIndex; if(from<beforeIndex) to--;
  to=Math.max(0,Math.min(slides.length,to));
  slides.splice(to,0,moved);
  render();
}

// One-time drag-to-reorder setup on the persistent #slides container.
// Thumbnails: the dragged tile physically moves and others shuffle to open a gap.
// List view: a single drop-line indicator (vertical-only, so a line reads clearly).
let _dropLine=null;
function clearDropLines(){
  document.querySelectorAll('.drop-line').forEach(n=>n.remove());
  _dropLine=null;
}
function commitDomOrder(container){
  // rebuild slides[] to match current DOM order of [data-id] nodes
  const ids=[...container.querySelectorAll('[data-id]')].map(el=>el.dataset.id);
  slides.sort((a,b)=>ids.indexOf(String(a.id))-ids.indexOf(String(b.id)));
}
function setupDragReorder(){
  const container=$('#slides');
  container.addEventListener('dragover',e=>{
    if(dragId===null) return;
    e.preventDefault();

    if(viewMode==='thumbs'){
      // LIVE MOVE: physically relocate the dragged tile among siblings.
      // Direction is decided by current DOM position vs target, so tiles shift
      // toward the gap the dragged tile left, rather than by cursor side.
      const dragged=container.querySelector(`[data-id="${dragId}"]`);
      if(!dragged) return;
      const all=[...container.querySelectorAll('[data-id]')];
      const items=all.filter(el=>el!==dragged);
      if(!items.length) return;
      // the tile the cursor is actually over (not just nearest) is the slot we swap with
      let target=null;
      for(const el of items){
        const r=el.getBoundingClientRect();
        if(e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom){ target=el; break; }
      }
      if(target){
        const dIdx=all.indexOf(dragged);
        const tIdx=all.indexOf(target);
        if(dIdx < tIdx){
          container.insertBefore(dragged, target.nextSibling);
        } else {
          container.insertBefore(dragged, target);
        }
      }
      return;
    }

    // LIST: drop-line indicator
    const items=[...container.querySelectorAll('[data-id]')].filter(el=>el.dataset.id!=dragId);
    if(!items.length){ return; }
    let target=null, before=true;
    for(const el of items){
      const r=el.getBoundingClientRect();
      if(e.clientY < r.top+r.height/2){ target=el; before=true; break; }
      target=el; before=false;
    }
    if(!_dropLine){ _dropLine=document.createElement('div'); _dropLine.className='drop-line'; }
    _dropLine.style.gridColumn='';
    if(!target) container.appendChild(_dropLine);
    else if(before) container.insertBefore(_dropLine,target);
    else container.insertBefore(_dropLine,target.nextSibling);
  });
  container.addEventListener('drop',e=>{
    e.preventDefault();
    if(dragId===null){ clearDropLines(); return; }

    if(viewMode==='thumbs'){
      // DOM already reflects desired order; commit it
      commitDomOrder(container);
      clearDropLines();
      dragId=null;
      render();
      return;
    }

    let cnt=0;
    if(_dropLine && _dropLine.parentNode===container){
      const kids=[...container.children];
      const lineIdx=kids.indexOf(_dropLine);
      for(let i=0;i<lineIdx;i++){ if(kids[i].dataset && kids[i].dataset.id!==undefined) cnt++; }
    } else {
      cnt=slides.length;
    }
    clearDropLines();
    moveSlide(dragId, cnt);
    dragId=null;
  });
}
// global safety net: any drag ending anywhere wipes stray lines and resyncs order
document.addEventListener('dragend',()=>{
  // if a thumb drag ended without a drop on target, re-render to snap back to data order
  clearDropLines();
  if(dragId!==null && viewMode==='thumbs'){ dragId=null; render(); }
  else dragId=null;
});

function render(){
  clearDropLines();
  saveState();
  commitHistory();
  $('#slideCount').textContent=slides.length+' slide'+(slides.length!==1?'s':'');
  $('#songTitle').textContent=songTitle||'No song loaded';

  const box=$('#slides');
  box.className = viewMode==='thumbs' ? 'thumbs' : 'slides';
  box.innerHTML='';

  if(!slides.length){
    box.className='';
    box.innerHTML='<div class="empty">No slides yet.<br>Paste lyrics on the left and click <b>Generate</b>.</div>';
    return;
  }

  if(viewMode==='thumbs') renderThumbs(box);
  else renderEditor(box);
}

function renderEditor(box){
  slides.forEach((s,idx)=>{
    const f = fontByLabel(s.font);
    const rendered = estimateRenderedLines(s.lines, s.font, s.fontSize, s.bold);
    const cfg = ASPECTS[s.aspect] || ASPECTS['16:9'];
    const previewW = 220, previewH = previewW * (cfg.h / cfg.w);
    const pxSize = Math.max(5, (s.fontSize / (cfg.h*72)) * previewH);

    const el=document.createElement('div');
    el.className='slide'+(s.id===selectedId?' selected':''); el.dataset.id=s.id;

    const tagOpts=Object.keys(TAG_COLORS).map(t=>`<option ${s.tag&&s.tag.startsWith(t)?'selected':''}>${t}</option>`).join('');
    const justify = s.valign==='top'?'flex-start':s.valign==='bottom'?'flex-end':'center';

    el.innerHTML=`
      <div class="slide-head" draggable="true">
        <span class="grip">⠿</span>
        <span class="tag" style="background:${tagColor(s.tag)};color:#0d0f14">${s.tag||'Untagged'}</span>
        <span class="slide-num">#${idx+1}</span>
        <div class="slide-actions">
          <button class="icon-btn" data-act="add" title="Add blank slide below">+</button>
          <button class="icon-btn" data-act="dup">Duplicate</button>
          <button class="icon-btn" data-act="up">↑</button>
          <button class="icon-btn" data-act="down">↓</button>
          <button class="icon-btn danger" data-act="del">✕</button>
        </div>
      </div>
      <div class="preview">
        <div class="canvas" style="aspect-ratio:${cfg.cssRatio};background:${s.bg};color:${s.txt};font-family:${f.css};justify-content:${justify};text-align:${s.halign}">
          ${slideCanvasHTML(s,pxSize)}
        </div>
        <div class="edit-area">
          <textarea data-edit rows="${Math.max(2,s.lines.length)}">${s.lines.join('\n')}</textarea>
          <div class="meta-row">
            <select data-tag>${tagOpts}</select>
            <select data-tagnum>
              ${['','1','2','3','4','5','6'].map(n=>`<option ${(s.tag||'').endsWith(' '+n)?'selected':''}>${n}</option>`).join('')}
            </select>
            <span class="pill">${s.font} ${s.fontSize}pt</span>
            <span class="pill">~${rendered} display lines</span>
          </div>
        </div>
      </div>`;

    el.addEventListener('mousedown',ev=>{ if(!ev.target.closest('textarea,select,button')) selectSlide(s.id); });

    el.querySelector('[data-edit]').addEventListener('input',e=>{
      s.lines=e.target.value.split('\n');
      el.querySelector('.canvas').innerHTML=slideCanvasHTML(s,pxSize);
      const rl=estimateRenderedLines(s.lines, s.font, s.fontSize, s.bold);
      const pills=el.querySelectorAll('.meta-row .pill');
      pills[pills.length-1].textContent='~'+rl+' display lines';
    });
    const setTag=()=>{
      const base=el.querySelector('[data-tag]').value;
      const num=el.querySelector('[data-tagnum]').value;
      s.tag=num?base+' '+num:base;
      el.querySelector('.tag').textContent=s.tag;
      el.querySelector('.tag').style.background=tagColor(s.tag);
    };
    el.querySelector('[data-tag]').addEventListener('change',setTag);
    el.querySelector('[data-tagnum]').addEventListener('change',setTag);

    el.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',e=>{
      e.stopPropagation();
      const i=slides.findIndex(x=>x.id===s.id);
      const act=b.dataset.act;
      if(act==='del') slides.splice(i,1);
      else if(act==='add'){ const ns={...JSON.parse(JSON.stringify(s)),id:uid++,lines:[''],tag:'Verse'}; slides.splice(i+1,0,ns); selectedId=ns.id; }
      else if(act==='dup') slides.splice(i+1,0,{...JSON.parse(JSON.stringify(s)),id:uid++});
      else if(act==='up'&&i>0){ [slides[i-1],slides[i]]=[slides[i],slides[i-1]]; }
      else if(act==='down'&&i<slides.length-1){ [slides[i+1],slides[i]]=[slides[i],slides[i+1]]; }
      render();
    }));

    const head=el.querySelector('.slide-head');
    head.addEventListener('dragstart',()=>{dragId=s.id; el.classList.add('dragging'); selectSlide(s.id);});
    head.addEventListener('dragend',()=>{el.classList.remove('dragging');});

    box.appendChild(el);
  });
}

function renderThumbs(box){
  slides.forEach((s,idx)=>{
    const f = fontByLabel(s.font);
    const cfg = ASPECTS[s.aspect] || ASPECTS['16:9'];
    const previewW = 170, previewH = previewW * (cfg.h / cfg.w);
    const pxSize = Math.max(4, (s.fontSize / (cfg.h*72)) * previewH);
    const justify = s.valign==='top'?'flex-start':s.valign==='bottom'?'flex-end':'center';

    const el=document.createElement('div');
    el.className='thumb'+(s.id===selectedId?' selected':''); el.dataset.id=s.id;
    el.draggable=true;
    el.innerHTML=`
      <div class="thumb-head">
        <span class="tag" style="background:${tagColor(s.tag)};color:#0d0f14">${s.tag||'—'}</span>
        <span class="slide-num">#${idx+1}</span>
      </div>
      <div class="canvas" style="aspect-ratio:${cfg.cssRatio};background:${s.bg};color:${s.txt};font-family:${f.css};justify-content:${justify};text-align:${s.halign}">
        ${slideCanvasHTML(s,pxSize)}
      </div>`;
    el.addEventListener('click',()=>selectSlide(s.id));
    el.addEventListener('dragstart',()=>{dragId=s.id; el.classList.add('dragging'); selectSlide(s.id);});
    el.addEventListener('dragend',()=>{el.classList.remove('dragging');});
    box.appendChild(el);
  });
}

function selectSlide(id){
  selectedId=id;
  document.querySelectorAll('.slide,.thumb').forEach(el=>{
    el.classList.toggle('selected', el.dataset.id==id);
  });
}

function escapeHtml(s){return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

$('#generate').onclick=generate;
$('#importBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').addEventListener('change',e=>{
  const file=e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const text=ev.target.result;
    $('#lyrics').value = isChordPro(text) ? parseChordPro(text) : text.trim();
    generate();
  };
  reader.readAsText(file);
  e.target.value=''; // allow re-importing the same file
});
$('#addSlide').onclick=()=>{ const ns={id:uid++,lines:[''],tag:'Verse',...styleSnapshot()}; const i=slides.findIndex(x=>x.id===selectedId); if(i>=0) slides.splice(i+1,0,ns); else slides.push(ns); selectedId=ns.id; render(); };

// ---- clipboard ----
function doCopy(){ const s=slides.find(x=>x.id===selectedId); if(s) clipboard=JSON.parse(JSON.stringify(s)); render(); }
function doCut(){ const i=slides.findIndex(x=>x.id===selectedId); if(i<0)return; clipboard=JSON.parse(JSON.stringify(slides[i])); slides.splice(i,1); selectedId = slides[i]?slides[i].id : (slides[i-1]?slides[i-1].id:null); render(); }
function doPaste(){ if(!clipboard)return; const copy={...JSON.parse(JSON.stringify(clipboard)),id:uid++}; const i=slides.findIndex(x=>x.id===selectedId); if(i>=0) slides.splice(i+1,0,copy); else slides.push(copy); selectedId=copy.id; render(); }

// ---- delete all ----
$('#deleteAll').onclick=()=>{
  if(!slides.length) return;
  if(!confirm('Delete all '+slides.length+' slide'+(slides.length!==1?'s':'')+'? You can undo with Ctrl/Cmd+Z.')) return;
  slides=[]; selectedId=null; clipboard=null; songTitle='';
  render();
};

// ---- help modal ----
$('#helpBtn').onclick=()=>{ $('#helpModal').style.display='flex'; };
$('#helpClose').onclick=()=>{ $('#helpModal').style.display='none'; };
$('#helpModal').addEventListener('click',e=>{ if(e.target===$('#helpModal')) $('#helpModal').style.display='none'; });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') $('#helpModal').style.display='none'; });

// ---- view toggle ----
setupSeg('viewMode', v=>{ viewMode=v; render(); });

// ---- undo / redo ----
// Snapshot the slide structure on every render(); the previous snapshot is
// pushed onto the undo stack whenever it actually changed. Selection is part of
// the snapshot so undo restores what was focused, but selection-only changes
// don't render and so never create spurious history entries.
let _undo=[], _redo=[], _present=null, _restoring=false;
const _HIST_MAX=100;
function histSnapshot(){ return JSON.stringify({slides, songTitle, selectedId, uid}); }
function commitHistory(){
  if(_restoring) return;
  const snap=histSnapshot();
  if(_present===null){ _present=snap; return; }   // first render: just seed
  if(snap===_present) return;                      // nothing structural changed
  _undo.push(_present);
  if(_undo.length>_HIST_MAX) _undo.shift();
  _redo.length=0;                                  // new action invalidates redo
  _present=snap;
}
function applyHistory(snap){
  const s=JSON.parse(snap);
  slides=s.slides; songTitle=s.songTitle; selectedId=s.selectedId; uid=s.uid;
  _restoring=true; render(); _restoring=false;
}
function undo(){
  if(!_undo.length) return;
  _redo.push(_present);
  _present=_undo.pop();
  applyHistory(_present);
}
function redo(){
  if(!_redo.length) return;
  _undo.push(_present);
  _present=_redo.pop();
  applyHistory(_present);
}
document.addEventListener('keydown',e=>{
  const mod=e.ctrlKey||e.metaKey;
  if(!mod) return;
  const k=e.key.toLowerCase();
  // While typing in a field, leave Ctrl/Cmd+Z to the browser's native text undo.
  if(e.target.matches('textarea,input,select')) return;
  if(k==='z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if(k==='y'){ e.preventDefault(); redo(); }
});

// ---- keyboard shortcuts (ignore while typing in a field) ----
document.addEventListener('keydown',e=>{
  const typing = e.target.matches('textarea,input,select');
  const mod = e.ctrlKey||e.metaKey;
  if(mod && !typing && selectedId!==null){
    if(e.key==='c'){ e.preventDefault(); doCopy(); }
    else if(e.key==='x'){ e.preventDefault(); doCut(); }
  }
  if(mod && e.key==='v' && !typing){ e.preventDefault(); doPaste(); }
  if((e.key==='Delete'||e.key==='Backspace') && !typing && selectedId!==null){
    e.preventDefault();
    const i=slides.findIndex(x=>x.id===selectedId);
    if(i>=0){ slides.splice(i,1); selectedId=slides[i]?slides[i].id:(slides[i-1]?slides[i-1].id:null); render(); }
  }
});
$('#applyStyle').onclick=()=>{ applyStyleToAll(); };

// Apply the current style panel settings to every slide, live.
function applyStyleToAll(){
  const st=styleSnapshot();
  slides.forEach(s=>Object.assign(s,st));
  render();
}
// Live-apply on any style control change (no need to click "Apply style to all").
['#font','#fontSize','#bold','#lineSpacing','#bgColor','#txtColor'].forEach(sel=>{
  const el=$(sel);
  el.addEventListener('input', applyStyleToAll);
  el.addEventListener('change', applyStyleToAll);
});
$('#bgColor').oninput=e=>{activeBg=e.target.value;buildBgSwatches();};
$('#aspect').onchange=e=>{
  aspect=e.target.value;
  // update existing slides to the new ratio so the preview reflects it immediately
  slides.forEach(s=>s.aspect=aspect);
  render();
};

$('#export').onclick=()=>{
  if(!slides.length){alert('No slides to export. Generate some first.');return;}
  if(typeof PptxGenJS === 'undefined'){
    alert('The PowerPoint library did not load. Check your internet connection and refresh the page, then try again.');
    return;
  }
  try{
    const pptx=new PptxGenJS();
    const used=[...new Set(slides.map(s=>s.aspect||'16:9'))];
    used.forEach(a=>{ const c=ASPECTS[a]; pptx.defineLayout({name:'A_'+a.replace(':','_'), width:c.w, height:c.h}); });
    const deckAspect = slides[0].aspect || '16:9';
    pptx.layout='A_'+deckAspect.replace(':','_');
    const deckCfg=ASPECTS[deckAspect];

    slides.forEach(s=>{
      const f = fontByLabel(s.font);
      const slide=pptx.addSlide();
      slide.background={color:s.bg.replace('#','')};
      slide.addText(s.lines.join('\n'),{
        x:0.4, y:0.3, w:deckCfg.w-0.8, h:deckCfg.h-0.6,
        align:s.halign, valign:s.valign,
        fontFace:f.ppt, fontSize:s.fontSize, bold:s.bold,
        color:s.txt.replace('#',''),
        lineSpacingMultiple:s.lineSpacing
      });
    });
    const name=(songTitle||'worship-slides').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-');
    pptx.writeFile({fileName:name+'.pptx'}).catch(err=>{
      alert('Export failed: '+err.message);
    });
  }catch(err){
    alert('Export failed: '+err.message);
  }
};

// ---- local persistence (survives reload) ----
const STORAGE_KEY = 'worship-slide-maker:v1';

function saveState(){
  try{
    const state={
      lyrics:$('#lyrics').value,
      slides, songTitle, uid,
      activeBg, halign, valign, breakMode, viewMode, aspect,
      controls:{
        font:$('#font').value,
        fontSize:$('#fontSize').value,
        bold:$('#bold').checked,
        lineSpacing:$('#lineSpacing').value,
        bgColor:$('#bgColor').value,
        txtColor:$('#txtColor').value,
        aspect:$('#aspect').value,
        linesPer:$('#linesPer').value,
        maxDisplay:$('#maxDisplay').value,
        respectSections:$('#respectSections').checked,
        titleSlide:$('#titleSlide').checked
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){ /* storage full / disabled — fail quietly */ }
}
let _saveTimer=null;
function saveStateSoon(){ clearTimeout(_saveTimer); _saveTimer=setTimeout(saveState,300); }

function syncSeg(id, v){
  $('#'+id).querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.v===v));
}

function loadState(){
  let raw;
  try{ raw=localStorage.getItem(STORAGE_KEY); }catch(e){ return false; }
  if(!raw) return false;
  let state;
  try{ state=JSON.parse(raw); }catch(e){ return false; }
  if(!state || !Array.isArray(state.slides) || !state.slides.length) return false;

  const c=state.controls||{};
  if(state.lyrics!=null) $('#lyrics').value=state.lyrics;
  if(c.font) $('#font').value=c.font;
  if(c.fontSize) $('#fontSize').value=c.fontSize;
  if(typeof c.bold==='boolean') $('#bold').checked=c.bold;
  if(c.lineSpacing) $('#lineSpacing').value=c.lineSpacing;
  if(c.bgColor) $('#bgColor').value=c.bgColor;
  if(c.txtColor) $('#txtColor').value=c.txtColor;
  if(c.aspect) $('#aspect').value=c.aspect;
  if(c.linesPer) $('#linesPer').value=c.linesPer;
  if(c.maxDisplay) $('#maxDisplay').value=c.maxDisplay;
  if(typeof c.respectSections==='boolean') $('#respectSections').checked=c.respectSections;
  if(typeof c.titleSlide==='boolean') $('#titleSlide').checked=c.titleSlide;

  slides=state.slides;
  songTitle=state.songTitle||'';
  uid=state.uid||1;
  activeBg=state.activeBg||'#000000';
  halign=state.halign||'center';
  valign=state.valign||'middle';
  breakMode=state.breakMode||'lyric';
  viewMode=state.viewMode||'editor';
  aspect=state.aspect||'16:9';
  // guard against id collisions on future inserts
  slides.forEach(s=>{ if(typeof s.id==='number' && s.id>=uid) uid=s.id+1; });

  // reflect restored values in the segmented controls + mode panels
  syncSeg('halign', halign);
  syncSeg('valign', valign);
  syncSeg('breakMode', breakMode);
  syncSeg('viewMode', viewMode);
  $('#modeLyric').style.display = breakMode==='lyric'?'block':'none';
  $('#modeDisplay').style.display = breakMode==='display'?'block':'none';
  return true;
}

// persist on any control/lyrics edit (render() also saves after slide mutations)
document.addEventListener('input', saveStateSoon);
document.addEventListener('change', saveStateSoon);

// seed
$('#lyrics').value=`And Can It Be (Sagina)
Verse 1
And can it be that I should gain
An interest in the Savior's blood
Died He for me who caused His pain
For me who Him to death pursued
Amazing love how can it be
That Thou my God shouldst die for me
Amazing love how can it be
That Thou my God shouldst die for me`;

buildFontSelect();
const restored = loadState();           // pulls back controls + slides if a prior session was saved
buildBgSwatches();                      // reads activeBg, so run after loadState
setupDragReorder();
const start = restored ? render : generate;
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(start); }
else start();
