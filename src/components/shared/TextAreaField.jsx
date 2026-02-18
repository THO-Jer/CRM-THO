export default function TextAreaField({ label, ...props }) {
    return <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label><textarea {...props} rows="3" className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-naranja placeholder:text-gray-400 dark:placeholder:text-gray-500" /></div>;
}
