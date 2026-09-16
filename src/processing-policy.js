const configured=Number(import.meta.env?.VITE_BROWSER_MAX_MB);
export const BROWSER_MAX_MB=Number.isFinite(configured) && configured>0 ? configured : 100;
export const BROWSER_MAX_BYTES=BROWSER_MAX_MB*1000000;
export const useBackend=file=>file.size>BROWSER_MAX_BYTES;
