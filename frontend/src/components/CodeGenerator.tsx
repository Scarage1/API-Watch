import { useState } from 'react';
import { X, Copy, Check, Code2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { generateCode, CODE_LANGUAGES } from '../lib/codeGenerator';
import type { CodeLanguage, CodeGenRequest } from '../lib/codeGenerator';

interface CodeGeneratorProps {
  request: CodeGenRequest;
  onClose: () => void;
}

export default function CodeGenerator({ request, onClose }: CodeGeneratorProps) {
  const [activeLanguage, setActiveLanguage] = useState<CodeLanguage>('curl');
  const [copied, setCopied] = useState(false);

  const code = generateCode(request, activeLanguage);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-700/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/10 ring-1 ring-brand-500/10">
              <Code2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-surface-900 dark:text-white">
                Code Snippet
              </h2>
              <p className="text-[11px] text-surface-400 mt-0.5">
                {request.method} {request.url ? (request.url.length > 50 ? request.url.slice(0, 50) + '…' : request.url) : 'request'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
          >
            <X className="w-4 h-4 text-surface-400" />
          </button>
        </div>

        {/* Language tabs */}
        <div className="flex items-center justify-between border-b border-surface-100 dark:border-surface-700/50">
          <div className="flex">
            {CODE_LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                onClick={() => setActiveLanguage(lang.id)}
                className={cn(
                  'px-4 py-2.5 text-xs font-medium transition-colors relative',
                  activeLanguage === lang.id
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">{lang.icon}</span>
                  {lang.label}
                </div>
                {activeLanguage === lang.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
                )}
              </button>
            ))}
          </div>

          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 mr-2 rounded-lg text-xs font-medium text-surface-500 hover:text-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
        </div>

        {/* Code area */}
        <div className="flex-1 overflow-auto bg-surface-50 dark:bg-surface-900/50">
          <pre className="p-5 text-xs font-mono leading-relaxed text-surface-700 dark:text-surface-300 whitespace-pre-wrap break-all">
            {code || '// Enter a URL and configure your request to generate code'}
          </pre>
        </div>
      </div>
    </div>
  );
}
