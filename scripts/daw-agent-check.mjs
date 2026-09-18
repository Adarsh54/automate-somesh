import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {planDawEdit} from '../server/daw-agent.js';
import {SessionHistory,newSession} from '../src/experimental/session.js';
import {conversationTurn} from '../src/experimental/agent-conversation.js';

export async function checkDawAgent({env=process.env,configOnly=false,plan=planDawEdit}={}){
 const missing=['OPENAI_API_KEY','DAW_AGENT_MODEL'].filter(name=>!env[name]?.trim());
 if(missing.length)return {ok:false,stage:'configuration',message:`Missing ${missing.join(' and ')}. Set these server-only variables in .env.local, then restart the API. Never use a VITE_ prefix or commit credentials.`};
 if(configOnly)return {ok:true,stage:'configuration',message:'Required variables are present. This does not verify credentials, model access, inference, or application login.'};
 const history=new SessionHistory(newSession());history.execute([{op:'track.add',values:{id:'check-strings',name:'Smoke-test strings',kind:'midi'}},{op:'track.add',values:{id:'check-guide',name:'Smoke-test guide',kind:'audio'}}]);
 const conversation=[];let stage='initial edit';
 try{
  for(const [instruction,gain]of [['Set only the Smoke-test strings track volume to -6 dB. Leave everything else unchanged. This is a fader setting, not a measured sample-peak target. No audio analysis or verification is needed.',-6],['Make that reduction half as large. Leave everything else unchanged. No audio analysis or verification is needed.',-3]]){
   stage=conversation.length?'follow-up edit':'initial edit';const before=structuredClone(history.session);
   const result=await plan({instruction,session:before,conversation,allowAnalysis:false},{key:env.OPENAI_API_KEY,model:env.DAW_AGENT_MODEL});
   if(result.action||result.revision!==before.revision||!result.commands?.length)return {ok:false,stage,message:'The model did not return an applicable edit plan for the test instruction.'};
   history.execute(result.commands,before.revision);const expected=structuredClone(before);expected.tracks[0].gainDb=gain;expected.revision++;
   if(!isDeepStrictEqual(history.session,expected))return {ok:false,stage,message:'The validated plan did not produce the requested track level while preserving the rest of the test session.'};
   conversation.push(conversationTurn({before,after:history.session,instruction,summary:result.summary||'',outcome:'applied'}));
  }
  return {ok:true,stage:'complete',message:'Two live planning requests passed: set one track to -6 dB, then interpret the follow-up as -3 dB. Both plans passed shared validation and preserved the other test data. No project or media was saved.'};
 }catch{
  // Never print provider payloads, keys, error messages or stacks from this check.
  return {ok:false,stage,message:'The planning request or shared command validation failed. Check the API key, model access, network, and provider account. No project or media was saved.'};
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);if(args.some(arg=>arg!=='--config-only')){console.error('Usage: npm run check:daw-agent -- [--config-only]');process.exitCode=2;}
 else{const configOnly=args.includes('--config-only');if(!configOnly)console.log('Checking the configured model using up to two billable requests on a disposable in-memory session.');const result=await checkDawAgent({configOnly});console.log(`${result.ok?'PASS':'FAIL'} [${result.stage}] ${result.message}`);process.exitCode=result.ok?0:1;}
}
