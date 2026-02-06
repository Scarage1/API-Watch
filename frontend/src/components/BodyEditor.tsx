import { cn } from '../lib/utils';
import KeyValueEditor from './KeyValueEditor';
import type { BodyType, KeyValuePair } from '../store/useRequestStore';
import type { HttpMethod } from '../store/useRequestStore';

interface BodyEditorProps {
  method: HttpMethod;
  bodyType: BodyType;
  bodyRaw: string;
  bodyFormData: KeyValuePair[];
  onBodyTypeChange: (type: BodyType) => void;
  onBodyRawChange: (raw: string) => void;
  onBodyFormDataChange: (pairs: KeyValuePair[]) => void;
}

const bodyTypes: { value: BodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'xml', label: 'XML' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'x-www-form-urlencoded', label: 'URL Encoded' },
];

const rawPlaceholders: Record<string, string> = {
  json: `{
  "key": "value",
  "items": [1, 2, 3]
}`,
  text: 'Plain text body content...',
  xml: `<?xml version="1.0"?>
<root>
  <item>value</item>
</root>`,
};

export default function BodyEditor({
  method,
  bodyType,
  bodyRaw,
  bodyFormData,
  onBodyTypeChange,
  onBodyRawChange,
  onBodyFormDataChange,
}: BodyEditorProps) {
  const noBody = method === 'GET' || method === 'HEAD';

  if (noBody) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-surface-400">
        {method} requests typically don&apos;t have a body
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Type selector */}
      <div className="flex items-center gap-1 flex-wrap">
        {bodyTypes.map((bt) => (
          <button
            key={bt.value}
            onClick={() => onBodyTypeChange(bt.value)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
              bodyType === bt.value
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'
            )}
          >
            {bt.label}
          </button>
        ))}
      </div>

      {/* Body content */}
      {bodyType === 'none' && (
        <div className="flex items-center justify-center py-6 text-xs text-surface-400">
          No body content for this request
        </div>
      )}

      {(bodyType === 'json' || bodyType === 'text' || bodyType === 'xml') && (
        <textarea
          value={bodyRaw}
          onChange={(e) => onBodyRawChange(e.target.value)}
          placeholder={rawPlaceholders[bodyType] || ''}
          className="input font-mono text-xs !rounded-xl leading-relaxed"
          rows={10}
          spellCheck={false}
        />
      )}

      {(bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') && (
        <KeyValueEditor
          pairs={bodyFormData}
          onChange={onBodyFormDataChange}
          keyPlaceholder="Field"
          valuePlaceholder="Value"
          allowBulkEdit={false}
        />
      )}
    </div>
  );
}
