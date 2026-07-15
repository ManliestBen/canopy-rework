/** Inline stroke icons — self-contained (kiosk may be offline), sized by CSS. */

type IconProps = { className?: string };

function Svg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const ChoresIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 3 9.5 12.5" />
    <path d="M11 10.5 5.5 16a3.5 3.5 0 0 0-1 2.5L4 21l2.5-.5a3.5 3.5 0 0 0 2.5-1L14.5 14" />
    <path d="m16 6 2 2" />
  </Svg>
);

export const RewardsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8 6.6 19.6l1-6L3.3 9.4l6-.9L12 3Z" />
  </Svg>
);

export const MealsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3v8M4 3v4a3 3 0 0 0 6 0V3M7 11v10" />
    <path d="M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v8M17 3v10" />
  </Svg>
);

export const PhotosIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="9" cy="10" r="2" />
    <path d="m3 17 5-4 3 2 4-3 6 5" />
  </Svg>
);

export const ListsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
  </Svg>
);

export const SleepIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5Z" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.07-.4.1-.8.1-1.2Z" />
  </Svg>
);

export const TodosIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
