export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold">404 - Page Not Found</h2>
        <p className="text-slate-400 text-sm">The requested page could not be found.</p>
        <a href="/" className="inline-block px-4 py-2 bg-indigo-600 rounded-lg text-white text-sm font-medium">
          Return Home
        </a>
      </div>
    </div>
  );
}
