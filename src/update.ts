export const updateManifestUrl='https://parcelbox-game.pages.dev/app-version.json';

export type UpdateManifest={
 latestVersion:string;
 minimumVersion:string;
 storeUrl:string;
 message?:string;
};

function versionParts(version:string):number[]{
 return version.trim().replace(/^v/i,'').split(/[.+-]/).slice(0,3).map(part=>{
  const value=Number.parseInt(part,10);
  return Number.isFinite(value)?value:0;
 });
}

export function compareVersions(left:string,right:string):number{
 const a=versionParts(left),b=versionParts(right);
 for(let i=0;i<3;i++){
  const difference=(a[i]??0)-(b[i]??0);
  if(difference)return difference>0?1:-1;
 }
 return 0;
}

export function requiresUpdate(currentVersion:string,minimumVersion:string):boolean{
 return compareVersions(currentVersion,minimumVersion)<0;
}

export function parseUpdateManifest(value:unknown):UpdateManifest|null{
 if(!value||typeof value!=='object')return null;
 const candidate=value as Partial<UpdateManifest>;
 if(typeof candidate.latestVersion!=='string'||typeof candidate.minimumVersion!=='string'||typeof candidate.storeUrl!=='string')return null;
 if(!candidate.latestVersion.trim()||!candidate.minimumVersion.trim()||!/^https?:\/\//i.test(candidate.storeUrl))return null;
 return {
  latestVersion:candidate.latestVersion.trim(),
  minimumVersion:candidate.minimumVersion.trim(),
  storeUrl:candidate.storeUrl,
  message:typeof candidate.message==='string'?candidate.message.trim():undefined,
 };
}

export async function fetchUpdateManifest(
 fetcher:typeof fetch=fetch,
 endpoint=updateManifestUrl,
 timeoutMs=4500,
):Promise<UpdateManifest|null>{
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(`${endpoint}?v=${Date.now()}`,{cache:'no-store',signal:controller.signal});
  if(!response.ok)return null;
  return parseUpdateManifest(await response.json());
 }catch{
  return null;
 }finally{
  clearTimeout(timeout);
 }
}
