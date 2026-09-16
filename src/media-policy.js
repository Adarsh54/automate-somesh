export const MAX_MEDIA_BYTES = 2 * 1024 ** 3;
const types = {wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg',aif:'audio/aiff',aiff:'audio/aiff',mp4:'video/mp4',mov:'video/quicktime',m4v:'video/mp4',webm:'video/webm',mkv:'video/x-matroska'};
export function mediaType(filename) {return types[filename.split('.').pop().toLowerCase()] || null;}
