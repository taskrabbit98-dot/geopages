/**
 * Jaccard similarity between two strings (word-set overlap).
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/<[^>]+>/g, " ") // strip HTML tags
        .split(/\W+/)
        .filter((w) => w.length > 3) // ignore very short words
    );

  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter((w) => setB.has(w)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Returns true if two page bodies are too similar (>70% Jaccard).
 */
export function isTooSimilar(bodyA: string, bodyB: string): boolean {
  return jaccardSimilarity(bodyA, bodyB) > 0.7;
}
