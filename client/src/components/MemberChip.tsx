import type { User } from '@canopy/shared';

/**
 * The colored avatar circle from the Skylight reference — used in the
 * header, on event pills, chore columns, and list assignees.
 */
export function MemberChip({
  user,
  size = 36,
  selected,
  onClick,
}: {
  user: User;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const label = user.avatar || user.name.charAt(0).toUpperCase();
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.44,
    background: `var(--family-${user.color})`,
    outline: selected ? '3px solid var(--accent)' : undefined,
    outlineOffset: 2,
  };
  if (onClick) {
    return (
      <button
        type="button"
        className="member-chip member-chip-button"
        style={style}
        onClick={onClick}
        aria-pressed={selected}
        title={user.name}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="member-chip" style={style} title={user.name}>
      {label}
    </span>
  );
}
