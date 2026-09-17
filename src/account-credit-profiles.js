export async function creditProfilesRequest(method='GET',body,{importOnly=false}={}) {
 const response=await fetch('/api/auth?action=credit-profiles'+(importOnly?'&import=true':''),{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(response.status===401?'Sign in to manage your credit profiles.':response.status===409?'This profile changed on another device. Reload Credit profiles before editing again.':'Could not save or load account credit profiles. Please retry.');
 return response.json();
}
