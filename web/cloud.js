import { siteConfig } from './config.js';
const config=siteConfig.firebase;
let session;
const key='wub-cloud-auth-'+String(config.apiKey).slice(-12);
export const cloudEnabled=Boolean(config.enabled&&config.apiKey&&config.databaseURL);
async function jsonRequest(url,options={}) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok) throw new Error(data?.error?.message||data?.error||'Cloud request failed. Check your Firebase configuration and rules.');
  return data;
}
async function authenticate() {
  if(!cloudEnabled) throw new Error('Cloud drafts are not configured. Your local draft still works.');
  if(session&&session.expires>Date.now()+60000) return session;
  let saved;
  try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  if(saved?.refreshToken){
    const data=await jsonRequest('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(config.apiKey),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}),
    });
    session={token:data.id_token,uid:data.user_id,refreshToken:data.refresh_token,expires:Date.now()+Number(data.expires_in)*1000};
  }else{
    const data=await jsonRequest('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+encodeURIComponent(config.apiKey),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true}),
    });
    session={token:data.idToken,uid:data.localId,refreshToken:data.refreshToken,expires:Date.now()+Number(data.expiresIn)*1000};
  }
  try{localStorage.setItem(key,JSON.stringify({refreshToken:session.refreshToken}));}catch{}
  return session;
}
async function draftURL(){
  const auth=await authenticate();
  const base=config.databaseURL.replace(/\/$/,'');
  if(!/^https:\/\/[a-zA-Z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/.test(base))throw new Error('Use the exact HTTPS URL shown in your Firebase Realtime Database console.');
  return `${base}/coverDrafts/${encodeURIComponent(auth.uid)}.json?auth=${encodeURIComponent(auth.token)}`;
}
export async function saveCloudDraft(draft){
  await jsonRequest(await draftURL(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,updatedAt:{'.sv':'timestamp'}})});
}
export async function loadCloudDraft(){return jsonRequest(await draftURL());}
