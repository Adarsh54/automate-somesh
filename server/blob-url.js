// The Blob SDK signs the literal object pathname but constructs an unescaped URL.
// Encode every path segment for transport so '%' in stored names is not decoded
// into a different pathname before Blob verifies the signature.
export function encodeBlobUrlPath(signedUrl,pathname){
 const url=new URL(signedUrl);url.pathname='/'+pathname.split('/').map(encodeURIComponent).join('/');return url.href;
}
