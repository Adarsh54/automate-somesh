import test from 'node:test';import assert from 'node:assert/strict';
import {newSession,applyCommands} from '../src/experimental/session.js';
import {prepareAgentExport} from '../src/experimental/agent-export.js';
import {defaultBounceSettings} from '../src/experimental/bounce-settings.js';
import {planDawEdit} from '../server/daw-agent.js';
const session=applyCommands(newSession(),[{op:'track.add',values:{id:'t',kind:'midi'}},{op:'region.add',target:'t',values:{id:'r',duration:2}}]);
const context={sessionId:session.id,revision:session.revision,regionId:'r',settings:{...defaultBounceSettings}};
const action={mode:'mix',regionId:null,start:null,end:null,settings:null};
const adapter=(calls,inspect=()=>{})=>({key:'test',model:'test',fetchImpl:async(_,options)=>{inspect(JSON.parse(options.body));return {ok:true,json:async()=>({output:calls})};}});
const call=args=>({type:'function_call',name:'export_audio',arguments:JSON.stringify(args)});
test('agent export snapshots settings and selection without mutating the session',()=>{
 const before=structuredClone(session);for(const mode of ['mix','stems','region','range']){const value=prepareAgentExport(session,{...action,mode,...(mode==='range'?{start:.5,end:1}: {})},context);assert.equal(value.plan.zip,mode==='stems');if(mode==='range'){assert.equal(value.plan.position,.5);assert.equal(value.plan.duration,.5);}assert.deepEqual(value.settings,defaultBounceSettings);}
 assert.deepEqual(session,before);const result=prepareAgentExport(session,{...action,settings:{...defaultBounceSettings,bitDepth:24,masterMode:'bypass'}},context);assert.equal(result.settings.bitDepth,24);assert.equal(context.settings.bitDepth,16);
 for(const bad of [{mode:'unknown'},{regionId:'r'},{start:1},{mode:'range',start:2,end:1},{mode:'range',start:0,end:601},{mode:'region',regionId:'missing'},{settings:{...defaultBounceSettings,sampleRate:1}}])assert.throws(()=>prepareAgentExport(session,{...action,...bad},context));
 assert.throws(()=>prepareAgentExport(session,action,{...context,revision:999}),/does not match/);
});
test('agent export requires capability, validated context and exactly one strict tool call',async()=>{
 let sent;const input={session,instruction:'Bounce stems',allowExport:true,exportContext:context};const result=await planDawEdit(input,adapter([call({...action,mode:'stems'})],body=>sent=body));assert.equal(result.action,'export_audio');assert.deepEqual(result.commands,[]);const tool=sent.tools.find(t=>t.name==='export_audio');assert.equal(tool.strict,true);assert.equal(tool.parameters.additionalProperties,false);assert.equal(tool.parameters.required.length,5);assert.deepEqual(JSON.parse(sent.input[1].content).exportContext,context);
 await assert.rejects(planDawEdit({...input,allowExport:false},adapter([call(action)])),/Unexpected/);
 await assert.rejects(planDawEdit({...input,exportContext:undefined},adapter([])),{status:400});
 await assert.rejects(planDawEdit(input,adapter([call(action),call(action)])),/Unexpected/);
 await assert.rejects(planDawEdit(input,adapter([call({...action,mode:'region',regionId:'gone'})])),/Select an audio/);
});
