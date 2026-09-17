const text=(view,offset,length)=>String.fromCharCode(...new Uint8Array(view.buffer,view.byteOffset+offset,length));
export async function wavInfo(file){
 const header=new DataView(await file.slice(0,12).arrayBuffer());
 if(header.byteLength<12||text(header,0,4)!=='RIFF'||text(header,8,4)!=='WAVE')throw Error('This audio format needs server processing.');
 let fmt;
 for(let offset=12;offset+8<=file.size;){
  const h=new DataView(await file.slice(offset,offset+8).arrayBuffer()),size=h.getUint32(4,true),kind=text(h,0,4),start=offset+8;
  if(start+size>file.size)throw Error('The WAV file is incomplete.');
  if(kind==='fmt '){
   if(size<16)throw Error('Invalid WAV header.');
   const v=new DataView(await file.slice(start,start+Math.min(size,40)).arrayBuffer());
   let format=v.getUint16(0,true);if(format===65534&&size>=40)format=v.getUint16(24,true);
   fmt={format,channels:v.getUint16(2,true),rate:v.getUint32(4,true),align:v.getUint16(12,true),bits:v.getUint16(14,true)};
  }
  if(kind==='data'&&fmt){
   const {format,channels,rate,align,bits}=fmt;
   if(!channels||!rate||align!==channels*bits/8||!((format===1&&[8,16,24,32].includes(bits))||(format===3&&bits===32)))throw Error('This WAV encoding needs server processing.');
   const frames=Math.floor(size/align),duration=frames/rate;
   if(!frames||duration>1200)throw Error('Reel tracks must be up to 20 minutes long.');
   return {...fmt,start,size:frames*align,duration,samples:frames*channels};
  }
  offset=start+size+(size%2);
 }
 throw Error('No supported audio data found in this WAV.');
}
export async function wavPeaks(file,bytes){
 const info=await wavInfo(file),{instance}=await WebAssembly.instantiate(bytes),{memory,waveform}=instance.exports;
 const chunkSamples=262144,bins=360,base=4096,required=base+chunkSamples*4;
 if(memory.buffer.byteLength<required)memory.grow(Math.ceil((required-memory.buffer.byteLength)/65536));
 const scratch=new Float32Array(memory.buffer,base,chunkSamples),peaks=new Float32Array(memory.buffer,0,bins),width=info.bits/8;
 for(let offset=0;offset<info.samples;offset+=chunkSamples){
  const count=Math.min(chunkSamples,info.samples-offset),v=new DataView(await file.slice(info.start+offset*width,info.start+(offset+count)*width).arrayBuffer());
  for(let i=0;i<count;i++){
   const p=i*width;
   if(info.format===3)scratch[i]=v.getFloat32(p,true);
   else if(width===1)scratch[i]=(v.getUint8(p)-128)/128;
   else if(width===2)scratch[i]=v.getInt16(p,true)/32768;
   else if(width===3){let n=v.getUint8(p)|v.getUint8(p+1)<<8|v.getUint8(p+2)<<16;if(n&0x800000)n-=0x1000000;scratch[i]=n/8388608;}
   else scratch[i]=v.getInt32(p,true)/2147483648;
  }
  waveform(base,count,offset,info.samples,0,bins);
 }
 const max=Math.max(.001,...peaks);
 return {duration:info.duration,peaks:Array.from(peaks,p=>p/max)};
}
