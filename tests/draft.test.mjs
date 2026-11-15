import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDraft } from '../web/draft.js';
import { emptyFields, sampleFields } from '../web/pdf-engine.js';

test('new assignment number and switch survive a draft JSON round trip',()=>{
  for(const enabled of [true,false]){
    const saved={schemaVersion:1,fields:{...sampleFields,showAssignmentNo:enabled,assignmentNo:'CE-07'},template:8,quality:'compact'};
    const restored=normalizeDraft(JSON.parse(JSON.stringify(saved)));
    assert.equal(restored.fields.assignmentNo,'CE-07');
    assert.equal(restored.fields.showAssignmentNo,enabled);
    assert.equal(restored.template,8);
    assert.equal(restored.quality,'compact');
  }
});
test('original drafts still restore with the optional assignment row disabled',()=>{
  const oldFields={...sampleFields};delete oldFields.assignmentNo;delete oldFields.showAssignmentNo;
  const restored=normalizeDraft({fields:oldFields,template:3,quality:'balanced'},{fields:sampleFields,template:0,quality:'original'});
  assert.equal(restored.fields.studentName,sampleFields.studentName);
  assert.equal(restored.fields.showAssignmentNo,false);
  assert.equal(restored.fields.assignmentNo,'');
  assert.equal(restored.template,3);
});
test('untrusted draft values cannot activate the optional row or add unknown fields',()=>{
  const data=normalizeDraft({fields:{showAssignmentNo:'false',assignmentNo:42,studentName:'A'.repeat(700),unknown:'ignored'},template:99,quality:'invalid'});
  assert.equal(data.fields.showAssignmentNo,false);
  assert.equal(data.fields.assignmentNo,'');
  assert.equal(data.fields.studentName.length,180);
  assert.equal('unknown' in data.fields,false);
  assert.equal(data.template,0);assert.equal(data.quality,'original');
  assert.deepEqual(normalizeDraft(null).fields,emptyFields);
});
