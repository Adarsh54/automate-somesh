import test from 'node:test';import assert from 'node:assert/strict';
import {planDawEdit} from '../server/daw-agent.js';import {newSession} from '../src/experimental/session.js';
import {transportActionSchema,transportWait,transportSummary} from '../src/experimental/agent-transport.js';
const session=newSession(),transport={sessionId:session.id,revision:session.revision,epoch:4,position:12,playing:false};
const output=(args,name='control_transport')=>({type:'function_call',name,arguments:JSON.stringify(args)});
const adapter=(calls,inspect=()=>{})=>({key:'test',model:'test',fetchImpl:async(url,options)=>{inspect(JSON.parse(options.body));return {ok:true,json:async()=>({output:calls})};}});
test('transport is opt-in, strictly described, bound to the session and separate from edit plans',async()=>{
 let sent;const result=await planDawEdit({session,instruction:'Play from 20 seconds',transport,allowTransport:true},adapter([output({operation:'play',position:20})],body=>sent=body));assert.equal(result.action,'transport');assert.equal(result.transportEpoch,4);assert.equal(result.revision,session.revision);assert.deepEqual(result.commands,[]);assert.deepEqual(result.transport,{operation:'play',position:20});
 const tool=sent.tools.find(t=>t.name==='control_transport');assert.equal(tool.strict,true);assert.equal(tool.parameters.additionalProperties,false);assert.deepEqual(tool.parameters.required,['operation','position']);assert.equal(sent.parallel_tool_calls,false);assert.deepEqual(JSON.parse(sent.input[1].content).transport,transport);
 await assert.rejects(planDawEdit({session,instruction:'play'},adapter([output({operation:'play',position:null})])),/Unexpected/);
 for(const bad of [undefined,{...transport,sessionId:'different'},{...transport,revision:1}])await assert.rejects(planDawEdit({session,instruction:'play',transport:bad,allowTransport:true},adapter([])),{status:400});
 await assert.rejects(planDawEdit({session,instruction:'play',transport,allowTransport:true},adapter([output({operation:'play',position:null}),output({summary:'edit',commands:[{op:'session.set',values:{title:'bad'}}]},'edit_session')])),/Unexpected/);
});
test('invalid and ambiguous transport arguments reject without document edits',async()=>{
 for(const args of [{operation:'record',position:null},{operation:'seek',position:null},{operation:'seek',position:-1},{operation:'play',position:86401},{operation:'pause',position:1},{operation:'stop',position:0},{operation:'play'},{operation:'play',position:null,commands:[]}]){
  assert.throws(()=>transportActionSchema.parse(args));await assert.rejects(planDawEdit({session,instruction:'transport',transport,allowTransport:true},adapter([output(args)])));
 }
 for(const operation of ['play','pause','stop'])assert.deepEqual(transportActionSchema.parse({operation,position:null}),{operation,position:null});
 assert.equal(transportSummary('seek',{playing:false,position:20}),'Playhead at 20.00 s. Playback paused.');assert.equal(transportSummary('play',{playing:true,position:20}),'Playing from 20.00 s.');
});
test('cancellation prevents a late transport setup result from resuming its caller',async()=>{
 const controller=new AbortController();let resolve;const pending=new Promise(r=>resolve=r),waiting=transportWait(pending,controller.signal);controller.abort(new Error('Canceled'));await assert.rejects(waiting,/Canceled/);resolve('too late');await Promise.resolve();
 assert.equal(await transportWait(Promise.resolve('ready'),new AbortController().signal),'ready');await assert.rejects(transportWait(Promise.reject(Error('decode failed')),new AbortController().signal),/decode failed/);
 const aborted=new AbortController();aborted.abort(Error('already canceled'));await assert.rejects(transportWait(Promise.reject(Error('late decode error')),aborted.signal),/already canceled/);
});
