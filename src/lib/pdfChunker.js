import pdfParse from 'pdf-parse';

/**
 * Infer a document category based on file name or content keywords.
 * @param {string} fileName 
 * @param {string} sampleText 
 * @returns {string}
 */
export function inferDocumentCategory(fileName = '', sampleText = '') {
  const name = fileName.toLowerCase();
  const text = sampleText.toLowerCase();

  if (name.includes('timetable') || text.includes('timetable') || text.includes('schedule') || text.includes('lecture')) {
    return 'Timetable';
  }
  if (name.includes('exam') || text.includes('exam') || text.includes('examination') || text.includes('viva')) {
    return 'Examination';
  }
  if (name.includes('attendance') || text.includes('attendance') || text.includes('absence')) {
    return 'Attendance Rules';
  }
  if (name.includes('notice') || text.includes('notice') || text.includes('circular') || text.includes('meeting')) {
    return 'Official Notice';
  }
  if (name.includes('syllabus') || text.includes('syllabus') || text.includes('curriculum') || text.includes('course')) {
    return 'Syllabus';
  }
  return 'General Regulation';
}

/**
 * Parses PDF buffer page-by-page and extracts clean text chunks with full multi-document metadata.
 * @param {Buffer} pdfBuffer 
 * @param {object} meta - { documentId, documentName, category, department, semester }
 * @returns {Promise<{ totalPages: number, textLength: number, category: string, chunks: Array<{ chunkId: string, documentId: string, documentName: string, pageNumber: number, category: string, text: string }> }>}
 */
export async function extractAndChunkPDF(pdfBuffer, meta = {}) {
  const pageMap = [];

  const customPagerender = function (pageData) {
    return pageData.getTextContent().then(function (textContent) {
      let lastY, text = '';
      for (let item of textContent.items) {
        if (lastY === item.transform[5] || !lastY) {
          text += item.str + ' ';
        } else {
          text += '\n' + item.str + ' ';
        }
        lastY = item.transform[5];
      }
      const pageNum = pageData.pageIndex + 1;
      const cleanText = text.replace(/\s+/g, ' ').trim();
      pageMap.push({ pageNum, text: cleanText });
      return text;
    });
  };

  const parsed = await pdfParse(pdfBuffer, { pagerender: customPagerender });
  const totalPages = parsed.numpages || pageMap.length || 1;

  if (pageMap.length === 0 && parsed.text) {
    pageMap.push({ pageNum: 1, text: parsed.text.replace(/\s+/g, ' ').trim() });
  }

  const sampleCombinedText = pageMap.map(p => p.text).join(' ').substring(0, 1000);
  const documentCategory = meta.category || inferDocumentCategory(meta.documentName, sampleCombinedText);

  const chunks = [];
  let chunkIndex = 0;
  let totalLength = 0;

  const MAX_CHUNK_SIZE = 600;
  const CHUNK_OVERLAP = 120;

  for (const page of pageMap) {
    const text = page.text;
    totalLength += text.length;

    if (!text || text.length === 0) continue;

    if (text.length <= MAX_CHUNK_SIZE) {
      chunkIndex++;
      chunks.push({
        chunkId: `${meta.documentId}_chunk_${chunkIndex}`,
        documentId: meta.documentId,
        documentName: meta.documentName || 'Document.pdf',
        pageNumber: page.pageNum,
        category: documentCategory,
        department: meta.department || 'General',
        semester: meta.semester || 'All',
        text: text,
      });
    } else {
      let start = 0;
      while (start < text.length) {
        let end = start + MAX_CHUNK_SIZE;
        if (end < text.length) {
          const spaceIdx = text.lastIndexOf(' ', end);
          if (spaceIdx > start + 300) {
            end = spaceIdx;
          }
        } else {
          end = text.length;
        }

        const chunkText = text.slice(start, end).trim();
        if (chunkText.length > 20) {
          chunkIndex++;
          chunks.push({
            chunkId: `${meta.documentId}_chunk_${chunkIndex}`,
            documentId: meta.documentId,
            documentName: meta.documentName || 'Document.pdf',
            pageNumber: page.pageNum,
            category: documentCategory,
            department: meta.department || 'General',
            semester: meta.semester || 'All',
            text: chunkText,
          });
        }

        if (end >= text.length) break;
        start = Math.max(start + 100, end - CHUNK_OVERLAP);
      }
    }
  }

  return {
    totalPages,
    textLength: totalLength,
    category: documentCategory,
    chunks,
  };
}
