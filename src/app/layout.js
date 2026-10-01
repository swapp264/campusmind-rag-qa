import './globals.css';

export const metadata = {
  title: 'College PDF QA - RAG with Mistral API',
  description: 'Upload your college timetable, notices, syllabus, or rules PDF and get instant accurate answers powered by RAG and Mistral AI.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased text-slate-100 selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
