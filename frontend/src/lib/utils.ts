import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function getStatusColor(statusCode: number | null): string {
  if (!statusCode) return 'gray';
  if (statusCode >= 200 && statusCode < 300) return 'green';
  if (statusCode >= 300 && statusCode < 400) return 'blue';
  if (statusCode >= 400 && statusCode < 500) return 'orange';
  return 'red';
}

export function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: 'green',
    POST: 'blue',
    PUT: 'orange',
    DELETE: 'red',
    PATCH: 'purple',
  };
  return colors[method.toUpperCase()] || 'gray';
}
