import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { logger } from '../utils/logger.js';

let embedder: FeatureExtractionPipeline | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the embedding model.
 * Uses all-MiniLM-L6-v2 which produces 384-dimensional embeddings.
 * Model size: ~46MB, Latency: ~50-150ms on ARM64
 */
export async function initEmbeddings(): Promise<void> {
  if (embedder) return;

  // Prevent multiple simultaneous initializations
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    logger.info('Loading embedding model (all-MiniLM-L6-v2)...');
    const startTime = Date.now();

    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      // Use quantized model for faster inference
      dtype: 'q8',
    });

    const loadTime = Date.now() - startTime;
    logger.info('Embedding model loaded', { loadTimeMs: loadTime });
  })();

  await initPromise;
}

/**
 * Generate embeddings for a text string.
 * Returns a 384-dimensional normalized vector.
 */
export async function embed(text: string): Promise<number[]> {
  if (!embedder) {
    await initEmbeddings();
  }

  const startTime = Date.now();

  const output = await embedder!(text, {
    pooling: 'mean',
    normalize: true,
  });

  const embedding = Array.from(output.data as Float32Array);

  const embedTime = Date.now() - startTime;
  logger.debug('Generated embedding', {
    textLength: text.length,
    embedTimeMs: embedTime,
    dimensions: embedding.length,
  });

  return embedding;
}

/**
 * Generate embeddings for multiple texts in batch.
 * More efficient than calling embed() multiple times.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!embedder) {
    await initEmbeddings();
  }

  const startTime = Date.now();

  const results: number[][] = [];
  for (const text of texts) {
    const output = await embedder!(text, {
      pooling: 'mean',
      normalize: true,
    });
    results.push(Array.from(output.data as Float32Array));
  }

  const totalTime = Date.now() - startTime;
  logger.debug('Generated batch embeddings', {
    count: texts.length,
    totalTimeMs: totalTime,
    avgTimeMs: Math.round(totalTime / texts.length),
  });

  return results;
}

/**
 * Get the dimensionality of the embeddings (384 for all-MiniLM-L6-v2).
 */
export function getEmbeddingDimension(): number {
  return 384;
}

/**
 * Check if the embedding model is loaded.
 */
export function isEmbeddingModelLoaded(): boolean {
  return embedder !== null;
}
