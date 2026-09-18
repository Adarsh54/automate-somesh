// Integer WAV clips at full scale; float WAV preserves over-range samples for mixing.
export function encodeWav(buffer,{bitDepth=16,dither='none',random=Math.random}={}) {
 if(![16,24,32].includes(bitDepth))throw Error('Choose 16-bit, 24-bit or 32-bit float WAV.');
 if(!['none','tpdf'].includes(dither))throw Error('Choose no dither or triangular dither.');
 const useDither=dither==='tpdf'&&bitDepth!==32;
 const channels=buffer.numberOfChannels,frames=buffer.length,bytes=bitDepth/8;
 const dataSize=frames*channels*bytes,padding=dataSize%2,headerSize=bitDepth===32?56:44;
 if(!Number.isSafeInteger(dataSize)||dataSize+headerSize-8+padding>0xffffffff)throw Error('Audio exceeds the WAV file size limit.');
 const array=new ArrayBuffer(headerSize+dataSize+padding),view=new DataView(array);
 const text=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,array.byteLength-8,true);text(8,'WAVEfmt ');
 view.setUint32(16,16,true);view.setUint16(20,bitDepth===32?3:1,true);
 view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);
 view.setUint32(28,buffer.sampleRate*channels*bytes,true);view.setUint16(32,channels*bytes,true);
 view.setUint16(34,bitDepth,true);
 if(bitDepth===32){text(36,'fact');view.setUint32(40,4,true);view.setUint32(44,frames,true);}
 text(headerSize-8,'data');view.setUint32(headerSize-4,dataSize,true);
 const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++) {
  const offset=headerSize+(i*channels+c)*bytes,raw=data[c][i],sample=Number.isFinite(raw)?raw:0;
  if(bitDepth===32){view.setFloat32(offset,sample,true);continue;}
  const n=Math.max(-1,Math.min(1,sample)),scale=2**(bitDepth-1),noise=useDither?random()-random():0;
  // Uniform signed PCM steps; clamp after dither so full scale cannot wrap.
  const value=Math.max(-scale,Math.min(scale-1,Math.round(n*scale+noise)));
  if(bitDepth===16)view.setInt16(offset,value,true);
  else {view.setUint8(offset,value&255);view.setUint8(offset+1,(value>>8)&255);view.setUint8(offset+2,(value>>16)&255);}
 }
 return new Blob([array],{type:'audio/wav'});
}
