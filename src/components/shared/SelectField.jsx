export default function SelectField({ label, options, ...props }) {
    return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label} {props.required && '*'}</label><select {...props} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-naranja">{options.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>;
}
