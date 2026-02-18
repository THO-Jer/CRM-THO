export default function MetricCard({ title, value, subtitle, color }) {
    return (
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-${color} hover:shadow-md transition-shadow`}>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{title}</div>
            <div className={`text-3xl font-bold text-${color} mb-1`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
        </div>
    );
}
