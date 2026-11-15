import { emptyFields, templates } from './pdf-engine.js';

export const storageKey='wub-cover-studio-v1';
export const allowedQuality=['original','balanced','compact'];

// Accept drafts from the original release. The optional row is off when an old
// draft does not contain a switch value; the string "false" never enables it.
export function normalizeDraft(data, current={fields:emptyFields,template:0,quality:'original'}) {
  const result={fields:{...emptyFields,...current.fields},template:current.template,quality:current.quality};
  if(!data||typeof data!=='object')return result;
  result.fields={...emptyFields};
  for(const [key,defaultValue] of Object.entries(emptyFields)) {
    const value=data.fields?.[key];
    if(typeof defaultValue==='boolean') {
      if(typeof value==='boolean')result.fields[key]=value;
    } else if(typeof value==='string')result.fields[key]=value.slice(0,180);
  }
  if(Number.isInteger(data.template)&&data.template>=0&&data.template<templates.length)result.template=data.template;
  if(allowedQuality.includes(data.quality))result.quality=data.quality;
  return result;
}
