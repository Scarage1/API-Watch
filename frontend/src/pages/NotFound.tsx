import { Link } from 'react-router-dom';
import { Zap, Home, ArrowLeft, Search, Terminal } from 'lucide-react';

const suggestions = [
  { label: 'Dashboard', to: '/' },
  { label: 'HTTP Request', to: '/request' },
  { label: 'Test Suites', to: '/suites' },
  { label: 'Analytics', to: '/analytics' },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center p-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/5 dark:bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent-500/5 dark:bg-accent-500/10 rounded-full blur-3xl" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative max-w-lg w-full text-center animate-slide-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl shadow-glow">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-surface-900 dark:text-white">
            API<span className="text-brand-600 dark:text-brand-400">Watch</span>
          </span>
        </div>

        {/* 404 block */}
        <div className="relative inline-block mb-6">
          <span className="text-[120px] font-black leading-none bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500 bg-clip-text text-transparent select-none">
            404
          </span>
          {/* Terminal decoration */}
          <div className="absolute -right-4 -top-4 w-10 h-10 bg-surface-900 dark:bg-surface-800 rounded-xl border border-surface-700 flex items-center justify-center shadow-lg rotate-12 opacity-80">
            <Terminal className="w-5 h-5 text-brand-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-3 tracking-tight">
          Route not found
        </h1>
        <p className="text-surface-500 dark:text-surface-400 mb-8 max-w-sm mx-auto leading-relaxed">
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        {/* Code block hint */}
        <div className="code-block text-left mb-8 text-sm">
          <span className="text-surface-500">$ </span>
          <span className="text-brand-400">apiwatch</span>
          <span className="text-surface-300"> navigate </span>
          <span className="text-amber-400">--to</span>
          <span className="text-emerald-400"> /</span>
          <span className="animate-pulse text-brand-400 ml-0.5">▊</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <Link to="/" className="btn btn-primary gap-2">
            <Home className="w-4 h-4" />
            Go to Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn btn-secondary gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        {/* Quick links */}
        <div>
          <p className="text-xs text-surface-400 dark:text-surface-500 mb-3 flex items-center justify-center gap-2">
            <Search className="w-3 h-3" />
            Quick navigation
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {suggestions.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-300 border border-surface-200 dark:border-surface-700 transition-all duration-150"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
