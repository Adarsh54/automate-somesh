import test from "node:test";
import assert from "node:assert/strict";
import validate from "../api/validate.js";
import health from "../api/health.js";
import {MAX_BODY_BYTES} from "../server/http.js";
import {reviewProject} from "../src/domain/review.js";
import {validateProject} from "../server/services/validate-project.js";
const sample = () => ({
  mode:"manual",
  production:{title:"Film", rate:"24", company:"", preparedBy:"", email:"", duration:"", startTimecode:""},
  sharedCueDetails:{credits:[
    {role:"Composer", last:"Writer", pro:"BMI", share:100},
    {role:"Publisher", name:"Publisher", pro:"BMI", share:100},
  ]},
  tracks:[{id:"t", title:"Cue", offset:"01:00:00:00"}],
  cues:[{trackId:"t", title:"Cue", start:"01:00:02:00", end:"01:00:06:00", method:"manual", usage:"BI"}],
});
async function call(handler, {method="POST", body, headers={"content-type":"application/json"}}={}) {
  const res={headers:{}, setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(value){this.body=value;return this;}};
  await handler({method,body,headers},res);return res;
}
test("API validates shared credits, individual overrides and reviewed timings with identical domain rules",async()=>{
  const state=sample();
  let response=await call(validate,{body:state});
  assert.equal(response.code,200);assert.equal(response.body.valid,true);
  assert.deepEqual(response.body,reviewProject(state));
  state.cues[0].credits=[];state.cues[0].method="movie";
  response=await call(validate,{body:state});
  assert.equal(response.body.valid,false);
  assert.ok(response.body.issues.some(i=>i.includes("Review detected")));
  assert.ok(response.body.issues.some(i=>i.includes("composer")));
  assert.deepEqual(response.body,reviewProject(state));
});
test("API rejects malformed requests, invalid nested types, unsupported rates and oversized bodies",async()=>{
  for(const body of [null,[],{}, {...sample(),production:{rate:"__proto__"}}, {...sample(), cues:[{trackId:4}]}])
    assert.equal((await call(validate,{body})).code,400);
  assert.equal((await call(validate,{body:"{"})).code,400);
  assert.equal((await call(validate,{body:" ".repeat(MAX_BODY_BYTES+1)})).code,413);
  assert.equal((await call(validate,{body:sample(),headers:{"content-type":"text/plain"}})).code,415);
  const denied=await call(validate,{method:"GET"});
  assert.equal(denied.code,405);assert.equal(denied.headers.Allow,"POST");
});
test("stateless API does not retain a previous project and responses cannot be cached",async()=>{
  assert.equal((await call(validate,{body:sample()})).body.valid,true);
  const response=await call(validate,{body:{...sample(),cues:[]}});
  assert.equal(response.body.valid,false);assert.equal(response.headers["Cache-Control"],"no-store");
  const up=await call(health,{method:"GET"});assert.equal(up.body.status,"ok");
  assert.equal((await call(health)).code,405);
});
test("movie offsets and trimmed duration use the same domain validation; duplicate tracks rejected",()=>{
  const state=sample();state.mode="movie";state.movieMetadata={title:"Movie",duration:10};state.movieOffset="01:00:00:00";state.movieOverrides={trimStart:9,trimEnd:2};
  assert.deepEqual(validateProject(state).body,reviewProject(state));
  assert.equal(validateProject({...sample(),tracks:[sample().tracks[0],sample().tracks[0]]}).status,400);
  const cue=sample();cue.cues[0].usage="constructor";
  assert.equal(validateProject(cue).body.valid,false);
});
