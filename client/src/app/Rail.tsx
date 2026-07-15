import { NavLink } from 'react-router-dom';
import {
  CalendarIcon,
  ChoresIcon,
  ListsIcon,
  MealsIcon,
  PhotosIcon,
  RewardsIcon,
  SettingsIcon,
  SleepIcon,
  TodosIcon,
} from './icons';

const NAV = [
  { to: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { to: '/chores', label: 'Chores', Icon: ChoresIcon },
  { to: '/rewards', label: 'Rewards', Icon: RewardsIcon },
  { to: '/todos', label: 'To-Dos', Icon: TodosIcon },
  { to: '/meals', label: 'Meals', Icon: MealsIcon },
  { to: '/lists', label: 'Lists', Icon: ListsIcon },
  { to: '/photos', label: 'Photos', Icon: PhotosIcon },
  { to: '/sleep', label: 'Sleep', Icon: SleepIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

export function Rail() {
  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-brand" aria-hidden="true">
        C
      </div>
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
