let lemmaDictReady = false;

export function isLemmaDictReady(): boolean {
  return lemmaDictReady;
}

export function markLemmaDictReady(): void {
  lemmaDictReady = true;
}
