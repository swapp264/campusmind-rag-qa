/**
 * Calculate Cosine Similarity between two numerical vector arrays.
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number} similarity score [-1 to 1]
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compute term-frequency keyword similarity score between query text and chunk text.
 * @param {string} queryText 
 * @param {string} chunkText 
 * @returns {number} score between 0 and 1
 */
export function computeKeywordSimilarity(queryText, chunkText) {
  if (!queryText || !chunkText) return 0;

  const stopWords = new Set(['what', 'is', 'the', 'on', 'date', 'when', 'who', 'where', 'are', 'a', 'an', 'in', 'at', 'of', 'for', 'to', 'and', 'or', 'my']);
  const tokenize = (str) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);

  const queryTokens = tokenize(queryText);
  const chunkTokens = tokenize(chunkText);
  const chunkTokenSet = new Set(chunkTokens);

  if (queryTokens.length === 0 || chunkTokens.length === 0) return 0;

  let matches = 0;
  let importantMatches = 0;

  for (const token of queryTokens) {
    if (chunkTokenSet.has(token)) {
      matches++;
      if (!stopWords.has(token)) {
        importantMatches += 2.5;
      }
    }
  }

  const baseScore = (matches + importantMatches) / (queryTokens.length * 2.5);
  return Math.min(baseScore, 1.0);
}

// Global in-memory storage for active multi-document knowledge bases
const globalKBStore = globalThis.__multiPdfVectorStore || new Map();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__multiPdfVectorStore = globalKBStore;
}

/**
 * Save or update a multi-document knowledge base store.
 * @param {string} kbId 
 * @param {object} kbData 
 */
export function saveMultiDocStore(kbId, kbData) {
  globalKBStore.set(kbId, {
    ...kbData,
    updatedAt: Date.now(),
  });
}

/**
 * Retrieve a multi-document knowledge base store by ID.
 * @param {string} kbId 
 * @returns {object|null}
 */
export function getMultiDocStore(kbId) {
  return globalKBStore.get(kbId) || null;
}

/**
 * Add or replace a document in the active knowledge base.
 * @param {string} kbId 
 * @param {object} docMeta - { documentId, fileName, totalPages, totalChunks, category, department, semester }
 * @param {Array} newChunks 
 */
export function addDocumentToKB(kbId, docMeta, newChunks) {
  let store = globalKBStore.get(kbId);
  if (!store) {
    store = {
      kbId,
      documents: [],
      chunks: [],
    };
  }

  // Prevent duplicate document by file name
  const existingDocIdx = store.documents.findIndex(d => d.fileName.toLowerCase() === docMeta.fileName.toLowerCase());
  if (existingDocIdx !== -1) {
    const oldDocId = store.documents[existingDocIdx].documentId;
    store.documents.splice(existingDocIdx, 1);
    store.chunks = store.chunks.filter(c => c.documentId !== oldDocId);
  }

  store.documents.push(docMeta);
  store.chunks.push(...newChunks);
  store.updatedAt = Date.now();

  globalKBStore.set(kbId, store);
  return store;
}

/**
 * Delete a specific document and its chunks from the active knowledge base.
 * @param {string} kbId 
 * @param {string} documentId 
 */
export function deleteDocumentFromKB(kbId, documentId) {
  const store = globalKBStore.get(kbId);
  if (!store) return null;

  store.documents = store.documents.filter(d => d.documentId !== documentId);
  store.chunks = store.chunks.filter(c => c.documentId !== documentId);
  store.updatedAt = Date.now();

  globalKBStore.set(kbId, store);
  return store;
}

/**
 * Search ALL document chunks across ALL uploaded PDFs in the active knowledge base.
 * @param {Array<{ chunkId: string, documentId: string, documentName: string, pageNumber: number, category: string, text: string, embedding?: number[] }>} chunks 
 * @param {number[]|null} queryVector 
 * @param {string} queryText 
 * @param {number} topK 
 * @returns {Array<{ chunk: any, score: number }>}
 */
export function searchMultiDocChunks(chunks, queryVector, queryText = '', topK = 6) {
  if (!chunks || chunks.length === 0) return [];

  const scored = chunks.map((chunk) => {
    let vectorScore = 0;
    if (queryVector && chunk.embedding && chunk.embedding.length > 0) {
      vectorScore = cosineSimilarity(queryVector, chunk.embedding);
    }

    const keywordScore = computeKeywordSimilarity(queryText, chunk.text);
    
    // Combine vector + keyword score
    const finalScore = queryVector && chunk.embedding && chunk.embedding.length > 0
      ? (vectorScore * 0.65) + (keywordScore * 0.35)
      : keywordScore;

    return { chunk, score: finalScore };
  });

  // Sort descending by similarity score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
