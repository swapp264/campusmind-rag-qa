/**
 * Intelligent local natural answer extractor for multi-document RAG.
 * Extracts grounded, direct answers across multiple uploaded PDFs.
 *
 * @param {string} question 
 * @param {Array<{ chunk: { documentId: string, documentName: string, pageNumber: number, category: string, text: string }, score: number }>} searchResults 
 * @param {Array<{ documentId: string, fileName: string }>} activeDocs 
 * @returns {{ answer: string, sources: Array<{ documentName: string, pageNumber: number, snippet: string, score: number }> }}
 */
export function extractDirectAnswer(question, searchResults, activeDocs = []) {
  const DEFAULT_NOT_FOUND = "I couldn't find this information in the uploaded college documents.";

  if (!searchResults || searchResults.length === 0) {
    return { answer: DEFAULT_NOT_FOUND, sources: [] };
  }

  const q = question.toLowerCase().trim();

  // Deduplicate and collect sentences per document
  const docSentencesMap = new Map();
  const sourcesMap = new Map();

  searchResults.forEach(({ chunk, score }) => {
    const docName = chunk.documentName || 'Document.pdf';
    const pageNum = chunk.pageNumber || 1;

    if (!docSentencesMap.has(docName)) {
      docSentencesMap.set(docName, []);
    }

    const text = (chunk.text || '').replace(/\s+/g, ' ');
    const rawSentences = text.split(/(?<=[.!?])\s+|\n+/);
    for (const raw of rawSentences) {
      const clean = raw.trim();
      if (clean.length > 15 && !clean.includes('TCPDF') && !clean.includes('Downloaded by')) {
        docSentencesMap.get(docName).push({
          text: clean,
          pageNumber: pageNum,
          documentName: docName,
          category: chunk.category,
        });
      }
    }

    const sourceKey = `${docName}_P${pageNum}`;
    if (!sourcesMap.has(sourceKey)) {
      sourcesMap.set(sourceKey, {
        documentName: docName,
        pageNumber: pageNum,
        snippet: chunk.text.length > 180 ? chunk.text.substring(0, 180) + '...' : chunk.text,
        score: Math.round(score * 100) / 100,
      });
    }
  });

  const allSentences = Array.from(docSentencesMap.values()).flat();

  if (allSentences.length === 0) {
    return { answer: DEFAULT_NOT_FOUND, sources: [] };
  }

  const matchedAnswers = [];
  const matchedSources = [];

  // Helper to format clean sentences
  const formatSentence = (str) => {
    let s = str.replace(/Venue\s*:/i, '. Venue: ').replace(/\s+/g, ' ').trim();
    if (!s.endsWith('.')) s += '.';
    return s;
  };

  // Check Cross-Document Intent (e.g., Attendance AND Exam / Meeting)
  const isMultiQuery = (q.includes('attendance') && (q.includes('exam') || q.includes('when'))) || (q.includes('timetable') && q.includes('exam'));

  if (isMultiQuery) {
    // Attendance part
    const attendanceSentence = allSentences.find(s => s.text.toLowerCase().includes('attendance') || s.text.toLowerCase().includes('75%'));
    if (attendanceSentence) {
      matchedAnswers.push(formatSentence(attendanceSentence.text));
      matchedSources.push({
        documentName: attendanceSentence.documentName,
        pageNumber: attendanceSentence.pageNumber,
        snippet: attendanceSentence.text,
      });
    }

    // Exam / Timetable part
    const examSentence = allSentences.find(s => (s.text.toLowerCase().includes('exam') || s.text.toLowerCase().includes('timetable') || s.text.toLowerCase().includes('held')) && s !== attendanceSentence);
    if (examSentence) {
      matchedAnswers.push(formatSentence(examSentence.text));
      matchedSources.push({
        documentName: examSentence.documentName,
        pageNumber: examSentence.pageNumber,
        snippet: examSentence.text,
      });
    }

    if (matchedAnswers.length > 0) {
      return {
        answer: matchedAnswers.join(' '),
        sources: matchedSources,
      };
    }
  }

  // Intent 1: WHEN / DATE / DAY / SCHEDULE / TIMETABLE
  if (q.includes('when') || q.includes('date') || q.includes('day') || q.includes('schedule') || q.includes('time') || q.includes('timetable')) {
    const dateRegex = /(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i;
    const timeRegex = /(\d{1,2}:\d{2}\s*(?:am|pm|noon|midnight)?|\d{1,2}\s*(?:am|pm|noon|midnight))/i;

    const matchingSentence = allSentences.find(s => 
      (dateRegex.test(s.text) || timeRegex.test(s.text)) &&
      (s.text.toLowerCase().includes('held') || s.text.toLowerCase().includes('meeting') || s.text.toLowerCase().includes('exam') || s.text.toLowerCase().includes('lecture') || s.text.toLowerCase().includes('class') || s.text.toLowerCase().includes('timetable') || s.text.toLowerCase().includes('on'))
    ) || allSentences.find(s => dateRegex.test(s.text) || timeRegex.test(s.text));

    if (matchingSentence) {
      const formatted = formatSentence(matchingSentence.text);
      return {
        answer: formatted,
        sources: [{ documentName: matchingSentence.documentName, pageNumber: matchingSentence.pageNumber, snippet: matchingSentence.text }],
      };
    }
  }

  // Intent 2: WHERE / VENUE / LOCATION
  if (q.includes('where') || q.includes('venue') || q.includes('location') || q.includes('place') || q.includes('room') || q.includes('hall')) {
    const venueRegex = /(venue|held at|held in|centre|center|university|college|hall|room|building|department)/i;

    const matchingSentence = allSentences.find(s => 
      venueRegex.test(s.text) && (s.text.toLowerCase().includes('meeting') || s.text.toLowerCase().includes('venue') || s.text.toLowerCase().includes('held') || s.text.toLowerCase().includes('at'))
    ) || allSentences.find(s => venueRegex.test(s.text));

    if (matchingSentence) {
      let sentenceText = matchingSentence.text;
      const venueMarkerIdx = sentenceText.search(/Venue\s*:/i);
      if (venueMarkerIdx !== -1) {
        const venuePart = sentenceText.substring(venueMarkerIdx).replace(/Venue\s*:\s*/i, '').split('.')[0];
        return {
          answer: `The meeting will be held at ${venuePart.trim()}.`,
          sources: [{ documentName: matchingSentence.documentName, pageNumber: matchingSentence.pageNumber, snippet: sentenceText }],
        };
      }

      return {
        answer: formatSentence(sentenceText),
        sources: [{ documentName: matchingSentence.documentName, pageNumber: matchingSentence.pageNumber, snippet: sentenceText }],
      };
    }
  }

  // Intent 3: ATTENDANCE / RULES / ELIGIBILITY / REQUIREMENTS
  if (q.includes('attendance') || q.includes('rule') || q.includes('requirement') || q.includes('eligibility') || q.includes('percent') || q.includes('%')) {
    const matchingSentence = allSentences.find(s => 
      s.text.toLowerCase().includes('attendance') || s.text.toLowerCase().includes('75%') || s.text.toLowerCase().includes('minimum') || s.text.toLowerCase().includes('required')
    );

    if (matchingSentence) {
      return {
        answer: formatSentence(matchingSentence.text),
        sources: [{ documentName: matchingSentence.documentName, pageNumber: matchingSentence.pageNumber, snippet: matchingSentence.text }],
      };
    }
  }

  // Intent 4: WHO / ATTEND / PARTICIPANTS / SUPERVISORS
  if (q.includes('who') || q.includes('attend') || q.includes('present') || q.includes('candidate') || q.includes('applicant') || q.includes('student') || q.includes('teacher')) {
    const matchingSentence = allSentences.find(s => 
      (s.text.toLowerCase().includes('asked') || s.text.toLowerCase().includes('attend') || s.text.toLowerCase().includes('present') || s.text.toLowerCase().includes('candidates') || s.text.toLowerCase().includes('supervisors'))
    );

    if (matchingSentence) {
      return {
        answer: formatSentence(matchingSentence.text),
        sources: [{ documentName: matchingSentence.documentName, pageNumber: matchingSentence.pageNumber, snippet: matchingSentence.text }],
      };
    }
  }

  // Intent 5: GENERAL KEYWORD SENTENCE SELECTION
  const stopWords = new Set(['what', 'is', 'the', 'are', 'on', 'in', 'at', 'of', 'for', 'to', 'a', 'an', 'and', 'or', 'do', 'does', 'how', 'my']);
  const queryTokens = q.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  if (queryTokens.length > 0) {
    let bestSentence = null;
    let maxMatchCount = 0;

    for (const s of allSentences) {
      const lower = s.text.toLowerCase();
      let matches = 0;
      for (const token of queryTokens) {
        if (lower.includes(token)) matches++;
      }
      if (matches > maxMatchCount) {
        maxMatchCount = matches;
        bestSentence = s;
      }
    }

    if (bestSentence && maxMatchCount >= 1) {
      return {
        answer: formatSentence(bestSentence.text),
        sources: [{ documentName: bestSentence.documentName, pageNumber: bestSentence.pageNumber, snippet: bestSentence.text }],
      };
    }
  }

  return {
    answer: DEFAULT_NOT_FOUND,
    sources: Array.from(sourcesMap.values()).slice(0, 2),
  };
}
