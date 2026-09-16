import test from "node:test";
import assert from "node:assert/strict";
import {equalState,requireOrigin,sealFlow,openFlow,authenticate} from "../server/auth.js";
import {parseProject} from "../server/projects.js";
import projects from "../api/projects.js";
import auth from "../api/auth.js";
const env={WORKOS_API_KEY:"sk_test_placeholder",WORKOS_CLIENT_ID:"client_test",SESSION_SECRET:"x".repeat(40),APP_URL:"https://cuebook.example",DATABASE_URL:"postgresql://unused"};
Object.assign(process.env,env);
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}});
test("OAuth state comparison rejects absent, different and unequal-length values",()=>{
  assert.equal(equalState("abc","abc"),true);
  for(const value of ["","abcd","abd",null,undefined])assert.equal(equalState("abc",value),false);
});
test("OAuth flow is sealed and tampering cannot yield a verifier",async()=>{
  const sealed=await sealFlow({state:"nonce",codeVerifier:"verifier"});
  assert.ok(!sealed.includes("verifier"));
  assert.equal((await openFlow(sealed)).codeVerifier,"verifier");
  assert.equal((await openFlow(sealed.slice(0,80)+(sealed[80]==="a"?"b":"a")+sealed.slice(81))).codeVerifier,undefined);
});
test("writes require the exact configured Origin, never the request Host",()=>{
  requireOrigin({headers:{origin:"https://cuebook.example"}});
  for(const origin of [undefined,"https://attacker.example","https://cuebook.example.attacker.example","null"])
    assert.throws(()=>requireOrigin({headers:{origin,host:"cuebook.example"}}),{status:403});
});
test("unauthenticated project access never queries Neon and me never exposes tokens",async()=>{
  const req={method:"GET",url:"/api/projects",headers:{}},res=response();
  await projects(req,res);assert.equal(res.code,401);assert.deepEqual(res.body,{error:"SIGN_IN_REQUIRED"});
  const me=response();await auth({...req,url:"/api/auth?action=me"},me);
  assert.deepEqual(me.body,{configured:true,user:null});
  assert.equal(await authenticate(req,response()),null);
});
test("project storage accepts unfinished work, strips owner metadata and rejects broken references",()=>{
  const input={id:crypto.randomUUID(),revision:0,userId:"attacker",data:{
    production:{title:"",rate:"24"},tracks:[],cues:[],sharedCueDetails:{category:"unknown",credits:[]},
    mode:"manual",movieOffset:"",silenceGap:.35,thresholdDb:-40,matchThreshold:.45,userId:"attacker",
  }};
  const parsed=parseProject(input);
  assert.equal(parsed.userId,undefined);assert.equal(parsed.data.userId,undefined);
  assert.throws(()=>parseProject({...input,revision:-1}),{status:400});
  assert.throws(()=>parseProject({...input,data:{...input.data,cues:[{id:"a",trackId:"missing"}]}}),{status:400});
  assert.throws(()=>parseProject({...input,data:{...input.data,production:{title:"",rate:"bad"}}}),{status:400});
});
test("expired sessions refresh securely; outages retain cookies, terminal failures clear them",async()=>{
  const req={headers:{cookie:"cuebook-session=sealed"}};
  const client=result=>()=>({userManagement:{loadSealedSession:()=>({
    authenticate:async()=>({authenticated:false}),refresh:async()=>result,
  })}});
  const good=response();
  const result=await authenticate(req,good,client({authenticated:true,user:{id:"alice"},sessionId:"s",sealedSession:"new"}));
  assert.equal(result.user.id,"alice");
  assert.match(good.headers["Set-Cookie"][0],/HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
  const bad=response();assert.equal(await authenticate(req,bad,client({authenticated:false,retryable:false})),null);
  assert.match(bad.headers["Set-Cookie"][0],/Max-Age=0/);
  const outage=response();
  await assert.rejects(authenticate(req,outage,client({authenticated:false,retryable:true})),{status:503});
  assert.equal(outage.headers["Set-Cookie"],undefined);
});
test('login and signup open their respective WorkOS forms with a sealed PKCE flow',async()=>{
  for(const [action,screen] of [['login','sign-in'],['signup','sign-up']]) {
    const res=response();await auth({method:'GET',url:'/api/auth?action='+action,headers:{}},res);
    assert.equal(res.statusCode,303);
    const target=new URL(res.headers.Location);
    assert.equal(target.hostname,'api.workos.com');
    assert.equal(target.searchParams.get('screen_hint'),screen);
    assert.equal(target.searchParams.get('code_challenge_method'),'S256');
    assert.ok(target.searchParams.get('code_challenge'));
    assert.match(res.headers['Set-Cookie'][0],/cuebook-auth-flow=.*HttpOnly/);
  }
});
