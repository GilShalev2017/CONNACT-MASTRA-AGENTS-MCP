/**
 * Simple sliding-window chunker by word count with overlap. Real systems
 * often use token-aware or semantic (heading/paragraph-based) chunking;
 * a fixed-size word window is a well-understood, easy-to-reason-about
 * baseline that's good enough for this corpus size and keeps the RAG
 * pipeline easy to follow end to end.
 */
export function chunkText(
  text: string,
  options: { chunkSizeWords?: number; overlapWords?: number } = {},
): string[] {
  const chunkSizeWords = options.chunkSizeWords ?? 180;
  const overlapWords = options.overlapWords ?? 30;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= chunkSizeWords) return [words.join(" ")];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSizeWords, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start = end - overlapWords;
  }
  return chunks;
}
