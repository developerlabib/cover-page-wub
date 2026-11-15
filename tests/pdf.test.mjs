import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, degrees } from '../web/vendor/pdf-lib.js';
import { createCover as renderCover, assembleAssignment, A4, emptyFields, sampleFields, formatDate } from '../web/pdf-engine.js';
const source=await readFile(new URL('../web/assets/templates.pdf',import.meta.url));
const label=await readFile(new URL('../web/assets/assignment-no.pdf',import.meta.url));
const createCover=(fields,template,sourceBytes)=>renderCover(fields,template,sourceBytes,label);

test('all nine original templates produce one A4 cover with entered values',async()=>{
  for(let i=0;i<9;i++){
    const bytes=await createCover(sampleFields,i,source);
    const doc=await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(),1);
    assert.ok(Math.abs(doc.getPage(0).getWidth()-A4[0])<.1);
    assert.ok(Math.abs(doc.getPage(0).getHeight()-A4[1])<.1);
    assert.equal(doc.getTitle(),'Sustainable Building Materials - Assignment');
    assert.equal(doc.getAuthor(),undefined);
    assert.ok(bytes.byteLength>10000);
  }
});
test('blank cover downloads correctly, and unknown template indices are rejected',async()=>{
  assert.equal((await PDFDocument.load(await createCover(emptyFields,8,source))).getPageCount(),1);
  for(const bad of [-1,9,1.5])await assert.rejects(createCover(emptyFields,bad,source),/valid template/);
});
test('long fields wrap safely, while impossible fields and unsupported text give actionable errors',async()=>{
  await createCover({...sampleFields,topic:'An introduction to sustainable engineering materials and their role in modern construction practices'},0,source);
  await assert.rejects(createCover({...sampleFields,studentName:'W'.repeat(1000)},0,source),/too long/);
  await assert.rejects(createCover({...sampleFields,studentName:'বাংলা'},0,source),/English letters/);
});
test('date formatting is stable and uses an English month',()=>{
  assert.equal(formatDate('2026-11-15'),'15 November 2026');
  assert.equal(formatDate(''),'');
});
test('PDF assembly accepts chosen page order and rotations and emits portrait A4 throughout',async()=>{
  const input=await PDFDocument.create();const font=await input.embedFont(StandardFonts.Helvetica);
  input.addPage([400,300]).drawText('FIRST',{x:30,y:100,font});
  const second=input.addPage([500,700]);second.drawText('SECOND',{x:30,y:100,font});second.setRotation(degrees(90));
  const bytes=await input.save();const cover=await createCover(sampleFields,0,source);
  const entries=[1,0].map((pageIndex,i)=>({kind:'pdf',fileId:'test',bytes,pageIndex,rotation:i?90:0}));
  const progress=[];
  const output=await assembleAssignment(cover,entries,{onProgress:(i,n)=>progress.push([i,n])});
  const doc=await PDFDocument.load(output);
  assert.equal(doc.getPageCount(),3);assert.deepEqual(progress,[[1,2],[2,2]]);
  for(const p of doc.getPages().slice(1)){assert.deepEqual(p.getSize(),{width:A4[0],height:A4[1]});assert.equal(p.getRotation().angle,0);}
});
test('balanced mode compresses through the renderer and preserves all pages',async()=>{
  const cover=await createCover(sampleFields,8,source);const jpg=await readFile(new URL('../web/assets/templates/1.jpg',import.meta.url));
  let calls=0;
  const entries=[{kind:'image',rotation:90},{kind:'pdf',rotation:0}];
  const output=await assembleAssignment(cover,entries,{quality:'balanced',rasterize:async(entry,quality)=>{calls++;assert.equal(quality,'balanced');return{bytes:jpg};}});
  assert.equal(calls,2);assert.equal((await PDFDocument.load(output)).getPageCount(),3);
});
test('optional assignment row works on all designs; off ignores hidden unsupported text',async()=>{
  for(let i=0;i<9;i++){
    const bytes=await createCover({...sampleFields,assignmentNo:'CE-01',showAssignmentNo:true},i,source);
    const doc=await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(),1);
    assert.ok(Math.abs(doc.getPage(0).getWidth()-A4[0])<.1);
  }
  await createCover({...sampleFields,assignmentNo:'বাংলা',showAssignmentNo:false},0,source);
  await assert.rejects(createCover({...sampleFields,assignmentNo:'বাংলা',showAssignmentNo:true},0,source),/English letters/);
  await assert.rejects(createCover({...sampleFields,assignmentNo:'W'.repeat(1000),showAssignmentNo:true},0,source),/too long/);
});
