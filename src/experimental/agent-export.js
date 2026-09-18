import {z} from 'zod';
import {createBouncePlan} from './bounce-plan.js';
export const exportSettingsSchema=z.object({sampleRate:z.union([z.literal(44100),z.literal(48000),z.literal(96000)]),bitDepth:z.union([z.literal(16),z.literal(24),z.literal(32)]),dither:z.enum(['none','tpdf']),stemMode:z.enum(['tracks','groups']),masterMode:z.enum(['full','noInserts','bypass'])}).strict();
export const exportContextSchema=z.object({sessionId:z.string(),revision:z.number().int().nonnegative(),regionId:z.string().nullable(),settings:exportSettingsSchema}).strict();
export const exportActionSchema=z.object({mode:z.enum(['mix','stems','region','range']),regionId:z.string().nullable(),start:z.number().finite().min(0).max(86400).nullable(),end:z.number().finite().min(0).max(86400).nullable(),settings:exportSettingsSchema.nullable()}).strict();
export function validateExportContext(value,session){
 const context=exportContextSchema.parse(value);
 if(context.sessionId!==session.id||context.revision!==session.revision)throw Error('Export context does not match the session.');
 if(context.regionId!==null&&!session.tracks.some(t=>t.regions.some(r=>r.id===context.regionId)))throw Error('Selected export region no longer exists.');
 return context;
}
export function prepareAgentExport(session,value,context){
 context=validateExportContext(context,session);const action=exportActionSchema.parse(value),settings=action.settings||context.settings;
 if(action.mode!=='region'&&action.regionId!==null)throw Error('Region ID is only supported for region exports.');
 if(action.mode!=='range'&&(action.start!==null||action.end!==null))throw Error('Start and end are only supported for range exports.');
 if((action.start===null)!==(action.end===null))throw Error('Supply both range boundaries.');
 const snapshot=structuredClone(session);
 if(action.mode==='range'&&action.start!==null){snapshot.loopStart=action.start;snapshot.loopEnd=action.end;}
 return {plan:createBouncePlan(snapshot,{...settings,mode:action.mode,regionId:action.regionId??context.regionId}),settings:{...settings}};
}
