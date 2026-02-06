import { useState, useRef } from 'react';
import {
  Download,
  Upload,
  FileJson,
  X,
  CheckCircle2,
  AlertCircle,
  FolderDown,
  FolderUp,
  Layers,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { apiClient } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { useEnvironmentStore, type EnvironmentEntry } from '../store/useEnvironmentStore';
import type { TestSuite } from '../types';

type ImportType = 'collection' | 'environment' | 'postman';

interface ImportExportPanelProps {
  onClose: () => void;
}

interface ImportResult {
  success: boolean;
  message: string;
}

/* ──────── Postman v2.1 → API-Watch conversion ──────── */

interface PostmanItem {
  name: string;
  request?: {
    method: string;
    url: {
      raw?: string;
      protocol?: string;
      host?: string[];
      path?: string[];
      query?: { key: string; value: string }[];
    } | string;
    header?: { key: string; value: string }[];
    body?: {
      mode?: string;
      raw?: string;
    };
  };
  item?: PostmanItem[];
}

interface PostmanCollection {
  info: { name: string; description?: string; schema?: string };
  item: PostmanItem[];
  variable?: { key: string; value: string }[];
}

function convertPostmanToSuite(pm: PostmanCollection): TestSuite {
  const flattenItems = (items: PostmanItem[]): PostmanItem[] => {
    const flat: PostmanItem[] = [];
    for (const item of items) {
      if (item.request) flat.push(item);
      if (item.item) flat.push(...flattenItems(item.item));
    }
    return flat;
  };

  const items = flattenItems(pm.item);

  const resolveUrl = (url: PostmanItem['request'] extends undefined ? never : NonNullable<PostmanItem['request']>['url']): string => {
    if (typeof url === 'string') return url;
    if (url?.raw) return url.raw;
    const proto = url?.protocol || 'https';
    const host = url?.host?.join('.') || 'localhost';
    const path = url?.path?.join('/') || '';
    return `${proto}://${host}/${path}`;
  };

  // Try to find a common base URL
  const urls = items.map((i) => {
    const raw = i.request ? resolveUrl(i.request.url) : '';
    try {
      const u = new URL(raw);
      return u.origin;
    } catch {
      return '';
    }
  });
  const baseUrl = urls[0] || 'https://api.example.com';

  return {
    name: pm.info.name || 'Imported Collection',
    description: pm.info.description || 'Imported from Postman',
    base_url: baseUrl,
    tests: items.map((item, idx) => {
      const req = item.request!;
      const rawUrl = resolveUrl(req.url);
      let path = rawUrl;
      try {
        const u = new URL(rawUrl);
        path = u.pathname + u.search;
      } catch { /* keep raw */ }

      const headers: Record<string, string> = {};
      req.header?.forEach((h) => { headers[h.key] = h.value; });

      return {
        id: `imported-${idx + 1}`,
        method: req.method || 'GET',
        path,
        description: item.name || '',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: req.body?.raw || undefined,
      };
    }),
  };
}

export default function ImportExportPanel({ onClose }: ImportExportPanelProps) {
  const { testSuites, addTestSuite } = useAppStore();
  const { environments, createEnvironment } = useEnvironmentStore();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importType, setImportType] = useState<ImportType>('collection');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ──────── Export ──────── */

  const exportCollections = () => {
    const data = {
      version: '1.0',
      type: 'api-watch-collections',
      exported_at: new Date().toISOString(),
      collections: testSuites,
    };
    downloadJson(data, 'api-watch-collections');
  };

  const exportEnvironments = () => {
    const data = {
      version: '1.0',
      type: 'api-watch-environments',
      exported_at: new Date().toISOString(),
      environments: environments.map((e) => ({
        name: e.name,
        variables: e.variables,
      })),
    };
    downloadJson(data, 'api-watch-environments');
  };

  const exportAll = () => {
    const data = {
      version: '1.0',
      type: 'api-watch-full-export',
      exported_at: new Date().toISOString(),
      collections: testSuites,
      environments: environments.map((e) => ({
        name: e.name,
        variables: e.variables,
      })),
    };
    downloadJson(data, 'api-watch-full-backup');
  };

  const downloadJson = (data: unknown, prefix: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ──────── Import ──────── */

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (importType === 'postman') {
        importPostman(data);
      } else if (importType === 'collection') {
        importCollection(data);
      } else {
        importEnvironment(data);
      }
    } catch {
      setResult({ success: false, message: 'Failed to parse JSON file' });
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const importCollection = (data: unknown) => {
    try {
      const obj = data as Record<string, unknown>;

      // API-Watch format
      if (obj.type === 'api-watch-collections' && Array.isArray(obj.collections)) {
        let count = 0;
        for (const suite of obj.collections) {
          if (suite.name && suite.base_url && Array.isArray(suite.tests)) {
            addTestSuite(suite as TestSuite);
            count++;
          }
        }
        setResult({ success: true, message: `Imported ${count} collection(s)` });
        return;
      }

      // Full backup format
      if (obj.type === 'api-watch-full-export') {
        let colCount = 0;
        let envCount = 0;
        if (Array.isArray(obj.collections)) {
          for (const suite of obj.collections) {
            if (suite.name && suite.base_url) {
              addTestSuite(suite as TestSuite);
              colCount++;
            }
          }
        }
        if (Array.isArray(obj.environments)) {
          for (const env of obj.environments as { name: string; variables: Record<string, string> }[]) {
            if (env.name) {
              createEnvironment(env.name, env.variables || {});
              envCount++;
            }
          }
        }
        setResult({ success: true, message: `Imported ${colCount} collection(s) and ${envCount} environment(s)` });
        return;
      }

      // Single suite
      if (obj.name && obj.base_url && Array.isArray(obj.tests)) {
        addTestSuite(obj as TestSuite);
        setResult({ success: true, message: `Imported collection "${obj.name}"` });
        return;
      }

      setResult({ success: false, message: 'Unrecognized collection format' });
    } catch {
      setResult({ success: false, message: 'Invalid collection data' });
    }
  };

  const importEnvironment = async (data: unknown) => {
    try {
      const obj = data as Record<string, unknown>;

      // API-Watch environments format
      if (obj.type === 'api-watch-environments' && Array.isArray(obj.environments)) {
        let count = 0;
        for (const env of obj.environments as { name: string; variables: Record<string, string> }[]) {
          if (env.name) {
            await createEnvironment(env.name, env.variables || {});
            count++;
          }
        }
        setResult({ success: true, message: `Imported ${count} environment(s)` });
        return;
      }

      // Single environment
      if (obj.name && obj.variables && typeof obj.variables === 'object') {
        await createEnvironment(obj.name as string, obj.variables as Record<string, string>);
        setResult({ success: true, message: `Imported environment "${obj.name}"` });
        return;
      }

      setResult({ success: false, message: 'Unrecognized environment format' });
    } catch {
      setResult({ success: false, message: 'Failed to import environment' });
    }
  };

  const importPostman = (data: unknown) => {
    try {
      const pm = data as PostmanCollection;
      if (!pm.info?.name || !Array.isArray(pm.item)) {
        setResult({ success: false, message: 'Not a valid Postman v2.1 collection' });
        return;
      }
      const suite = convertPostmanToSuite(pm);
      addTestSuite(suite);
      setResult({ success: true, message: `Imported Postman collection "${suite.name}" with ${suite.tests.length} requests` });
    } catch {
      setResult({ success: false, message: 'Failed to convert Postman collection' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-700/50">
          <h2 className="text-base font-semibold text-surface-900 dark:text-white flex items-center gap-2">
            <FileJson className="w-4 h-4 text-brand-600" />
            Import / Export
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700">
            <X className="w-4 h-4 text-surface-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-100 dark:border-surface-700/50">
          {[
            { id: 'export' as const, label: 'Export', icon: Download },
            { id: 'import' as const, label: 'Import', icon: Upload },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setResult(null); }}
              className={cn(
                'flex-1 px-4 py-3 text-xs font-medium transition-colors relative',
                activeTab === t.id
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              )}
            >
              <div className="flex items-center justify-center gap-1.5">
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </div>
              {activeTab === t.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-400" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'export' ? (
            <>
              <p className="text-xs text-surface-500">
                Export your data as JSON files for backup or sharing.
              </p>
              <div className="space-y-2">
                <button onClick={exportCollections} className="w-full flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors text-left">
                  <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-900/10">
                    <FolderDown className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900 dark:text-white">Collections</p>
                    <p className="text-[10px] text-surface-400">{testSuites.length} test suite(s)</p>
                  </div>
                </button>
                <button onClick={exportEnvironments} className="w-full flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors text-left">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/10">
                    <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900 dark:text-white">Environments</p>
                    <p className="text-[10px] text-surface-400">{environments.length} environment(s)</p>
                  </div>
                </button>
                <button onClick={exportAll} className="w-full flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors text-left">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/10">
                    <Download className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900 dark:text-white">Full Backup</p>
                    <p className="text-[10px] text-surface-400">Collections + environments</p>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-surface-500">
                Import collections, environments, or Postman v2.1 exports.
              </p>
              <div>
                <label className="text-[10px] font-medium text-surface-400 uppercase tracking-wide mb-2 block">
                  Import Type
                </label>
                <div className="flex gap-1">
                  {[
                    { id: 'collection' as ImportType, label: 'Collection' },
                    { id: 'environment' as ImportType, label: 'Environment' },
                    { id: 'postman' as ImportType, label: 'Postman v2.1' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setImportType(t.id); setResult(null); }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors',
                        importType === t.id
                          ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                          : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleFileSelect}
                className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-700 hover:border-brand-400 dark:hover:border-brand-600 transition-colors cursor-pointer"
              >
                <FolderUp className="w-6 h-6 text-surface-400" />
                <span className="text-xs font-medium text-surface-600 dark:text-surface-300">
                  Click to select a JSON file
                </span>
                <span className="text-[10px] text-surface-400">
                  {importType === 'postman'
                    ? 'Postman v2.1 collection export'
                    : importType === 'environment'
                      ? 'API-Watch environment JSON'
                      : 'API-Watch collection or full backup JSON'
                  }
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          )}

          {/* Result message */}
          {result && (
            <div className={cn(
              'flex items-center gap-2 p-3 rounded-xl text-xs',
              result.success
                ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400'
            )}>
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {result.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
