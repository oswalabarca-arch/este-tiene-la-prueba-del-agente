// Custom strawberry icon for Cosecha module
export function Strawberry({ size = 18, color = "currentColor", ...props }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color} {...props}>
      {/* Hojas del cáliz */}
      <path
        d="M12 2 L8 6 L10 6 L7 8 L11 8 L9 10 L12 9 L15 10 L13 8 L17 8 L14 6 L16 6 Z"
        fill={color}
        opacity="0.9"
      />
      {/* Cuerpo de fresa */}
      <path
        d="M6.5 10 Q6.5 8.5 12 8.5 Q17.5 8.5 17.5 10 Q17.5 17 12 21.5 Q6.5 17 6.5 10 Z"
        fill={color}
      />
      {/* Semillas (puntos blancos sobre la fresa) */}
      <circle cx="9.5" cy="12" r="0.55" fill="#fff" />
      <circle cx="14.5" cy="12" r="0.55" fill="#fff" />
      <circle cx="12" cy="14" r="0.55" fill="#fff" />
      <circle cx="10" cy="16" r="0.55" fill="#fff" />
      <circle cx="14" cy="16" r="0.55" fill="#fff" />
      <circle cx="12" cy="18" r="0.55" fill="#fff" />
    </svg>
  );
}
