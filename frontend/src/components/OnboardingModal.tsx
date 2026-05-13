import { useState, useEffect } from 'react';
import {
  Zap, Send, FolderOpen, BarChart3, ArrowRight,
  Keyboard, X, ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils';

const ONBOARDING_KEY = 'api-watch-onboarding-seen';

const steps = [
  {
    icon: Send,
    title: 'Send HTTP Requests',
    description: 'Build and fire REST requests with full control over headers, params, body, and auth.',
    gradient: 'from-indigo-500 to-brand-600',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
  },
  {
    icon: FolderOpen,
    title: 'Organize Collections',
    description: 'Save requests, import from Postman or OpenAPI, and share with your team.',
    gradient: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  {
    icon: BarChart3,
    title: 'Test & Analyze',
    description: 'Write assertions, run test suites, and track performance with live analytics.',
    gradient: 'from-purple-500 to-fuchsia-600',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
  },
  {
    icon: Keyboard,
    title: 'Keyboard-First',
    description: '⌘K command palette · ⌘T new tab · ⌘W close · ⌘↵ send request',
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep]       = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      const t = setTimeout(() => {
        setVisible(true);
        requestAnimationFrame(() => setMounted(true));
      }, 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    setMounted(false);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(ONBOARDING_KEY, 'true');
    }, 350);
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else dismiss();
  };

  if (!visible) return null;

  const current = steps[step];
  const Icon    = current.icon;

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-[200] w-80 transition-all duration-350',
        'ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        mounted
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-8 scale-95'
      )}
      role="dialog"
      aria-modal="false"
      aria-label="Welcome to API-Watch"
    >
      {/* Card */}
      <div className="relative bg-white dark:bg-surface-900 rounded-2xl shadow-lifted dark:shadow-lifted-dark border border-surface-200/80 dark:border-surface-700/80 overflow-hidden">

        {/* Top accent gradient bar */}
        <div className={cn('h-1 w-full bg-gradient-to-r', current.gradient)} />

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5 text-surface-400" />
        </button>

        <div className="p-5">
          {/* Brand mark */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #0d9488)' }}
            >
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-surface-900 dark:text-white">
                API<span className="text-brand-500">Watch</span>
              </p>
              <p className="text-[9px] text-surface-400 uppercase tracking-widest">Quick Start</p>
            </div>
          </div>

          {/* Step icon */}
          <div className="mb-3">
            <div className={cn('inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 transition-all duration-300', current.bg)}>
              <Icon className={cn('w-5 h-5', `text-gradient-to-br ${current.gradient}`)} style={{ color: 'currentColor' }} />
            </div>
            <h3 className="text-sm font-bold text-surface-900 dark:text-white mb-1">
              {current.title}
            </h3>
            <p className="text-xs text-surface-500 dark:text-surface-400 leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step
                    ? 'w-6 bg-brand-600 dark:bg-brand-400'
                    : 'w-1.5 bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600'
                )}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
            <span className="ml-auto text-[10px] font-medium text-surface-400 tabular-nums">
              {step + 1}/{steps.length}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={dismiss}
              className="text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors px-2 py-1.5"
            >
              Skip all
            </button>
            <button
              onClick={next}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5',
                `bg-gradient-to-r ${current.gradient}`,
              )}
              style={{ boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}
            >
              {step < steps.length - 1 ? (
                <>Next <ChevronRight className="w-3.5 h-3.5" /></>
              ) : (
                <>Let's go! <ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
