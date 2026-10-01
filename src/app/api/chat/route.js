import { NextResponse } from 'next/server';
import { getMistralEmbeddings, getMistralCompletion, sleep } from '@/lib/mistral';
import { getMultiDocStore, searchMultiDocChunks } from '@/lib/vectorStore';
import { extractDirectAnswer } from '@/lib/answerExtractor';

export async function POST(request) {
  try {
    const { knowledgeBaseId = 'kb_default', question, chatHistory = [], profileFilter = {} } = await request.json();

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({
        answer: "Please enter a valid question.",
        sources: [],
      });
    }

    const kbStore = getMultiDocStore(knowledgeBaseId);
    if (!kbStore || !kbStore.documents || kbStore.documents.length === 0 || !kbStore.chunks || kbStore.chunks.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find this information in the uploaded college documents.",
        sources: [],
      });
    }

    const queryText = question.trim();

    // Step 1: Embed user question (with fast hybrid local fallback if embedding API rate-limits)
    let queryVector = null;
    try {
      const queryEmbeddings = await getMistralEmbeddings(queryText);
      queryVector = queryEmbeddings[0] || null;
    } catch (embedErr) {
      console.warn('Embedding API rate limited. Using hybrid similarity search across uploaded PDFs:', embedErr.message);
    }

    // Step 2: Multi-Document Vector + Keyword Similarity Search
    const searchResults = searchMultiDocChunks(kbStore.chunks, queryVector, queryText, 6);

    if (!searchResults || searchResults.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find this information in the uploaded college documents.",
        sources: [],
      });
    }

    // Prepare context text and source references from matching chunks across documents
    const contextBlocks = [];
    const sourcesMap = new Map();

    searchResults.forEach(({ chunk, score }) => {
      const docName = chunk.documentName || 'Document.pdf';
      const pageNum = chunk.pageNumber || 1;

      contextBlocks.push(`[Document: "${docName}" | Page ${pageNum} | Category: ${chunk.category}]:\n${chunk.text}`);

      const sourceKey = `${docName}_P${pageNum}`;
      if (!sourcesMap.has(sourceKey)) {
        sourcesMap.set(sourceKey, {
          documentName: docName,
          pageNumber: pageNum,
          snippet: chunk.text.length > 200 ? chunk.text.substring(0, 200) + '...' : chunk.text,
          score: Math.round(score * 100) / 100,
        });
      }
    });

    const contextText = contextBlocks.join('\n\n---\n\n');
    const sources = Array.from(sourcesMap.values());

    // Step 3: Attempt Mistral API Chat Completion first
    try {
      const systemPrompt = `You are a college knowledge assistant.

Answer the user's question ONLY using the retrieved context from the uploaded college documents below.

STRICT INSTRUCTIONS:
1. If the answer is present in the context, provide a direct, clear, and concise answer.
2. If the answer is not present in the retrieved context, say:
   "I couldn't find this information in the uploaded college documents."
3. Do not hallucinate, speculate, or invent information outside the retrieved context.
4. Reference the document name and page number when helpful.
5. If the question asks about multiple topics from different PDFs (e.g. attendance + exam date), combine the facts from each document into one coherent grounded answer.

RETRIEVED COLLEGE DOCUMENTS CONTEXT:
${contextText}`;

      const formattedHistory = (chatHistory || []).slice(-4).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      const messages = [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        { role: 'user', content: queryText },
      ];

      await sleep(300);

      const llmAnswer = await getMistralCompletion(messages, 0.1);

      return NextResponse.json({
        answer: llmAnswer,
        sources,
      });
    } catch (llmErr) {
      console.warn('Mistral Completion API rate limited or failed. Executing multi-document direct answer extractor:', llmErr.message);

      // Step 4: Multi-Document Natural Direct Answer Fallback
      const directResult = extractDirectAnswer(queryText, searchResults, kbStore.documents);

      return NextResponse.json({
        answer: directResult.answer,
        sources: directResult.sources.length > 0 ? directResult.sources : sources,
      });
    }
  } catch (error) {
    console.error('Error in /api/chat:', error);
    return NextResponse.json({
      answer: "I couldn't find this information in the uploaded college documents.",
      sources: [],
    });
  }
}
