import { useState } from 'react';
import './help.css';

type Section = {
  id: string;
  emoji: string;
  title: string;
  intro?: string;
  tips: { lead: string; body: string }[];
};

const SECTIONS: Section[] = [
  {
    id: 'around',
    emoji: '🧭',
    title: 'Getting around',
    intro:
      'The icon bar on the edge takes you everywhere. The top bar always shows the time, date, and weather — and the colored circles are us: one color per person, everywhere in the app.',
    tips: [
      { lead: 'Tap anything.', body: 'Everything on the panel works by touch — no double-taps, no long-presses required.' },
      { lead: '⚠ Offline badge?', body: 'The internet hiccuped. Canopy keeps showing the last thing it knew and catches up on its own.' },
    ],
  },
  {
    id: 'calendar',
    emoji: '📅',
    title: 'Calendar',
    intro:
      'Every event is a colored pill — the color is the calendar it came from, and the little face shows whose event it is. Long events stretch across days as banners. The red line is "right now."',
    tips: [
      { lead: 'Switch views', body: 'Agenda · Day · Week · 2 Weeks · Month at the top. Agenda is the quick "what\'s next" list. ‹ Today › moves around; Today brings you home.' },
      { lead: 'Add an event', body: 'Tap the blue + button, tap an empty time slot (the time fills itself in), or tap a day\'s name at the top of a column. Emoji in titles encouraged: 🦷⚽🎂' },
      { lead: 'Repeat it', body: 'Set "Repeats" for soccer practice (weekly) or birthdays (yearly). Fancy repeat rules from Google are kept exactly as-is — Canopy never rewrites them.' },
      { lead: 'Just my events', body: 'Tap your circle in the calendar toolbar to spotlight your events. Tap again for everyone.' },
      { lead: 'Edit or delete', body: 'Tap the event → Edit. School and team calendars we subscribe to are read-only — look, don\'t touch.' },
      { lead: 'Weather on the days', body: 'Each day header shows the forecast so you can plan the picnic with confidence.' },
    ],
  },
  {
    id: 'chores',
    emoji: '🧹',
    title: 'Chores',
    intro: 'Everyone gets a column with their chores for the day.',
    tips: [
      { lead: 'Did it? Tap the circle.', body: 'Green ✓ means done, and your progress bar fills up. Tapped by mistake? Tap again to undo.' },
      { lead: 'Stars add up', body: 'Each chore is worth ⭐ that lands on your Rewards page.' },
      { lead: 'Grown-ups', body: '+ Add chore sets the name, icon, person, schedule (daily / weekdays / weekly) and star value. Tap a chore\'s name to edit it.' },
    ],
  },
  {
    id: 'rewards',
    emoji: '⭐',
    title: 'Rewards',
    intro:
      'Your card shows your star balance, this week\'s haul, and your all-time total.',
    tips: [
      { lead: 'Cash in', body: 'Tap "Spend stars", enter how many and what for — "Movie night pick!", "Ice cream run". Recent spending is listed so there are no arguments. 😄' },
    ],
  },
  {
    id: 'todos',
    emoji: '✅',
    title: 'To-Dos',
    intro:
      'The family to-do list, sorted so what matters is on top: Overdue (red!), Today, Coming up, Someday.',
    tips: [
      { lead: 'Add one', body: 'Tap + and give it a person, due date, category — or make it repeat, like "Water plants — weekly".' },
      { lead: 'Check it off', body: 'Tap the circle. Repeating to-dos come back on schedule; checking one only counts for today.' },
      { lead: 'Filter', body: 'Tap a person\'s circle at the top to see just their list.' },
    ],
  },
  {
    id: 'meals',
    emoji: '🍽️',
    title: 'Meals',
    intro: 'The week\'s menu. Tap any box — breakfast, lunch, dinner — to fill it in.',
    tips: [
      { lead: 'Taco trick 🌮', body: 'Type the ingredients in the meal box (one per line) and tap "Add to list" — they land straight on the shopping list.' },
    ],
  },
  {
    id: 'lists',
    emoji: '🛒',
    title: 'Lists',
    intro: 'Groceries, Costco, hardware store — as many lists as we need.',
    tips: [
      { lead: 'Quick add', body: 'Type and hit Add. The suggestion chips are things we buy a lot — one tap re-adds them.' },
      { lead: 'Who\'s buying?', body: 'Tap the little + circle on an item to tag who\'s picking it up.' },
      { lead: 'Done shopping', body: 'Check items off as you shop; "Clear completed" sweeps up afterwards.' },
      { lead: 'From the couch', body: 'Lists are great from a phone — see "From your phone" below.' },
    ],
  },
  {
    id: 'photos',
    emoji: '🖼️',
    title: 'Photos & sleep',
    intro:
      'The Photos page shows our library — tap ▶ Slideshow any time, and pick the album with the folder menu. While photos play, the corner still shows the time, weather, and your next event.',
    tips: [
      { lead: 'Wake it up', body: 'Tap anywhere to come back from the slideshow or a dark screen. It stays awake a few minutes, then drifts back off.' },
      { lead: 'Night schedule', body: 'The Sleep page sets what happens at night — stay on, go dark, or show photos — and between which hours. It can also start the slideshow after the panel sits untouched for a while.' },
    ],
  },
  {
    id: 'timer',
    emoji: '⏱',
    title: 'Timer',
    intro:
      'Tap ⏱ in the top bar. Pick 5/10/15/30 minutes or type your own — big countdown ring, chime at zero.',
    tips: [
      { lead: 'Classic use', body: '"Ten minutes until we leave!" Set it, point at it, done.' },
    ],
  },
  {
    id: 'notes',
    emoji: '📣',
    title: 'Notes',
    intro:
      'Tap 📣 in the top bar to post a sticky note on the main screen: "Dinner\'s ready!", "Dog walked ✓", "Gone to practice."',
    tips: [
      { lead: 'Details', body: 'Pick an emoji, who it\'s from, and how long it stays up. Anyone can take a note down with its ✕.' },
      { lead: 'Email too', body: 'If email is set up, tick "Also email the family" and it goes out to everyone.' },
    ],
  },
  {
    id: 'weather',
    emoji: '🌤️',
    title: 'Weather',
    intro:
      'The temperature in the top bar opens the full forecast. A red dot means there\'s a weather alert — details are on the forecast page.',
    tips: [],
  },
  {
    id: 'settings',
    emoji: '⚙️',
    title: 'Settings (grown-ups)',
    intro: 'May ask for the family PIN if the lock is on.',
    tips: [
      { lead: 'Appearance', body: 'Pick a theme — Skylight is the classic look; there\'s also Dark, Bold, and Pride 🌈 — and adjust the glass effect.' },
      { lead: 'Family members', body: 'Add people, pick colors and avatars. Colors follow you everywhere.' },
      { lead: 'Reminders', body: 'How many minutes before an event the panel pops up a reminder (or off).' },
      { lead: 'Security', body: 'Set the family PIN, and optionally lock Settings behind it.' },
      { lead: 'Digest & backup', body: 'A morning email with the day\'s plan, and one-tap backup/restore of all settings and people.' },
      { lead: 'Calendars', body: 'Managed from the Calendar page → Manage — adding a Google or school calendar takes about a minute.' },
    ],
  },
  {
    id: 'phone',
    emoji: '📱',
    title: 'From your phone',
    intro:
      'Canopy works in any browser on our Wi-Fi — go to the panel\'s address (something like http://canopy.local:3000), enter the family PIN, and you\'re in. Add groceries from the couch; check the calendar from bed.',
    tips: [
      { lead: 'Says access is off?', body: 'The PIN hasn\'t been set yet — Settings → Security on the panel.' },
    ],
  },
];

export function HelpPage() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="help-page">
      <header className="help-hero panel">
        <div className="help-hero-emoji">🌳</div>
        <div>
          <h1 className="help-hero-title">How to use Canopy</h1>
          <p className="help-hero-sub muted">
            Everything the panel can do, in two minutes per section. Tap a topic:
          </p>
        </div>
      </header>

      <nav className="help-toc">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            className={`btn${active === s.id ? ' btn-primary' : ''}`}
            href={`#${s.id}`}
            onClick={() => setActive(s.id)}
          >
            {s.emoji} {s.title}
          </a>
        ))}
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="help-section panel">
          <h2 className="help-section-title">
            <span className="help-section-emoji">{s.emoji}</span>
            {s.title}
          </h2>
          {s.intro && <p className="help-intro">{s.intro}</p>}
          {s.tips.length > 0 && (
            <div className="help-tips">
              {s.tips.map((tip) => (
                <div key={tip.lead} className="help-tip">
                  <b>{tip.lead}</b> {tip.body}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <p className="muted" style={{ textAlign: 'center', padding: '10px 0 90px' }}>
        Made with 🌳 by Canopy
      </p>
    </div>
  );
}
