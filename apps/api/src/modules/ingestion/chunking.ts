export type TextChunk = {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
};

export function chunkText(text: string, chunkSize: number, overlap: number): TextChunk[] {
  if (chunkSize <= overlap) {
    throw new Error("chunkSize must be greater than overlap");
  }
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + chunkSize);
    const slice = text.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push({
        index,
        text: slice,
        charStart: start,
        charEnd: end,
      });
      index += 1;
    }
    if (end === text.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}
