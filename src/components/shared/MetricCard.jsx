export default function MetricCard({ title, value, subtitle, color }) {
    return (
        <div className={`bg-white rounded-lg shadow p-6 border-l-4 border-${color} hover:shadow-md transition-shadow`}>
            <div className="text-sm text-gray-600 mb-2">{title}</div>
            <div className={`text-3xl font-bold text-${color} mb-1`}>{value}</div>
            <div className="text-xs text-gray-500">{subtitle}</div>
        </div>
    );
}
