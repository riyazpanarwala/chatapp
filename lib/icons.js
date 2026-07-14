'use client';

/**
 * Lightweight line-icon set for FluxChat.
 * Consistent stroke width / cap style, sized via `size`, colored via `currentColor`
 * so they automatically pick up the color of whatever button/text wraps them.
 * Kept as plain inline SVG so no extra dependency is needed.
 */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ size = 18, children, style, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, ...style }}
      {...base}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function MessageIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 12a8 8 0 0 1-8 8H5.5a1 1 0 0 1-.8-1.6l1.3-1.7A8 8 0 1 1 21 12Z" />
    </Svg>
  );
}

export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2.2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </Svg>
  );
}

export function MailIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" />
      <path d="m4.5 7 7.1 5.6a1 1 0 0 0 1.2 0L19.9 7" />
    </Svg>
  );
}

export function PlusIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function XIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function PinIcon(props) {
  return (
    <Svg {...props}>
      <path d="M14.5 3.5 20 9l-2 2-1.4-.3L13 14.3 13.6 19 12 20.5 9 16 4 21l-.5-.5L8 15.6 3.7 12.6 5.2 11l4.5.6 3.6-3.6-.3-1.5Z" />
    </Svg>
  );
}

export function SmileIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 10.2h.01M15.5 10.2h.01" strokeWidth="2.4" />
      <path d="M8.2 14a4.6 4.6 0 0 0 7.6 0" />
    </Svg>
  );
}

export function EditIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 20h4.2L19 9.2a2.3 2.3 0 0 0-3.2-3.2L5 16.8Z" />
      <path d="m14.1 6.9 3 3" />
    </Svg>
  );
}

export function TrashIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M18 7l-.8 12a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function CheckIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </Svg>
  );
}

export function CheckCheckIcon(props) {
  return (
    <Svg {...props}>
      <path d="m2.5 12.5 4.5 4.5L16 8" />
      <path d="m10 13 2.5 2.5L22 6" />
    </Svg>
  );
}

export function ClockIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function SearchIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m20 20-4.4-4.4" />
    </Svg>
  );
}

export function PaperclipIcon(props) {
  return (
    <Svg {...props}>
      <path d="M17.5 8.5 9.9 16.1a3 3 0 1 1-4.2-4.2l8.6-8.6a2 2 0 1 1 2.8 2.8L8.6 14.6a1 1 0 1 1-1.4-1.4L14.8 6" />
    </Svg>
  );
}

export function MicIcon(props) {
  return (
    <Svg {...props}>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3" />
    </Svg>
  );
}

export function StopIcon(props) {
  return (
    <Svg {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function MonitorIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.8" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </Svg>
  );
}

export function VideoIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="6.5" width="12.5" height="11" rx="2.2" />
      <path d="M15.5 10.5 21 7v10l-5.5-3.5Z" />
    </Svg>
  );
}

export function VideoOffIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 3.5 20.5 21" />
      <path d="M15.5 8v-.5a2 2 0 0 0-2-2H5A2 2 0 0 0 3 7.5v9c0 .6.24 1.14.63 1.53M8.5 17.5H13.5a2 2 0 0 0 2-2v-3" />
      <path d="M15.5 10.5 21 7v10l-5.5-3.5" />
    </Svg>
  );
}

export function SendIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4.5 12 20 4.5 12.8 20l-2-6.8-6.3-1.2Z" />
      <path d="M11 13.2 20 4.5" />
    </Svg>
  );
}

export function BellIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 3.4.9 5 1.8 6.2H4.2C5.1 14.5 6 12.9 6 9.5Z" />
      <path d="M9.8 19a2.3 2.3 0 0 0 4.4 0" />
    </Svg>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function MoreIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SignalIcon(props) {
  // The FluxChat signature mark: rising signal bars.
  return (
    <Svg {...props} strokeWidth="2.2">
      <path d="M4 17V13" />
      <path d="M9.5 17V9" />
      <path d="M15 17V6" />
      <path d="M20 17v-3.5" />
    </Svg>
  );
}
