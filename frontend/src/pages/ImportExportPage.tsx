import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  Download,
  FileJson,
  FileCode,
  FileText,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  ArrowRight,
} from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface Collection {
  id: string;
  name: string;
  description: string;
  request_count?: number;
}

export default function ImportExportPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCollections = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/collections');
      setCollections(res.data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleImportPostman = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setImportResult(null);
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/import-export/import/postman', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult({ success: true, message: `Successfully imported "${file.name}"` });
      fetchCollections();
    } catch {
      setImportResult({ success: false, message: `Failed to import "${file.name}"` });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (collectionId: string, format: 'postman' | 'openapi') => {
    try {
      setExporting(`${collectionId}-${format}`);
      const res = await api.get(`/import-export/export/${format}/${collectionId}`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'postman' ? 'postman_collection.json' : 'openapi.json';
      a.download = `${collections.find((c) => c.id === collectionId)?.name ?? 'collection'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently handle
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
          Import &amp; Export
        </h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Import from Postman or export collections as Postman v2.1 and OpenAPI 3.0
        </p>
      </div>

      {/* Import section */}
      <div className="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
        <div className="p-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import
          </h2>
        </div>
        <div className="p-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              importing
                ? 'border-brand-300 bg-brand-50/50 dark:bg-brand-900/10'
                : 'border-surface-200 dark:border-surface-700 hover:border-brand-400 hover:bg-brand-50/30 dark:hover:bg-brand-900/10'
            )}
          >
            <FileJson className="w-10 h-10 mx-auto mb-3 text-surface-400" />
            <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
              {importing ? 'Importing...' : 'Drop a Postman collection file or click to browse'}
            </p>
            <p className="text-xs text-surface-400 mt-1">
              Supports Postman Collection v2.1 format (.json)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportPostman}
              className="hidden"
            />
          </div>

          {/* Import result */}
          {importResult && (
            <div
              className={cn(
                'mt-4 p-3 rounded-xl flex items-center gap-2 text-sm',
                importResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              )}
            >
              {importResult.success ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {importResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Export section */}
      <div className="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
        <div className="p-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="text-sm font-semibold text-surface-700 dark:text-surface-300 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Collections
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-surface-400">Loading collections...</div>
        ) : collections.length === 0 ? (
          <div className="p-8 text-center text-surface-400">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No collections to export</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {collections.map((col) => (
              <div key={col.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 bg-surface-100 dark:bg-surface-800 rounded-lg">
                    <FolderOpen className="w-4 h-4 text-surface-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                      {col.name}
                    </p>
                    {col.description && (
                      <p className="text-xs text-surface-400 truncate">{col.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExport(col.id, 'postman')}
                    disabled={exporting === `${col.id}-postman`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Postman
                  </button>
                  <button
                    onClick={() => handleExport(col.id, 'openapi')}
                    disabled={exporting === `${col.id}-openapi`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 disabled:opacity-50 transition-colors"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    OpenAPI
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CI/CD guide */}
      <div className="bg-gradient-to-br from-brand-50 to-blue-50 dark:from-brand-900/20 dark:to-blue-900/20 rounded-xl border border-brand-200 dark:border-brand-800 p-6">
        <h3 className="text-sm font-semibold text-brand-800 dark:text-brand-200 flex items-center gap-2">
          <ArrowRight className="w-4 h-4" />
          CI/CD Integration
        </h3>
        <p className="text-sm text-brand-700 dark:text-brand-300 mt-2">
          Use API keys with your CI/CD pipeline to run monitors and export JUnit XML reports.
          Check the <code className="px-1.5 py-0.5 bg-white/60 dark:bg-surface-900/40 rounded text-xs">ci-templates/</code> folder
          for ready-made GitHub Actions and Azure DevOps workflows.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="px-2.5 py-1 bg-white/60 dark:bg-surface-900/40 rounded-lg text-xs font-medium text-brand-700 dark:text-brand-300">
            GitHub Actions
          </span>
          <span className="px-2.5 py-1 bg-white/60 dark:bg-surface-900/40 rounded-lg text-xs font-medium text-brand-700 dark:text-brand-300">
            Azure DevOps
          </span>
          <span className="px-2.5 py-1 bg-white/60 dark:bg-surface-900/40 rounded-lg text-xs font-medium text-brand-700 dark:text-brand-300">
            JUnit XML
          </span>
        </div>
      </div>
    </div>
  );
}
