export default function InputField({ label, ...props }) {
    return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label} {props.required && '*'}</label><input {...props} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-naranja" /></div>;
}
