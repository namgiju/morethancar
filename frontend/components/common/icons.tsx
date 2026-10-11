// Thin line icons for the main page (replaces the emoji icons the old page
// used). Decorative: every usage sits next to a text label, so they are
// aria-hidden and inherit `currentColor`.
import type {ServiceKey} from '../../lib/services';

type IconProps = {size?: number; className?: string};

function Svg({size = 20, className, children}: IconProps & {children: React.ReactNode}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);

export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
);

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const CarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 14.5 5.3 9.6A2 2 0 0 1 7.2 8.3h9.6a2 2 0 0 1 1.9 1.3l1.8 4.9" />
    <path d="M3 14.5h18v3.2a.8.8 0 0 1-.8.8H3.8a.8.8 0 0 1-.8-.8v-3.2Z" />
    <circle cx="7.5" cy="16.5" r=".6" />
    <circle cx="16.5" cy="16.5" r=".6" />
  </Svg>
);

export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h13l-2.5 4L18 12H5" />
    <path d="M9 4v8M13 4v8M5 8h13" />
  </Svg>
);

const SERVICE_ICONS: Record<ServiceKey, (p: IconProps) => React.ReactNode> = {
  community: (p) => (
    <Svg {...p}>
      <path d="M4 5.5h16v10H9l-5 4v-14Z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </Svg>
  ),
  garage: (p) => (
    <Svg {...p}>
      <path d="M3 10.5 12 4l9 6.5V20H3v-9.5Z" />
      <path d="M7 20v-7h10v7M7 16h10" />
    </Svg>
  ),
  motorsport: FlagIcon,
  ev: (p) => (
    <Svg {...p}>
      <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />
    </Svg>
  ),
  spots: (p) => (
    <Svg {...p}>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Svg>
  ),
};

export function ServiceIcon({service, ...p}: IconProps & {service: ServiceKey}) {
  const Icon = SERVICE_ICONS[service];
  return <Icon {...p} />;
}
