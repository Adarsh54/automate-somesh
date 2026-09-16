// Each analysis worker owns an instance and reusable scratch memory. No shared
// memory or cross-origin isolation is required. Copy costs are included in benchmarks.
export async function createWasmFFT(bytes) {
  const {instance}=await WebAssembly.instantiate(bytes,{env:{cos:Math.cos,sin:Math.sin}});
  const {memory,fft,__heap_base}=instance.exports;
  const base=Math.ceil(Number(__heap_base.value)/8)*8;
  return (re,im,inverse=false)=>{
    const n=re.length;
    if(n!==im.length || n<2 || (n&(n-1))!==0 || n>4194304)throw new RangeError('Unsupported FFT size');
    const required=base+16*n;
    if(memory.buffer.byteLength<required)memory.grow(Math.ceil((required-memory.buffer.byteLength)/65536));
    const real=new Float64Array(memory.buffer,base,n),imaginary=new Float64Array(memory.buffer,base+8*n,n);
    real.set(re);imaginary.set(im);
    fft(base,base+8*n,n,Number(inverse));
    re.set(real);im.set(imaginary);
  };
}

export async function loadWasmFFT(url,fetcher=fetch) {
  try {
    const response=await fetcher(url);
    if(!response.ok)return undefined;
    return await createWasmFFT(await response.arrayBuffer());
  }catch{return undefined;}
}
