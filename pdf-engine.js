import { PDFDocument, StandardFonts, rgb, degrees } from './vendor/pdf-lib.js';

export const A4 = [595.2756, 841.8898];
export const templates = [
  {name:'Blue Horizon', mood:'Light & flowing', tag:'Popular'},
  {name:'Royal Curve', mood:'Bold & polished'},
  {name:'Ocean Waves', mood:'Clean & dynamic'},
  {name:'Lavender Mist', mood:'Soft & expressive'},
  {name:'Azure Frame', mood:'Sharp & structured'},
  {name:'Modern Geometry', mood:'Bright & confident'},
  {name:'Emerald Flow', mood:'Fresh & distinctive'},
  {name:'Civil Skyline', mood:'Made for engineers'},
  {name:'Classic White', mood:'Simple & timeless'},
];
export const emptyFields = {
  degree:'B.Sc. in Civil Engineering', assignmentNo:'', showAssignmentNo:false,
  topic:'', courseTitle:'', courseCode:'', submissionDate:'',
  studentName:'', regId:'', program:'', batch:'', rollNo:'', teacherName:'', designation:'', department:'',
};
export const sampleFields = {
  degree:'B.Sc. in Civil Engineering', assignmentNo:'01', showAssignmentNo:true,
  topic:'Sustainable Building Materials', courseTitle:'Building Materials',
  courseCode:'CE 1203', submissionDate:'2026-11-15', studentName:'Alex Rahman', regId:'WUB-2026-001',
  program:'B.Sc. in Civil Engineering', batch:'65', rollNo:'12', teacherName:'Dr. Samira Ahmed',
  designation:'Assistant Professor', department:'Civil Engineering',
};
let sourcePromise, labelPromise;
export function loadTemplates() {
  sourcePromise ??= fetch(new URL('./assets/templates.pdf',import.meta.url)).then(r=>{
    if(!r.ok) throw new Error('The original templates could not be loaded. Please reload the page.');
    return r.arrayBuffer();
  }).catch(error=>{sourcePromise=undefined;throw error;});
  return sourcePromise;
}
function loadAssignmentLabel() {
  labelPromise ??= fetch(new URL('./assets/assignment-no.pdf',import.meta.url)).then(r=>{
    if(!r.ok) throw new Error('The assignment number label could not be loaded. Please reload the page.');
    return r.arrayBuffer();
  }).catch(error=>{labelPromise=undefined;throw error;});
  return labelPromise;
}
export function formatDate(value) {
  if(!value) return '';
  const d = new Date(value+'T12:00:00');
  return Number.isNaN(d.valueOf()) ? value : d.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
}
// The template's existing lines and text remain vector artwork. Only values are added.
// Coordinates were measured from the supplied nine-page DOCX, rendered to A4.
export async function createCover(fields, template=0, sourceBytes, assignmentLabelBytes) {
  if(!Number.isInteger(template)||template<0||template>=templates.length) throw new Error('Choose a valid template.');
  const src = await PDFDocument.load(sourceBytes || await loadTemplates());
  const doc = await PDFDocument.create();
  const [page] = await doc.copyPages(src,[template]); doc.addPage(page);
  const serif=await doc.embedFont(StandardFonts.TimesRoman);
  const sans=await doc.embedFont(StandardFonts.Helvetica);
  const h=page.getHeight();
  if(fields.showAssignmentNo===true) {
    // Transparent overlay uses the same embedded Liberation Serif, 18 pt, as
    // the original labels. No part of the original artwork is erased or moved.
    const [label]=await doc.embedPdf(assignmentLabelBytes || await loadAssignmentLabel(),[0]);
    page.drawPage(label,{x:0,y:0,width:page.getWidth(),height:h});
  }
  function fitText(value,{x,baseline,width,size=16,height=19,center=false,font=serif,color=rgb(.08,.10,.14)}) {
    const text = String(value||'').replace(/[\r\n\t]+/g,' ').trim();
    if(!text) return;
    // Explicitly reject unsupported characters instead of silently dropping a student's data.
    try {font.encodeText(text);} catch {throw new Error('Please use English letters, numbers and standard punctuation in the cover fields.');}
    while(font.widthOfTextAtSize(text,size)>width && size>9) size-=.25;
    if(font.widthOfTextAtSize(text,size)<=width) {
      page.drawText(text,{x:center?x+(width-font.widthOfTextAtSize(text,size))/2:x,y:h-baseline,font,size,color}); return;
    }
    // Long text wraps into two lines inside the original field, never over its border.
    size=8.5; const words=text.split(' ');const lines=[''];
    for(const word of words){let i=lines.length-1;const candidate=lines[i]?lines[i]+' '+word:word;
      if(font.widthOfTextAtSize(candidate,size)<=width) lines[i]=candidate;
      else if(!lines[i]) throw new Error('A word is too long to fit. Please shorten this field.');
      else lines.push(word);
    }
    if(lines.length>2||height<18) throw new Error('A field is too long to fit. Please shorten your topic or details.');
    lines.forEach((line,i)=>page.drawText(line,{x,y:h-baseline+6-i*9,font,size,color}));
  }
  fitText(fields.degree,{x:72,baseline:296.85,width:451,size:22,font:sans,center:true,color:rgb(.93,0,0)});
  if(fields.showAssignmentNo===true) fitText(fields.assignmentNo,{x:229,baseline:364.30,width:286,size:16,height:19});
  const specs=[
    ['topic',229,386.65,286,16],['courseTitle',229,409,286,16],['courseCode',229,431.35,286,16],
    ['submissionDate',229,453.70,286,16],
    ['studentName',181,526.20,335,16],['regId',181,549.05,335,16],['program',181,571.90,335,16],
    ['batch',181,594.75,335,16],['rollNo',181,617.60,335,16],
    ['teacherName',181,692.50,333,16],['designation',181,716.65,333,16],['department',181,740.80,333,16],
  ];
  for(const [key,x,baseline,width,size] of specs) fitText(key==='submissionDate'?formatDate(fields[key]):fields[key],{x,baseline,width,size});
  doc.setTitle(fields.topic?`${fields.topic} - Assignment`:'Assignment Cover Page');
  doc.setSubject('World University of Bangladesh');
  // Developer credits are intentionally limited to the website, never the document.
  doc.setProducer('');doc.setCreator('');
  return doc.save({useObjectStreams:true});
}

export function drawFitted(page, drawable, width, height, rotation=0, margin=20, image=false) {
  const angle=((rotation%360)+360)%360,rad=angle*Math.PI/180;
  const c=Math.round(Math.cos(rad)),s=Math.round(Math.sin(rad));
  const rw=Math.abs(width*c)+Math.abs(height*s),rh=Math.abs(width*s)+Math.abs(height*c);
  const scale=Math.min((A4[0]-2*margin)/rw,(A4[1]-2*margin)/rh);
  const w=width*scale,h=height*scale;
  const minX=Math.min(0,w*c,-h*s,w*c-h*s), minY=Math.min(0,w*s,h*c,w*s+h*c);
  const x=(A4[0]-rw*scale)/2-minX,y=(A4[1]-rh*scale)/2-minY;
  const options={x,y,width:w,height:h,rotate:degrees(angle)};
  if(image)page.drawImage(drawable,options);else page.drawPage(drawable,options);
}

// `rasterize` is supplied by the browser: rendering/compression uses a bounded canvas.
export async function assembleAssignment(coverBytes, entries, {quality='original', rasterize, onProgress=()=>{}}={}) {
  const doc=await PDFDocument.load(coverBytes);
  const originals=new Map();
  for(let i=0;i<entries.length;i++) {
    const entry=entries[i];onProgress(i+1,entries.length);
    const page=doc.addPage(A4);
    if(entry.kind==='pdf'&&quality==='original') {
      let source=originals.get(entry.fileId);
      if(!source){source=await PDFDocument.load(entry.bytes);if(source.isEncrypted)throw new Error('Password-protected PDFs are not supported. Please upload an unlocked copy.');originals.set(entry.fileId,source);}
      const p=source.getPage(entry.pageIndex);
      const [embedded]=await doc.embedPages([p]);
      drawFitted(page,embedded,embedded.width,embedded.height,-p.getRotation().angle-entry.rotation,0);
    } else {
      if(!rasterize) throw new Error('The image renderer is unavailable.');
      const result=await rasterize(entry,quality);
      const im=await doc.embedJpg(result.bytes);
      // The rasterizer includes the image/PDF rotation.
      drawFitted(page,im,im.width,im.height,0,entry.kind==='image'?16:0,true);
    }
  }
  return doc.save({useObjectStreams:true});
}
