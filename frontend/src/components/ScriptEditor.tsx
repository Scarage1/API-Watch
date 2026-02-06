import { useState, useRef, useCallback } from 'react';
import { ChevronDown, Code2, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface Snippet {
  name: string;
  code: string;
}

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  snippets: Snippet[];
  placeholder?: string;
  label: string;
}

export default function ScriptEditor({
  value,
  onChange,
  snippets,
  placeholder,
  label,
}: ScriptEditorProps) {
  const [showSnippets, setShowSnippets] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertSnippet = useCallback(
    (code: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value ? value + '\n\n' + code : code);
        setShowSnippets(false);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
      const newValue = before + prefix + code + after;
      onChange(newValue);
      setShowSnippets(false);

      // Set cursor after inserted snippet
      requestAnimationFrame(() => {
        const pos = start + prefix.length + code.length;
        textarea.selectionStart = pos;
        textarea.selectionEnd = pos;
        textarea.focus();
      });
    },
    [value, onChange]
  );

  const lineCount = (value || '').split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 8) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-100 dark:border-surface-700/50 bg-surface-50/30 dark:bg-surface-900/30">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-surface-400" />
          <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">
            {label}
          </span>
        </div>

        {/* Snippets dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSnippets(!showSnippets)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Snippets
            <ChevronDown className={cn('w-3 h-3 transition-transform', showSnippets && 'rotate-180')} />
          </button>

          {showSnippets && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSnippets(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-xl py-1 max-h-72 overflow-y-auto">
                {snippets.map((snippet) => (
                  <button
                    key={snippet.name}
                    onClick={() => insertSnippet(snippet.code)}
                    className="w-full px-3 py-2 text-left hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
                  >
                    <p className="text-xs font-medium text-surface-700 dark:text-surface-200">
                      {snippet.name}
                    </p>
                    <p className="text-[10px] font-mono text-surface-400 mt-0.5 truncate">
                      {snippet.code.split('\n')[0]}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-auto min-h-0">
        {/* Line numbers */}
        <div className="flex-shrink-0 py-3 pl-3 pr-2 select-none border-r border-surface-100 dark:border-surface-700/30 bg-surface-50/50 dark:bg-surface-900/20">
          {lineNumbers.map((n) => (
            <div
              key={n}
              className="text-[10px] font-mono text-surface-300 dark:text-surface-600 leading-[20px] text-right min-w-[20px]"
            >
              {n}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(
            'flex-1 py-3 px-3 font-mono text-xs leading-[20px] resize-none',
            'bg-transparent text-surface-800 dark:text-surface-200',
            'placeholder:text-surface-300 dark:placeholder:text-surface-600',
            'focus:outline-none',
            'tab-size-2'
          )}
          style={{ tabSize: 2 }}
          onKeyDown={(e) => {
            // Tab key inserts spaces instead of changing focus
            if (e.key === 'Tab') {
              e.preventDefault();
              const start = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              const newVal = value.slice(0, start) + '  ' + value.slice(end);
              onChange(newVal);
              requestAnimationFrame(() => {
                e.currentTarget.selectionStart = start + 2;
                e.currentTarget.selectionEnd = start + 2;
              });
            }
          }}
        />
      </div>
    </div>
  );
}
