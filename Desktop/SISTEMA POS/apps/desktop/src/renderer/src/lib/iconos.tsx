// Iconos de linea simples (estilo Material/Lucide), en currentColor para que
// tomen el color del contenedor. Reemplazan a los emojis para una apariencia
// mas profesional.
interface Props {
  size?: number;
  className?: string;
}

function base(size = 20) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function IconoInfo({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M14 4v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

export function IconoPrecio({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  );
}

export function IconoImagen({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m21 16-4.5-4.5a2 2 0 0 0-2.8 0L4 21" />
    </svg>
  );
}

export function IconoInventario({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

export function IconoVariantes({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
    </svg>
  );
}

export function IconoSucursal({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 9 5 4h14l2 5" />
      <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M3 9h18" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}

export function IconoEtiqueta({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 4h11l7 7-8 8-7-7V4Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  );
}

export function IconoColeccion({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 7h6l2 2h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
    </svg>
  );
}

export function IconoBasura({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconoEstrella({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8L3.5 9.2l5.9-.9L12 3Z" />
    </svg>
  );
}

export function IconoMas({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconoChevronIzq({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function IconoChevronDer({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconoCheck({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconoReloj({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconoCalendario({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}

export function IconoAlerta({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </svg>
  );
}

export function IconoOjo({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconoOjoTachado({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4" />
      <path d="M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function IconoDinero({ size, className }: Props) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4M18 10v4" />
    </svg>
  );
}
