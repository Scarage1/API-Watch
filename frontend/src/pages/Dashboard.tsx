import { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { testHistory } = useAppStore();
  const [stats, setStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    successRate: 0,
    avgResponseTime: 0,
  });

  useEffect(() => {
    if (testHistory.length > 0) {
      const successful = testHistory.filter((t) => t.success).length;
      const failed = testHistory.length - successful;
      const avgTime =
        testHistory.reduce((acc, t) => acc + t.response_time, 0) /
        testHistory.length;

      setStats({
        total: testHistory.length,
        successful,
        failed,
        successRate: (successful / testHistory.length) * 100,
        avgResponseTime: avgTime,
      });
    }
  }, [testHistory]);

  const recentTests = testHistory.slice(0, 10);

  const statCards = [
    {
      title: 'Total Requests',
      value: stats.total,
      icon: Activity,
      color: 'blue',
      change: '+12%',
    },
    {
      title: 'Successful',
      value: stats.successful,
      icon: CheckCircle2,
      color: 'green',
      change: '+5%',
    },
    {
      title: 'Failed',
      value: stats.failed,
      icon: XCircle,
      color: 'red',
      change: '-2%',
    },
    {
      title: 'Avg Response Time',
      value: `${stats.avgResponseTime.toFixed(0)}ms`,
      icon: Clock,
      color: 'purple',
      change: '-8%',
    },
  ];

  const chartData = testHistory
    .slice(0, 20)
    .reverse()
    .map((test, idx) => ({
      name: `#${idx + 1}`,
      time: test.response_time * 1000, // Convert to ms
      success: test.success ? 1 : 0,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Monitor your API testing performance and insights
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {stat.title}
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  {stat.change} from last week
                </p>
              </div>
              <div
                className={`p-3 rounded-lg bg-${stat.color}-100 dark:bg-${stat.color}-900/20`}
              >
                <stat.icon
                  className={`w-6 h-6 text-${stat.color}-600 dark:text-${stat.color}-400`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Response Time Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Response Time Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                }}
              />
              <Line
                type="monotone"
                dataKey="time"
                stroke="#667eea"
                strokeWidth={2}
                dot={{ fill: '#667eea' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Success Rate Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Success Rate
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: '#fff',
                }}
              />
              <Bar dataKey="success" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Tests */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Tests
          </h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {recentTests.length === 0 ? (
            <div className="p-6 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                No tests executed yet. Run your first test to see results here.
              </p>
            </div>
          ) : (
            recentTests.map((test, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {test.success ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-mono text-sm text-gray-900 dark:text-white">
                        {test.request_method} {test.request_url}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(test.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded font-medium ${
                        test.success
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                      }`}
                    >
                      {test.status_code || 'N/A'}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {(test.response_time * 1000).toFixed(0)}ms
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
