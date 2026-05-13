/**
 * useCopyToClipboard — copy text to clipboard with transient success state.
 *
 * Usage:
 *   const { copy, copied } = useCopyToClipboard();
 *   <button onClick={() => copy(code)}>{copied ? 'Copied!' : 'Copy'}</button>
 */
import { useState, useCallback } from 'react';

interface UseCopyResult {
  copy: (text: string) => Promise<void>;
  copied: boolean;
}

export function useCopyToClipboard(resetMs: number = 2000): UseCopyResult {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
      } catch {
        // Fallback for older browsers
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
      }
    },
    [resetMs]
  );

  return { copy, copied };
}

export default useCopyToClipboard;
