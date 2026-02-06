import { BarChart3, TrendingUp } from 'lucide-react';

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Analytics
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Deep dive into your API performance metrics
        </p>
      </div>

      <div className="card text-center py-12">
        <BarChart3 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Analytics Dashboard
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Detailed analytics coming soon
        </p>
      </div>
    </div>
  );
}
