// In-place radix-2 FFT. Float64 preserves the existing detector's precision.
// Imported only once per stage; the sample loops stay entirely inside Wasm.
__attribute__((import_module("env"), import_name("cos"))) extern double cosine(double);
__attribute__((import_module("env"), import_name("sin"))) extern double sine(double);
void fft(double *re, double *im, unsigned n, int inverse) {
  for (unsigned i=1,j=0;i<n;i++) {
    unsigned bit=n>>1;
    for (;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j){double t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}
  }
  for(unsigned size=2;size<=n;size*=2) {
    double angle=(inverse?2:-2)*3.14159265358979323846/size;
    double step_r=cosine(angle),step_i=sine(angle);
    unsigned half=size/2;
    for(unsigned base=0;base<n;base+=size) {
      double wr=1,wi=0;
      for(unsigned j=base;j<base+half;j++) {
        unsigned k=j+half;
        double tr=wr*re[k]-wi*im[k],ti=wr*im[k]+wi*re[k];
        re[k]=re[j]-tr;im[k]=im[j]-ti;re[j]+=tr;im[j]+=ti;
        double next=wr*step_r-wi*step_i;
        wi=wr*step_i+wi*step_r;wr=next;
      }
    }
  }
  if(inverse)for(unsigned i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
