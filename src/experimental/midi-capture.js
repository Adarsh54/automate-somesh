import {eventFromBytes} from './midi-events.js';
export function createMidiCapture(startedAt,{maxSeconds=600,maxItems=20000}={}){
 const notes=[],events=[],held=new Map();let noteCount=0,closed=false;
 const seconds=time=>Math.max(0,Math.min(maxSeconds,(time-startedAt)/1000));
 function endNote(note,end){notes.push({...note,duration:Math.max(.001,end-note.start)});}
 return {
  push(data,time){
   if(closed||!Number.isFinite(time))return false;
   if(time<startedAt)return true;
   if(time-startedAt>=maxSeconds*1000)return false;
   const status=data?.[0],type=status>>4,channel=status&15,length=type===12||type===13?2:3;
   if(status<128||status>=240||data?.length!==length||[...data].slice(1).some(n=>!Number.isInteger(n)||n<0||n>127))return true;
   const a=data[1],b=data[2]||0,start=seconds(time),key=channel+':'+a;
   if(type===9&&b){
    if(noteCount>=maxItems)return false;noteCount++;
    const queue=held.get(key)||[];queue.push({id:crypto.randomUUID(),pitch:a,channel,start,velocity:b/127});held.set(key,queue);
   }else if(type===8||(type===9&&!b)){
    const queue=held.get(key),note=queue?.shift();if(note)endNote(note,start);if(!queue?.length)held.delete(key);
   }else {
    const event=eventFromBytes(type,channel,a,b,start);if(event){if(events.length>=maxItems)return false;events.push(event);}
   }
   return true;
  },
  finish(time){
   if(!closed){closed=true;const end=seconds(time);for(const queue of held.values())for(const note of queue)endNote(note,Math.max(end,note.start));held.clear();}
   return {notes:[...notes].sort((a,b)=>a.start-b.start),events:[...events].sort((a,b)=>a.start-b.start)};
  },
  get count(){return noteCount+events.length;},
 };
}
