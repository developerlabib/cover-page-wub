import { createCover, assembleAssignment, templates, emptyFields, sampleFields } from './pdf-engine.js';
import * as pdfjs from './vendor/pdf.mjs';
import { siteConfig } from './config.js';
import { cloudEnabled, saveCloudDraft, loadCloudDraft } from './cloud.js';
import { storageKey, normalizeDraft } from './draft.js';

pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const icon=(name,cls='')=>`<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let fields={...emptyFields},template=0,quality='original',step=0,entries=[];
let coverBytes,previewPdf,previewIndex=0,renderTask,renderVersion=0,coverVersion=0,previewTimer,toastTimer;
const uploadedDocs=new Map();
try{restore(JSON.parse(localStorage.getItem(storageKey)||'null'));}catch{}

function restore(data){
  ({fields,template,quality}=normalizeDraft(data,{fields,template,quality}));
}
function draft(){return {schemaVersion:1,fields:{...fields},template,quality};}
function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(draft()));$('#save-status').innerHTML='<span></span>Saved on this device';}
  catch{$('#save-status').textContent='Local saving unavailable';}
}
function toast(message,error=false){clearTimeout(toastTimer);const t=$('#toast');t.textContent=message;t.classList.toggle('error',error);t.hidden=false;toastTimer=setTimeout(()=>t.hidden=true,error?7000:4200);}
function busy(title,detail){$('#busy-title').textContent=title;$('#busy-detail').textContent=detail||'Keeping everything in the right order.';$('#busy-overlay').hidden=false;}
function unbusy(){$('#busy-overlay').hidden=true;}
const nextPaint=()=>new Promise(resolve=>setTimeout(resolve,0));

function chooseStep(n){
  step=n;
  $$('.step').forEach((b,i)=>{b.classList.toggle('active',i===n);b.setAttribute('aria-selected',String(i===n));b.tabIndex=i===n?0:-1;});
  [0,1,2].forEach(i=>$('#panel-'+i).hidden=i!==n);
  $$('.side-link').forEach(b=>b.classList.toggle('active',Number(b.dataset.go)===(n===2?2:0)));
  $('#mobile-next-label').textContent=['Next: details','Next: export','Download PDF'][n];
  $('#mobile-next').setAttribute('aria-label',['Continue to cover details','Continue to assignment export','Download complete assignment PDF'][n]);
}
$$('[data-step]').forEach(b=>{
  b.addEventListener('click',()=>chooseStep(Number(b.dataset.step)));
  b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const n=event.key==='Home'?0:event.key==='End'?2:(step+(event.key==='ArrowRight'?1:2))%3;chooseStep(n);$('#step-'+n).focus();});
});
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>{chooseStep(Number(b.dataset.go));if(innerWidth<651)$('.steps').scrollIntoView({behavior:'smooth',block:'start'});}));

function renderTemplates(){
  $('#template-grid').innerHTML=templates.map((t,i)=>`<button class="template-card ${i===template?'selected':''}" data-template="${i}" aria-pressed="${i===template}" aria-label="${t.name} template, ${i+1} of 9"><div class="template-image"><img src="./assets/templates/${i+1}.jpg" alt="${t.name} original cover" loading="${i<3?'eager':'lazy'}" width="268" height="379">${t.tag?'<span class="popular-tag">POPULAR</span>':''}<span class="selected-tick">${icon('check')}</span></div><strong>${t.name}</strong><small>${t.mood}</small></button>`).join('');
  $('#cover-summary-name').textContent=`${templates[template].name} · Page 1`;
  $('#chosen-template').textContent=templates[template].name;
}
$('#template-grid').addEventListener('click',event=>{const b=event.target.closest('[data-template]');if(!b)return;template=Number(b.dataset.template);renderTemplates();persist();scheduleCover(0);});

const form=$('#details-form');
function syncAssignmentOption(){
  const enabled=fields.showAssignmentNo===true;
  $('#assignment-no-field').hidden=!enabled;
  form.elements.namedItem('assignmentNo').disabled=!enabled;
  $('#assignment-no-status').textContent=enabled?'Shown on your cover':'Hidden from your cover';
}
function syncForm(){for(const [key,value]of Object.entries(fields)){const input=form.elements.namedItem(key);if(typeof value==='boolean')input.checked=value;else input.value=value;}syncAssignmentOption();$('#quality').value=quality;updateQualityNote();}
form.addEventListener('submit',event=>event.preventDefault());
form.addEventListener('input',event=>{if(!(event.target.name in emptyFields))return;fields[event.target.name]=event.target.type==='checkbox'?event.target.checked:event.target.value;syncAssignmentOption();persist();scheduleCover();});
$('#sample-button').addEventListener('click',()=>{fields={...sampleFields};syncForm();persist();scheduleCover(0);toast('Sample details added. Replace them with your own before submitting.');});
$('#reset-button').addEventListener('click',()=>{fields={...emptyFields};syncForm();persist();scheduleCover(0);toast('Your saved details have been cleared.');});

function getPdf(bytes){return pdfjs.getDocument({data:new Uint8Array(bytes).slice(),standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,wasmUrl:new URL('./vendor/wasm/',import.meta.url).href,isEvalSupported:false}).promise;}
function scheduleCover(delay=300){
  clearTimeout(previewTimer);coverVersion++;
  $('.live-badge').innerHTML='<span></span>UPDATING';
  previewTimer=setTimeout(()=>updateCover(coverVersion),delay);
}
async function updateCover(version){
  try{
    const bytes=await createCover(fields,template);
    if(version!==coverVersion)return;
    coverBytes=bytes;
    await showDocument(bytes);
    if(version!==coverVersion)return;
    $('#preview-message').hidden=true;$('.live-badge').innerHTML='<span></span>UP TO DATE';
  }catch(error){if(version!==coverVersion)return;$('#preview-message').textContent=error.message;$('#preview-message').hidden=false;$('.live-badge').textContent='CHECK DETAILS';}
}
async function showDocument(bytes){
  const version=++renderVersion;
  if(renderTask){renderTask.cancel();try{await renderTask.promise;}catch{}}
  const next=await getPdf(bytes);
  if(version!==renderVersion){await next.destroy();return;}
  const previous=previewPdf;previewPdf=next;previewIndex=0;
  if(previous)await previous.destroy();
  await renderPreview();
}
async function renderPreview(){
  if(!previewPdf)return;
  const document=previewPdf,index=previewIndex;
  if(renderTask){renderTask.cancel();try{await renderTask.promise;}catch{}}
  const page=await document.getPage(index+1);
  if(document!==previewPdf||index!==previewIndex)return;
  const canvas=$('#preview-canvas');const view=page.getViewport({scale:1.5});
  canvas.width=Math.floor(view.width);canvas.height=Math.floor(view.height);
  renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport:view});
  try{await renderTask.promise;}catch(error){if(error.name==='RenderingCancelledException')return;throw error;}
  $('#preview-placeholder').hidden=true;
  $('#preview-page-label').textContent=`Page ${index+1} of ${document.numPages}`;
  $('#prev-page').disabled=index===0;$('#next-page').disabled=index===document.numPages-1;
}
for(const [selector,delta]of [['#prev-page',-1],['#next-page',1]])$(selector).addEventListener('click',async()=>{if(!previewPdf)return;previewIndex=Math.max(0,Math.min(previewPdf.numPages-1,previewIndex+delta));try{await renderPreview();}catch(e){toast(e.message,true);}});

async function imageFromBytes(bytes,mime){
  const blob=new Blob([bytes],{type:mime||'image/jpeg'});
  if('createImageBitmap'in window)return createImageBitmap(blob,{imageOrientation:'from-image'});
  const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);}
}
async function getUploadedPdf(entry){
  if(!uploadedDocs.has(entry.fileId))uploadedDocs.set(entry.fileId,getPdf(entry.bytes));
  return uploadedDocs.get(entry.fileId);
}
function canvasJpeg(canvas,amount){return new Promise((resolve,reject)=>canvas.toBlob(async blob=>{if(!blob){reject(new Error('This image could not be processed. Try a smaller image.'));return;}resolve(new Uint8Array(await blob.arrayBuffer()));},'image/jpeg',amount));}
async function rasterize(entry,quality){
  const config={original:{max:2600,pdfScale:2.5,jpeg:.94},balanced:{max:2000,pdfScale:2,jpeg:.82},compact:{max:1240,pdfScale:1.25,jpeg:.65}}[quality];
  const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d',{alpha:false});
  if(entry.kind==='pdf'){
    const doc=await getUploadedPdf(entry),page=await doc.getPage(entry.pageIndex+1);
    const natural=page.getViewport({scale:1,rotation:(page.rotate+entry.rotation)%360});
    const scale=Math.min(config.pdfScale,config.max/Math.max(natural.width,natural.height));
    const view=page.getViewport({scale,rotation:(page.rotate+entry.rotation)%360});
    canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
    await page.render({canvasContext:ctx,viewport:view,background:'rgb(255,255,255)'}).promise;
  }else{
    const image=await imageFromBytes(entry.bytes,entry.mime);
    const swap=entry.rotation%180!==0;const w=swap?image.height:image.width,h=swap?image.width:image.height;
    const ratio=Math.min(1,config.max/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(entry.rotation*Math.PI/180);ctx.drawImage(image,-image.width*ratio/2,-image.height*ratio/2,image.width*ratio,image.height*ratio);image.close?.();
  }
  const bytes=await canvasJpeg(canvas,config.jpeg);canvas.width=canvas.height=1;return {bytes};
}
async function makeThumbnail(entry){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
  if(entry.kind==='pdf'){
    const doc=await getUploadedPdf(entry),page=await doc.getPage(entry.pageIndex+1),native=page.getViewport({scale:1});
    const viewport=page.getViewport({scale:Math.min(120/native.width,170/native.height)});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:ctx,viewport}).promise;
  }else{
    const image=await imageFromBytes(entry.bytes,entry.mime);const scale=Math.min(120/image.width,170/image.height,1);canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close?.();
  }
  const result=canvas.toDataURL('image/jpeg',.65);canvas.width=canvas.height=1;return result;
}
function bytesLabel(n){return n<1024*1024?`${Math.round(n/1024)} KB`:`${(n/1024/1024).toFixed(1)} MB`;}
function renderEntries(){
  $('#page-count').textContent=entries.length;$('#nav-count').textContent=entries.length;
  $('#output-hint').textContent=`${entries.length+1} A4 ${entries.length?'pages':'page'} · Cover included`;
  $('#page-list').innerHTML=entries.length?entries.map((e,i)=>`<div class="page-entry"><img class="page-thumb" src="${e.thumbnail}" alt="Assignment page ${i+2} thumbnail" style="transform:rotate(${e.rotation}deg)"><div class="entry-text"><strong title="${escape(e.name)}">${escape(e.name)}</strong><small>Page ${i+2}${e.kind==='pdf'?` · PDF p. ${e.pageIndex+1}`:' · Image'}${e.rotation?` · ${e.rotation}°`:''}</small></div><div class="entry-actions"><button class="icon-button" data-action="up" data-id="${e.id}" aria-label="Move page ${i+2} up" ${i===0?'disabled':''}>${icon('up')}</button><button class="icon-button" data-action="down" data-id="${e.id}" aria-label="Move page ${i+2} down" ${i===entries.length-1?'disabled':''}>${icon('down')}</button><button class="icon-button" data-action="rotate" data-id="${e.id}" aria-label="Rotate page ${i+2} clockwise">${icon('rotate')}</button><button class="icon-button" data-action="remove" data-id="${e.id}" aria-label="Remove page ${i+2}">${icon('trash')}</button></div></div>`).join(''):'<div class="empty-pages">No extra pages yet. You can download just the cover.</div>';
}
$('#page-list').addEventListener('click',event=>{
  const b=event.target.closest('[data-action]');if(!b)return;
  const i=entries.findIndex(e=>e.id===b.dataset.id);if(i<0)return;
  if(b.dataset.action==='up'&&i>0)[entries[i],entries[i-1]]=[entries[i-1],entries[i]];
  if(b.dataset.action==='down'&&i<entries.length-1)[entries[i],entries[i+1]]=[entries[i+1],entries[i]];
  if(b.dataset.action==='rotate')entries[i].rotation=(entries[i].rotation+90)%360;
  if(b.dataset.action==='remove'){
    const [entry]=entries.splice(i,1);
    if(!entries.some(e=>e.fileId===entry.fileId)){
      const doc=uploadedDocs.get(entry.fileId);if(doc)doc.then(d=>d.destroy()).catch(()=>{});uploadedDocs.delete(entry.fileId);
    }
  }
  renderEntries();scheduleCover(0);
});

async function addFiles(files){
  if(!files.length)return;busy('Adding assignment pages…','Reading your files on this device.');
  const errors=[];let added=0;
  for(const file of files){
    let fileId;
    try{
      if(file.size>40*1024*1024)throw new Error(`${file.name}: larger than 40 MB.`);
      const unique=new Map(entries.map(e=>[e.fileId,e.bytes.byteLength]));
      if([...unique.values()].reduce((a,b)=>a+b,0)+file.size>150*1024*1024)throw new Error('The total file limit is 150 MB. Please use smaller files.');
      const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
      const mime=file.type||(/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':'image/jpeg');
      if(!isPdf&&!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error(`${file.name}: choose JPG, PNG, WebP or PDF.`);
      const bytes=await file.arrayBuffer();fileId=crypto.randomUUID();
      const base={fileId,name:file.name,size:file.size,bytes,rotation:0,kind:isPdf?'pdf':'image',mime};
      const additions=[];
      const count=isPdf?(await getUploadedPdf(base)).numPages:1;
      if(entries.length+count>60)throw new Error('You can add up to 60 assignment pages, plus your cover.');
      for(let p=0;p<count;p++){
        $('#busy-detail').textContent=`${file.name} · Page ${p+1} of ${count}`;
        const entry={...base,id:crypto.randomUUID(),pageIndex:p};entry.thumbnail=await makeThumbnail(entry);additions.push(entry);await nextPaint();
      }
      entries.push(...additions);added+=count;
    }catch(error){
      if(fileId&&!entries.some(e=>e.fileId===fileId)){uploadedDocs.get(fileId)?.then(d=>d.destroy()).catch(()=>{});uploadedDocs.delete(fileId);}
      errors.push(error.name==='PasswordException'?`${file.name}: please upload an unlocked PDF.`:error.message);
    }
  }
  renderEntries();unbusy();$('#file-input').value='';
  if(errors.length)toast((added?`${added} pages added. `:'')+errors.join(' '),true);else toast(`${added} ${added===1?'page':'pages'} added. Arrange them in the order you want.`);
}
$('#file-input').addEventListener('change',e=>addFiles([...e.target.files]));
const drop=$('#upload-zone');
drop.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();$('#file-input').click();}});
for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('drag-over');});
for(const name of ['dragleave','drop'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('drag-over');});
drop.addEventListener('drop',e=>addFiles([...e.dataTransfer.files]));
// Prevent a misplaced drop from navigating away and discarding the assignment.
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());

function updateQualityNote(){$('#quality-note').textContent={original:'PDF text and artwork stay sharp. Images are optimized at high quality.',balanced:'Scanned pages are optimized. Attached PDF pages become images; the cover keeps sharp text.',compact:'Smaller images with reduced detail. Attached PDF pages become images; review small handwriting before submitting.'}[quality];}
$('#quality').addEventListener('change',e=>{quality=e.target.value;updateQualityNote();persist();scheduleCover(0);});
function filename(suffix){const name=(fields.regId||fields.studentName||'WUB').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'WUB';return `${name}-${suffix}`;}
function saveFile(bytes,type,name){const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function latestCover(){clearTimeout(previewTimer);coverVersion++;coverBytes=await createCover({...fields},template);return coverBytes;}
$('#download-cover').addEventListener('click',async()=>{busy('Preparing your cover…');try{saveFile(await latestCover(),'application/pdf',filename('cover.pdf'));toast('Your A4 cover is ready.');}catch(e){toast(e.message,true);}finally{unbusy();}});
$('#download-png').addEventListener('click',async()=>{
  busy('Preparing your PNG…','Rendering a crisp 200 DPI cover image.');let doc;
  try{doc=await getPdf(await latestCover());const page=await doc.getPage(1),view=page.getViewport({scale:200/72}),canvas=document.createElement('canvas');canvas.width=Math.round(view.width);canvas.height=Math.round(view.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('The PNG could not be created.');saveFile(await blob.arrayBuffer(),'image/png',filename('cover.png'));toast('Your PNG cover is ready.');}catch(e){toast(e.message,true);}finally{await doc?.destroy();unbusy();}
});
async function buildAssignment(download){
  busy(download?'Preparing your assignment…':'Preparing full preview…',`${entries.length+1} A4 ${entries.length?'pages':'page'}, cover first.`);
  try{
    const cover=await latestCover();
    const bytes=entries.length?await assembleAssignment(cover,entries,{quality,rasterize,onProgress:(i,n)=>$('#busy-detail').textContent=`Processing assignment page ${i} of ${n}…`}):cover;
    if(download){saveFile(bytes,'application/pdf',filename('assignment.pdf'));const unique=new Map(entries.map(e=>[e.fileId,e.size]));const input=[...unique.values()].reduce((a,b)=>a+b,0)+cover.byteLength;toast(`Assignment ready · ${entries.length+1} pages · ${bytesLabel(bytes.byteLength)}${input>bytes.byteLength?` · ${Math.round((1-bytes.byteLength/input)*100)}% smaller`:''}`);}
    else{await showDocument(bytes);$('.live-badge').innerHTML='<span></span>FULL ASSIGNMENT';$('#preview-message').hidden=true;if(innerWidth<=760)openExpanded();}
  }catch(e){toast(e.name==='PasswordException'?'Please use an unlocked PDF.':e.message,true);}finally{unbusy();}
}
$('#preview-assignment').addEventListener('click',()=>buildAssignment(false));$('#download-assignment').addEventListener('click',()=>buildAssignment(true));

let previewFocus;
function openExpanded(){
  previewFocus=document.activeElement;
  const preview=$('#preview-section');preview.classList.add('expanded');
  document.body.classList.add('preview-open');$('#preview-backdrop').hidden=false;
  preview.setAttribute('role','dialog');preview.setAttribute('aria-modal','true');
  $('#expand-preview').setAttribute('aria-label','Close expanded preview');$('#close-preview').focus();
}
function closeExpanded(){
  if(!$('#preview-section').classList.contains('expanded'))return;
  const preview=$('#preview-section');preview.classList.remove('expanded');
  document.body.classList.remove('preview-open');$('#preview-backdrop').hidden=true;
  preview.removeAttribute('role');preview.removeAttribute('aria-modal');
  $('#expand-preview').setAttribute('aria-label','Expand preview');previewFocus?.focus();
}
$('#expand-preview').addEventListener('click',()=>$('#preview-section').classList.contains('expanded')?closeExpanded():openExpanded());
$('#close-preview').addEventListener('click',closeExpanded);
$('#preview-backdrop').addEventListener('click',closeExpanded);
window.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeExpanded();
  if(e.key==='Tab'&&$('#preview-section').classList.contains('expanded')){
    const controls=[...$('#preview-section').querySelectorAll('button:not([disabled])')].filter(b=>b.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
$('#mobile-preview').addEventListener('click',openExpanded);
$('#mobile-next').addEventListener('click',()=>{if(step<2){chooseStep(step+1);$('.steps').scrollIntoView({behavior:'smooth',block:'start'});}else buildAssignment(true);});
for(const selector of ['#help-button','#mobile-help'])$(selector).addEventListener('click',()=>$('#help-dialog').showModal());
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
$('#help-dialog').addEventListener('click',e=>{if(e.target===$('#help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

const developer=siteConfig.developer;
$('#developer-name').textContent=developer.name;$('#footer-developer').textContent=developer.name;
if(developer.photo){const img=document.createElement('img');img.src=developer.photo;img.alt=developer.name;img.addEventListener('error',()=>$('#developer-avatar').textContent='LH');$('#developer-avatar').replaceChildren(img);}
for(const [label,url]of [['WhatsApp',developer.whatsapp?'https://wa.me/'+developer.whatsapp.replace(/\D/g,''):''],['Facebook',developer.facebook]]){
  if(!url||!/^https:\/\//.test(url))continue;const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('#developer-links').append(a);
}
if(cloudEnabled){
  $('#cloud-controls').hidden=false;
  $('#cloud-save').addEventListener('click',async()=>{busy('Saving your cloud draft…','Saving form details only. Files remain on your device.');try{await saveCloudDraft(draft());toast('Cloud draft saved for this browser.');}catch(e){toast(e.message,true);}finally{unbusy();}});
  $('#cloud-load').addEventListener('click',async()=>{busy('Restoring your cloud draft…');try{const data=await loadCloudDraft();if(!data){toast('There is no cloud draft for this browser yet.');return;}restore(data);syncForm();renderTemplates();persist();scheduleCover(0);toast('Cloud draft restored. Re-add assignment files if needed.');}catch(e){toast(e.message,true);}finally{unbusy();}});
}

syncForm();renderTemplates();renderEntries();chooseStep(0);scheduleCover(0);
