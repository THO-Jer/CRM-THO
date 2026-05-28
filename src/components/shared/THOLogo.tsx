interface THOLogoProps {
    size?: number
    className?: string
}

export default function THOLogo({ size = 40, className = '' }: THOLogoProps) {
    return (
        <svg viewBox="0 0 380 140" width={size * 2.7} height={size} className={className} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="thoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#667eea', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#764ba2', stopOpacity: 1 }} />
                </linearGradient>
                <linearGradient id="thoHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#a8edea', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#fed6e3', stopOpacity: 1 }} />
                </linearGradient>
                <filter id="thoShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.2" />
                </filter>
            </defs>
            {/* T */}
            <g filter="url(#thoShadow)">
                <rect x="20" y="35" width="40" height="8" fill="url(#thoGrad)" rx="4" />
                <rect x="36" y="35" width="8" height="40" fill="url(#thoGrad)" rx="4" />
            </g>
            {/* H */}
            <g filter="url(#thoShadow)">
                <rect x="80" y="35" width="8" height="40" fill="url(#thoGrad)" rx="4" />
                <rect x="80" y="51" width="25" height="8" fill="url(#thoGrad)" rx="4" />
                <rect x="97" y="35" width="8" height="40" fill="url(#thoGrad)" rx="4" />
            </g>
            {/* Vástago */}
            <g filter="url(#thoShadow)">
                <rect x="105" y="54" width="130" height="12" fill="url(#thoGrad)" rx="6" />
                <rect x="105" y="54" width="130" height="4" fill="url(#thoHighlight)" rx="6" opacity="0.6" />
            </g>
            {/* Dientes decorativos */}
            <g filter="url(#thoShadow)">
                <rect x="75" y="70" width="18" height="6" fill="url(#thoGrad)" rx="3" />
                <rect x="35" y="70" width="15" height="6" fill="url(#thoGrad)" rx="3" />
                <rect x="25" y="25" width="12" height="6" fill="url(#thoGrad)" rx="3" />
                <rect x="85" y="25" width="12" height="6" fill="url(#thoGrad)" rx="3" />
                <rect x="40" y="20" width="6" height="8" fill="url(#thoGrad)" rx="3" />
                <rect x="88" y="20" width="6" height="8" fill="url(#thoGrad)" rx="3" />
            </g>
            {/* O */}
            <g filter="url(#thoShadow)">
                <circle cx="285" cy="60" r="42" fill="url(#thoGrad)" />
                <circle cx="285" cy="60" r="26" fill="white" />
                <circle cx="285" cy="60" r="42" fill="none" stroke="url(#thoHighlight)" strokeWidth="4" opacity="0.7" />
                <circle cx="280" cy="55" r="8" fill="rgba(255,255,255,0.4)" />
            </g>
            {/* Líneas decorativas */}
            <g opacity="0.3">
                <line x1="110" y1="58" x2="230" y2="58" stroke="url(#thoHighlight)" strokeWidth="1" />
                <line x1="110" y1="62" x2="230" y2="62" stroke="url(#thoHighlight)" strokeWidth="1" />
            </g>
        </svg>
    )
}
