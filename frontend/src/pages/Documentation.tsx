/**
 * API Documentation page.
 * Auto-generate documentation from collections and export as Markdown or HTML.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FileText, Download, Loader2, RefreshCw, Eye, Code2, Copy, Check,
} from 'lucide-react';
import { cn } from '../lib/utils';
import apiClient from '../lib/api';
import { generateDocumentation } from '../lib/docGenerator';
import type { DocSection, GeneratedDoc } from '../lib/docGenerator';
import { toast } from '../store/useToastStore';

interface Collection {
  id: string;
  name: string;
  description: string | null;
  requests: {
    id: string;
    name: string;
    description: string | null;
    method: string;
    url: string;
    headers: Record<string, string> | null;
    params: Record<string, string> | null;
    body: string | null;
    body_type: string;
  }[];
}

export default function Documentation() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [doc, setDoc] = useState<GeneratedDoc | null>(null);
  const [view, setView] = useState<'preview' | 'markdown'>('preview');
  const [copied, setCopied] = useState(false);

  const [title, setTitle] = useState('API Documentation');
  const [description, setDescription] = useState('Auto-generated from API-Watch collections');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());

  const loadCollections = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/collections');
      const colls: Collection[] = [];
      for (const c of res.data) {
        const detail = await apiClient.get(`/api/v1/collections/${c.id}`);
        colls.push(detail.data);
      }
      setCollections(colls);
      setSelectedCollections(new Set(colls.map((c) => c.id)));
    } catch {
      toast.error('Failed to load', 'Could not fetch collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  const generate = useCallback(() => {
    setGenerating(true);

    const sections: DocSection[] = collections
      .filter((c) => selectedCollections.has(c.id))
      .map((c) => ({
        name: c.name,
        description: c.description || undefined,
        endpoints: (c.requests || []).map((r) => ({
          method: r.method,
          url: r.url,
          name: r.name,
          description: r.description || undefined,
          headers: r.headers || undefined,
          params: r.params || undefined,
          body: r.body || undefined,
          bodyType: r.body_type,
        })),
      }));

    if (sections.length === 0) {
      toast.warning('No collections selected', 'Select at least one collection');
      setGenerating(false);
      return;
    }

    const result = generateDocumentation(title, description, baseUrl, sections);
    setDoc(result);
    setGenerating(false);
    toast.success('Generated', `${result.endpointCount} endpoints documented`);
  }, [collections, selectedCollections, title, description, baseUrl]);

  const downloadMarkdown = () => {
    if (!doc) return;
    const blob = new Blob([doc.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-documentation.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHtml = () => {
    if (!doc) return;
    const blob = new Blob([doc.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-documentation.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMarkdown = () => {
    if (!doc) return;
    navigator.clipboard.writeText(doc.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleCollection = (id: string) => {
    setSelectedCollections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600" />
            API Documentation
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            Auto-generate API docs from your collections
          </p>
        </div>
      </div>

      {/* Config panel */}
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-medium text-surface-500 mb-1">Document Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-surface-500 mb-1">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-surface-500 mb-1">Base URL</label>
            <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm outline-none" />
          </div>
        </div>

        {/* Collection picker */}
        <div>
          <label className="block text-[11px] font-medium text-surface-500 mb-2">Collections to Include</label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-surface-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading collections…
            </div>
          ) : collections.length === 0 ? (
            <p className="text-xs text-surface-400">No collections found. Create a collection first.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {collections.map((c) => (
                <label key={c.id} className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors', selectedCollections.has(c.id) ? 'border-brand-300 dark:border-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'border-surface-200 dark:border-surface-700')}>
                  <input type="checkbox" checked={selectedCollections.has(c.id)} onChange={() => toggleCollection(c.id)} className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-surface-700 dark:text-surface-300 truncate">{c.name}</p>
                    <p className="text-[10px] text-surface-400">{c.requests?.length || 0} requests</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={generate}
          disabled={generating || selectedCollections.size === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Generate Documentation
        </button>
      </div>

      {/* Generated output */}
      {doc && (
        <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
            <div className="flex items-center gap-2">
              <div className="flex bg-surface-100 dark:bg-surface-800 rounded-lg p-0.5">
                {(['preview', 'markdown'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', view === v ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' : 'text-surface-500')}
                  >
                    {v === 'preview' ? <Eye className="w-3 h-3 inline mr-1" /> : <Code2 className="w-3 h-3 inline mr-1" />}
                    {v === 'preview' ? 'Preview' : 'Markdown'}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-surface-400">
                {doc.sectionCount} sections · {doc.endpointCount} endpoints
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={copyMarkdown} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-colors">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} Copy
              </button>
              <button onClick={downloadMarkdown} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-colors">
                <Download className="w-3 h-3" /> .md
              </button>
              <button onClick={downloadHtml} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-colors">
                <Download className="w-3 h-3" /> .html
              </button>
            </div>
          </div>

          <div className="max-h-[600px] overflow-auto">
            {view === 'preview' ? (
              <iframe
                srcDoc={doc.html}
                title="API Documentation Preview"
                className="w-full h-[600px] border-0"
                sandbox="allow-same-origin"
              />
            ) : (
              <pre className="px-4 py-3 text-xs font-mono text-surface-700 dark:text-surface-300 whitespace-pre-wrap">{doc.markdown}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
