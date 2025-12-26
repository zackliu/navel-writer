export function extractMarkedBlock(
  text: string,
  { begin, end }: { begin: string; end: string }
): string | null {
  const start = text.indexOf(begin);
  if (start === -1) return null;
  const afterStart = start + begin.length;
  const finish = text.indexOf(end, afterStart);
  if (finish === -1) return null;
  return text.slice(afterStart, finish).trim();
}

export function extractJsonFromMarkedBlock(text: string): any | null {
  const block = extractMarkedBlock(text, { begin: "<<<JSON", end: "JSON>>>" });
  if (!block) return null;
  return JSON.parse(block);
}
