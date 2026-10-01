import { NextResponse } from 'next/server';
import { extractAndChunkPDF } from '@/lib/pdfChunker';
import { getMistralEmbeddings } from '@/lib/mistral';
import { addDocumentToKB, deleteDocumentFromKB, getMultiDocStore } from '@/lib/vectorStore';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const singleFile = formData.get('file');
    const kbId = formData.get('knowledgeBaseId') || 'kb_default';
    const categoryOverride = formData.get('category') || null;
    const department = formData.get('department') || 'Computer Engineering';
    const semester = formData.get('semester') || 'Semester 5';

    const pdfFiles = [];
    if (files && files.length > 0) {
      for (const f of files) {
        if (f && typeof f === 'object' && (f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf')) {
          pdfFiles.push(f);
        }
      }
    }
    if (pdfFiles.length === 0 && singleFile && typeof singleFile === 'object') {
      if (singleFile.name.toLowerCase().endsWith('.pdf') || singleFile.type === 'application/pdf') {
        pdfFiles.push(singleFile);
      }
    }

    if (pdfFiles.length === 0) {
      return NextResponse.json(
        { error: 'No valid PDF files were provided. Please upload PDF documents.' },
        { status: 400 }
      );
    }

    const processedDocs = [];

    for (const file of pdfFiles) {
      const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Step 1: Extract and chunk PDF
      const { totalPages, category, chunks } = await extractAndChunkPDF(buffer, {
        documentId,
        documentName: file.name,
        category: categoryOverride,
        department,
        semester,
      });

      if (!chunks || chunks.length === 0) continue;

      // Step 2: Attempt Mistral Embeddings with hybrid local indexing fallback
      let indexedChunks = [];
      try {
        const chunkTexts = chunks.map(c => c.text);
        const embeddings = await getMistralEmbeddings(chunkTexts);

        indexedChunks = chunks.map((c, idx) => ({
          ...c,
          embedding: embeddings[idx] || [],
        }));
      } catch (embeddingErr) {
        console.warn(`Mistral Embedding API rate limited for "${file.name}". Using hybrid text indexing fallback:`, embeddingErr.message);
        indexedChunks = chunks.map((c) => ({
          ...c,
          embedding: [],
        }));
      }

      const docMeta = {
        documentId,
        fileName: file.name,
        category: category || 'General',
        department,
        semester,
        version: 'v1.0',
        totalPages,
        totalChunks: indexedChunks.length,
        status: 'Indexed',
      };

      // Step 3: Add document to global knowledge base
      addDocumentToKB(kbId, docMeta, indexedChunks);
      processedDocs.push(docMeta);
    }

    const store = getMultiDocStore(kbId);

    return NextResponse.json({
      success: true,
      knowledgeBaseId: kbId,
      documents: store ? store.documents : processedDocs,
      totalDocuments: store ? store.documents.length : processedDocs.length,
      totalChunks: store ? store.chunks.length : 0,
      message: `Successfully indexed ${processedDocs.length} document(s) into the Knowledge Base.`,
    });
  } catch (error) {
    console.error('Error in /api/upload-pdf:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred while uploading and indexing PDF files.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const kbId = searchParams.get('knowledgeBaseId') || 'kb_default';

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required for deletion.' },
        { status: 400 }
      );
    }

    const updatedStore = deleteDocumentFromKB(kbId, documentId);

    return NextResponse.json({
      success: true,
      knowledgeBaseId: kbId,
      documents: updatedStore ? updatedStore.documents : [],
      totalDocuments: updatedStore ? updatedStore.documents.length : 0,
      totalChunks: updatedStore ? updatedStore.chunks.length : 0,
      message: 'Document removed from knowledge base.',
    });
  } catch (error) {
    console.error('Error in DELETE /api/upload-pdf:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete document.' },
      { status: 500 }
    );
  }
}
