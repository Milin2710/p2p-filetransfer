let activeDataChannel: RTCDataChannel | null = null;
let activeFile: File | null = null;
let activeFiles: File[] | null = null;
let encryptionKey: CryptoKey | null = null;
let resumeAfterConnect = false;

export function setActiveDataChannel(dc: RTCDataChannel | null) {
  activeDataChannel = dc;
}

export function getActiveDataChannel(): RTCDataChannel | null {
  return activeDataChannel;
}

export function setActiveFile(file: File | null) {
  activeFile = file;
}

export function getActiveFile(): File | null {
  return activeFile;
}

export function setActiveFiles(files: File[] | null) {
  activeFiles = files;
}

export function getActiveFiles(): File[] | null {
  return activeFiles;
}

export function setEncryptionKey(key: CryptoKey | null) {
  encryptionKey = key;
}

export function getEncryptionKey(): CryptoKey | null {
  return encryptionKey;
}

export function setResumeAfterConnect(v: boolean) {
  resumeAfterConnect = v;
}

export function getResumeAfterConnect(): boolean {
  return resumeAfterConnect;
}

export function resetAll() {
  activeDataChannel = null;
  activeFile = null;
  activeFiles = null;
  encryptionKey = null;
  resumeAfterConnect = false;
}


