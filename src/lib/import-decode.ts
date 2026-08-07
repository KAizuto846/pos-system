export function decodeTextBuffer(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  const latin1 = buf.toString('latin1');
  if (latin1.includes('\uFFFD')) return utf8;
  return latin1;
}
