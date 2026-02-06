import { useState, useEffect } from 'react';
import { Zap, Send, FolderOpen, BarChart3, ArrowRight, Keyboard } from 'lucide-react';
import { cn } from '../lib/utils';

const ONBOARDING_KEY = 'api-watch-onboarding-seen';

const steps = [
  {
    icon: Send,
    title: 'Send Requests',
    description: 'Build and send HTTP requests with full control over headers, params, body, and auth.',
    color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  },
  {
    icon: FolderOpen,
    title: 'Organize Collections',
    description: 'Save requests into collections, import from Postman, and share with your team.',
    color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
  },
  {
    icon: BarChart3,
    title: 'Analyze & Test',
    description: 'Run test suites, write assertions, and track performance with rich analytics.',
    color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
  },
  {
    icon: Keyboard,
    title: 'Keyboard Shortcuts',
    description: '⌘K for command palette, ⌘T for new tab, ⌘W to close tab, ⌘⇧D to duplicate.',
    color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      // Small delay so the app loads first
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setVisible(false);
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else dismiss();
  };

  if (!visible) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to API-Watch"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 max-w-md w-full mx-4 overflow-hidden animate-fade-in">
        {/* Header accent */}
        <div className="h-1.5 bg-gradient-to-r from-brand-500 via-brand-600 to-purple-600" />

        <div className="p-8 text-center">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl shadow-lg mb-4">
            <Zap className="w-7 h-7 text-white" />
          </div>

          <h2 className="text-xl font-bold text-surface-900 dark:text-white mb-1">
            Welcome to API<span className="text-brand-600 dark:text-brand-400">Watch</span>
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-8">
            The modern API development workspace
          </p>

          {/* Step content */}
          <div className="mb-8">
            <div className={cn('inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3', current.color)}>
              <Icon className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-1">
              {current.title}
            </h3>
            <p className="text-sm text-surface-500 dark:text-surface-400 max-w-xs mx-auto">
              {current.description}
            </p>
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 mb-6">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  i === step ? 'w-6 bg-brand-600' : 'bg-surface-200 dark:bg-surface-700'
                )}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={dismiss}
              className="px-4 py-2 text-sm font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={next}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white text-sm font-medium shadow-sm transition-all"
            >
              {step < steps.length - 1 ? (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                'Get Started'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
