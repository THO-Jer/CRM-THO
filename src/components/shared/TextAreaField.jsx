export default function TextAreaField({ label, ...props }) {
    return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><textarea {...props} rows="3" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-naranja" /></div>;
}
