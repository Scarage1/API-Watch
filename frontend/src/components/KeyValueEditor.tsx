import { Plus, X, ToggleLeft, ToggleRight, AlignJustify, Table2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';
import type { KeyValuePair } from '../store/useRequestStore';
import { uid } from '../store/useRequestStore';

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Show a "Bulk Edit" toggle (plain text mode) */
  allowBulkEdit?: boolean;
}

export default function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  allowBulkEdit = true,
}: KeyValueEditorProps) {
  const [bulkMode, setBulkMode] = useState(false);

  // ── Bulk edit text ↔ pairs conversion ──
  const toBulkText = (): string =>
    pairs
      .filter((p) => p.key || p.value)
      .map((p) => `${p.key}: ${p.value}`)
      .join('\n');

  const fromBulkText = (text: string): KeyValuePair[] => {
    const result: KeyValuePair[] = text
      .split('\n')
      .filter((line) => line.includes(':'))
      .map((line) => {
        const idx = line.indexOf(':');
        return {
          id: uid(),
          key: line.slice(0, idx).trim(),
          value: line.slice(idx + 1).trim(),
          enabled: true,
        };
      });
    if (result.length === 0 || result[result.length - 1].key) {
      result.push({ id: uid(), key: '', value: '', enabled: true });
    }
    return result;
  };

  const updatePair = (id: string, field: keyof KeyValuePair, value: string | boolean) => {
    let updated = pairs.map((p) => (p.id === id ? { ...p, [field]: value } : p));
    // Auto-add empty row at the end
    const last = updated[updated.length - 1];
    if (last && (last.key || last.value)) {
      updated = [...updated, { id: uid(), key: '', value: '', enabled: true }];
    }
    onChange(updated);
  };

  const removePair = (id: string) => {
    const updated = pairs.filter((p) => p.id !== id);
    if (updated.length === 0) {
      onChange([{ id: uid(), key: '', value: '', enabled: true }]);
    } else {
      onChange(updated);
    }
  };

  const addPair = () => {
    onChange([...pairs, { id: uid(), key: '', value: '', enabled: true }]);
  };

  if (bulkMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Bulk Edit</span>
          <button
            onClick={() => setBulkMode(false)}
            className="btn-ghost !py-1 !px-2 !text-[10px] gap-1"
          >
            <Table2 className="w-3 h-3" />
            Table View
          </button>
        </div>
        <textarea
          defaultValue={toBulkText()}
          onBlur={(e) => onChange(fromBulkText(e.target.value))}
          placeholder={`${keyPlaceholder}: ${valuePlaceholder}\nContent-Type: application/json`}
          className="input font-mono text-xs !rounded-xl"
          rows={6}
        />
        <p className="text-[10px] text-surface-400">One pair per line, format: <code className="text-brand-500">key: value</code></p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-4 flex-1">
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider w-5" />
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider flex-1">{keyPlaceholder}</span>
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider flex-1">{valuePlaceholder}</span>
          <span className="w-7" />
        </div>
        {allowBulkEdit && (
          <button
            onClick={() => setBulkMode(true)}
            className="btn-ghost !py-1 !px-2 !text-[10px] gap-1"
          >
            <AlignJustify className="w-3 h-3" />
            Bulk Edit
          </button>
        )}
      </div>

      {/* Rows */}
      {pairs.map((pair) => (
        <div
          key={pair.id}
          className={cn(
            'flex items-center gap-2 group transition-opacity',
            !pair.enabled && 'opacity-40'
          )}
        >
          {/* Enable/disable toggle */}
          <button
            onClick={() => updatePair(pair.id, 'enabled', !pair.enabled)}
            className="p-0.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800 flex-shrink-0"
            title={pair.enabled ? 'Disable' : 'Enable'}
          >
            {pair.enabled ? (
              <ToggleRight className="w-4 h-4 text-brand-500" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-surface-400" />
            )}
          </button>

          {/* Key */}
          <input
            type="text"
            value={pair.key}
            onChange={(e) => updatePair(pair.id, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className="input !py-1.5 text-xs font-mono flex-1"
          />

          {/* Value */}
          <input
            type="text"
            value={pair.value}
            onChange={(e) => updatePair(pair.id, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className="input !py-1.5 text-xs font-mono flex-1"
          />

          {/* Delete */}
          <button
            onClick={() => removePair(pair.id)}
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/10 text-surface-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Add row button */}
      <button
        onClick={addPair}
        className="btn-ghost !py-1 !px-2 !text-[10px] text-brand-600 dark:text-brand-400 mt-1"
      >
        <Plus className="w-3 h-3" />
        Add
      </button>
    </div>
  );
}
