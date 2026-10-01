'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  Send,
  Sparkles,
  Bot,
  User,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Cpu,
  Layers,
  HelpCircle,
  Copy,
  Check,
  Eye,
  Plus,
  SlidersHorizontal,
  X
} from 'lucide-react';

const SUGGESTED_QUESTIONS = [
  { label: "Attendance Rules", query: "What are the attendance requirements?" },
  { label: "Exam Schedule", query: "When is the DBMS exam?" },
  { label: "Timetable", query: "What is my Monday timetable?" },
  { label: "College Notice", query: "When is the Ph.D. committee meeting?" },
  { label: "Cross-Document", query: "What is the attendance requirement and when are exams?" }
];

export default function MultiRAGPdfApp() {
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  // Profile Filter States
  const [profileDept, setProfileDept] = useState('Computer Engineering');
  const [profileSem, setProfileSem] = useState('Semester 5');

  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  
  const [expandedSources, setExpandedSources] = useState({});
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [selectedDocPreview, setSelectedDocPreview] = useState(null);

  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAnswering]);

  // Handle uploading 1 to 4 PDFs simultaneously
  const handleMultipleFilesUpload = async (files) => {
    if (!files || files.length === 0) return;

    const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      setErrorMessage('Please select valid PDF documents (.pdf)');
      return;
    }

    if (pdfFiles.length > 4) {
      setErrorMessage('You can upload a maximum of 4 PDFs at a time.');
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);
    setUploadProgress(pdfFiles.map(f => ({ name: f.name, status: 'Indexing...' })));

    try {
      const formData = new FormData();
      pdfFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('department', profileDept);
      formData.append('semester', profileSem);

      const response = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload and index PDFs.');
      }

      setDocuments(data.documents || []);

      setUploadProgress(pdfFiles.map(f => ({ name: f.name, status: 'Indexed' })));

      // Initialize welcome message if first upload
      if (messages.length === 0) {
        setMessages([
          {
            id: 'msg-welcome',
            role: 'assistant',
            content: `👋 Welcome to CampusMind Knowledge Assistant!\n\nI have indexed **${data.documents.length} college document(s)** into your knowledge base. You can now ask any question across your timetables, attendance regulations, notices, or exam schedules from this single interface.`,
            sources: [],
          }
        ]);
      }
    } catch (err) {
      console.error('Upload Error:', err);
      setErrorMessage(err.message || 'An error occurred during file upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    try {
      const response = await fetch(`/api/upload-pdf?documentId=${documentId}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete document.');
      }

      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Delete Error:', err);
      setErrorMessage(err.message || 'Failed to delete document.');
    }
  };

  const handleAskQuestion = async (e, customQuestion) => {
    if (e) e.preventDefault();
    const q = customQuestion || inputQuestion;
    if (!q || !q.trim() || isAnswering) return;

    if (documents.length === 0) {
      setErrorMessage('Please upload at least 1 PDF document before asking a question.');
      return;
    }

    const userQuestion = q.trim();
    setInputQuestion('');
    setErrorMessage(null);

    const userMsgId = `user-${Date.now()}`;
    const newMessages = [
      ...messages,
      { id: userMsgId, role: 'user', content: userQuestion }
    ];

    setMessages(newMessages);
    setIsAnswering(true);

    try {
      const chatHistory = messages
        .filter(m => m.id !== 'msg-welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeBaseId: 'kb_default',
          question: userQuestion,
          chatHistory,
          profileFilter: { department: profileDept, semester: profileSem },
        }),
      });

      const data = await response.json();

      setMessages([
        ...newMessages,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.answer || "I couldn't find this information in the uploaded college documents.",
          sources: data.sources || [],
        }
      ]);
    } catch (err) {
      console.error('Chat Error:', err);
      const errorText = err.message || 'Failed to generate answer.';
      setMessages([
        ...newMessages,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${errorText}`,
          sources: [],
        }
      ]);
    } finally {
      setIsAnswering(false);
    }
  };

  const toggleSourceExpand = (msgId) => {
    setExpandedSources(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const copyAnswer = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const totalChunksCount = documents.reduce((acc, doc) => acc + (doc.totalChunks || 0), 0);

  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* Top Header */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/40 rounded-xl text-indigo-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
                CampusMind Knowledge Assistant
              </h1>
              <p className="text-xs text-slate-400">Multi-Document PDF RAG System</p>
            </div>
          </div>

          {/* Profile Filter Bar */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400">Profile:</span>
              <select
                value={profileDept}
                onChange={(e) => setProfileDept(e.target.value)}
                className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="Computer Engineering" className="bg-slate-900 text-slate-200">Computer Engineering</option>
                <option value="Information Technology" className="bg-slate-900 text-slate-200">Information Technology</option>
                <option value="Mechanical Engineering" className="bg-slate-900 text-slate-200">Mechanical Engineering</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <span className="text-slate-400">Sem:</span>
              <select
                value={profileSem}
                onChange={(e) => setProfileSem(e.target.value)}
                className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
              >
                <option value="Semester 5" className="bg-slate-900 text-slate-200">Semester 5</option>
                <option value="Semester 3" className="bg-slate-900 text-slate-200">Semester 3</option>
                <option value="Semester 7" className="bg-slate-900 text-slate-200">Semester 7</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">{errorMessage}</div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-200 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* SECTION 1: MULTI-PDF UPLOAD & DOCUMENT KNOWLEDGE BASE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Multi PDF Dropzone */}
          <div className="lg:col-span-1 glass-panel p-5 rounded-2xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center">
                  <UploadCloud className="w-4 h-4 mr-1.5 text-indigo-400" /> Upload Documents
                </h2>
                <span className="text-xs text-indigo-400 font-semibold">Max: 4 PDFs</span>
              </div>

              <div
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files) handleMultipleFilesUpload(e.dataTransfer.files);
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 rounded-xl border-2 border-dashed cursor-pointer text-center transition-all ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-950/30'
                    : 'border-slate-700 hover:border-indigo-500/60 glass-card'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => handleMultipleFilesUpload(e.target.files)}
                />

                <div className="flex flex-col items-center space-y-2">
                  <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                    <Plus className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200">
                    Drag & Drop 3–4 PDFs here or <span className="text-indigo-400 underline">Browse</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Timetable, Exam Schedule, Attendance Rules, Notices
                  </p>
                </div>
              </div>
            </div>

            {/* Live Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-indigo-300 flex items-center">
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Indexing Documents...
                </p>
                {uploadProgress.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded bg-slate-900 border border-slate-800">
                    <span className="truncate max-w-[180px] text-slate-300">{item.name}</span>
                    <span className="text-emerald-400 font-semibold">{item.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Knowledge Base Document Table */}
          <div className="lg:col-span-2 glass-panel p-5 rounded-2xl flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center">
                  <Layers className="w-4 h-4 mr-1.5 text-purple-400" /> Active Knowledge Base
                </h2>
                <p className="text-xs text-slate-400">All uploaded documents indexed together for multi-document RAG</p>
              </div>
              <div className="flex items-center space-x-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-medium">
                  {documents.length} Document(s)
                </span>
                <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 font-medium">
                  {totalChunksCount} Chunks
                </span>
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-8 glass-card rounded-xl text-slate-500 text-xs">
                No active PDFs in Knowledge Base. Upload your college PDFs to begin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Document Title</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Chunks</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {documents.map((doc) => (
                      <tr key={doc.documentId} className="hover:bg-slate-900/40 transition">
                        <td className="py-2.5 px-3 font-semibold text-white flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{doc.fileName}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-medium text-[11px]">
                            {doc.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-indigo-300 font-bold">{doc.totalChunks}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold flex items-center mt-1">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Indexed
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteDocument(doc.documentId)}
                            className="p-1 rounded hover:bg-red-950/60 text-slate-500 hover:text-red-400 transition"
                            title="Delete document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* SECTION 2: STUDENT CHAT INTERFACE & MULTI-PDF QA */}
        <div className="glass-panel rounded-2xl flex flex-col h-[620px] overflow-hidden">
          
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Unified Knowledge Assistant</h3>
                <p className="text-xs text-slate-400">Searching across all {documents.length} uploaded PDF(s)</p>
              </div>
            </div>

            {/* Quick Sample Question Chips */}
            <div className="hidden sm:flex items-center space-x-2 overflow-x-auto">
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAskQuestion(null, q.query)}
                  disabled={isAnswering || documents.length === 0}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-indigo-950 border border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-200 transition shrink-0"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`flex items-start space-x-3.5 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed space-y-3 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-600/20'
                      : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-tl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                  {/* Multi-Document Grounding Sources */}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 flex items-center">
                        <BookOpen className="w-3.5 h-3.5 mr-1 text-indigo-400" /> GROUNDING SOURCES
                      </div>

                      <div className="space-y-1.5">
                        {msg.sources.map((src, sIdx) => (
                          <div
                            key={sIdx}
                            className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 text-slate-300"
                          >
                            <span className="font-semibold text-slate-200 truncate max-w-[280px]">
                              • {src.documentName}
                            </span>
                            <span className="text-indigo-400 font-mono text-[11px]">
                              Page {src.pageNumber}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Copy Button */}
                  {msg.role === 'assistant' && msg.id !== 'msg-welcome' && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => copyAnswer(msg.content, idx)}
                        className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center space-x-1 transition"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-purple-600/40 border border-purple-500/40 text-purple-200 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isAnswering && (
              <div className="flex items-start space-x-3.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="bg-slate-900/90 text-slate-300 border border-slate-800 rounded-2xl rounded-tl-none p-4 text-xs flex items-center space-x-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-slate-400">Searching across {documents.length} PDF(s) & generating answer with Mistral...</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Question Input */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/80">
            <form onSubmit={(e) => handleAskQuestion(e)} className="flex items-center space-x-3">
              <input
                type="text"
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                placeholder={
                  documents.length > 0
                    ? `Ask anything about your ${documents.length} uploaded PDF(s)...`
                    : 'Upload 1 to 4 college PDFs above to start asking questions...'
                }
                disabled={isAnswering || documents.length === 0}
                className="flex-1 glass-input px-4 py-3 rounded-xl text-sm placeholder-slate-500 focus:outline-none transition disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputQuestion.trim() || isAnswering || documents.length === 0}
                className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-medium text-sm flex items-center space-x-2 transition shadow-lg shadow-indigo-600/25 shrink-0"
              >
                <span>Ask</span>
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900">
        CampusMind RAG System • Multi-PDF Vector Search • Powered by Mistral API
      </footer>
    </div>
  );
}
