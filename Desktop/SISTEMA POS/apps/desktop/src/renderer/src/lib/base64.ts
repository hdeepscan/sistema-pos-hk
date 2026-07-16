export function bufferABase64(buffer: ArrayBuffer): string {
  let binario = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}

export function base64ABuffer(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function textoABase64(texto: string): string {
  return btoa(unescape(encodeURIComponent(texto)));
}
