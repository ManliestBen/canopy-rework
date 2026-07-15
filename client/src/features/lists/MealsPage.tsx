import {
  MEAL_SLOTS,
  addWeeksToKey,
  formatKey,
  todayKey as computeTodayKey,
  weekKeys,
  type DateKey,
  type Meal,
  type MealSlot,
} from '@canopy/shared';
import { useMemo, useState } from 'react';
import { useNow } from '../../hooks/useNow';
import { useListMutations, useLists, useMealsWeek, useSetMeal } from './api';
import './lists.css';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '🍳 Breakfast',
  lunch: '🥪 Lunch',
  dinner: '🍽️ Dinner',
};

/** Week meal planner: a Skylight-style strip; tap a slot to fill it. */
export function MealsPage() {
  useNow();
  const todayKey = computeTodayKey();
  const [anchor, setAnchor] = useState<DateKey>(todayKey);
  const days = useMemo(() => weekKeys(anchor), [anchor]);
  const { data: meals = [] } = useMealsWeek(anchor);
  const [editing, setEditing] = useState<{ dateKey: DateKey; slot: MealSlot } | null>(null);

  const mealFor = (dateKey: DateKey, slot: MealSlot) =>
    meals.find((m) => m.dateKey === dateKey && m.slot === slot);

  return (
    <div className="meals-page">
      <div className="cal-toolbar">
        <h1 className="page-title" style={{ margin: 0 }}>
          Meals
        </h1>
        <div className="cal-nav">
          <button className="btn" onClick={() => setAnchor(addWeeksToKey(anchor, -1))}>
            ‹
          </button>
          <button className="btn" onClick={() => setAnchor(todayKey)}>
            This week
          </button>
          <button className="btn" onClick={() => setAnchor(addWeeksToKey(anchor, 1))}>
            ›
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <span className="muted">
          {formatKey(days[0]!, 'MMM d')} – {formatKey(days[6]!, 'MMM d')}
        </span>
      </div>

      <div className="meals-grid panel">
        <div className="meals-corner" />
        {days.map((day) => (
          <div key={day} className={`meals-dayhead${day === todayKey ? ' today' : ''}`}>
            <span className="dayhead-name">{formatKey(day, 'EEE')}</span>
            <span className="dayhead-num">{formatKey(day, 'd')}</span>
          </div>
        ))}
        {MEAL_SLOTS.map((slot) => (
          <div key={slot} style={{ display: 'contents' }}>
            <div className="meals-slotlabel">{SLOT_LABELS[slot]}</div>
            {days.map((day) => {
              const meal = mealFor(day, slot);
              return (
                <button
                  key={`${day}:${slot}`}
                  type="button"
                  className={`meals-cell${meal ? ' filled' : ''}${day === todayKey ? ' today' : ''}`}
                  onClick={() => setEditing({ dateKey: day, slot })}
                >
                  {meal ? (
                    <>
                      <span className="meals-cell-name">{meal.name}</span>
                      {meal.notes && <span className="meals-cell-notes">{meal.notes}</span>}
                    </>
                  ) : (
                    <span className="meals-cell-plus">+</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {editing && (
        <MealModal
          dateKey={editing.dateKey}
          slot={editing.slot}
          meal={mealFor(editing.dateKey, editing.slot)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MealModal({
  dateKey,
  slot,
  meal,
  onClose,
}: {
  dateKey: DateKey;
  slot: MealSlot;
  meal: Meal | undefined;
  onClose: () => void;
}) {
  const setMeal = useSetMeal();
  const { data: lists = [] } = useLists();
  const { addItems } = useListMutations();
  const [name, setName] = useState(meal?.name ?? '');
  const [notes, setNotes] = useState(meal?.notes ?? '');
  const [ingredients, setIngredients] = useState('');
  const [targetList, setTargetList] = useState(lists[0]?.id ?? '');
  const [pushed, setPushed] = useState(false);

  const save = () =>
    setMeal.mutate(
      { dateKey, slot, name: name.trim(), notes: notes.trim() },
      { onSuccess: onClose },
    );

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal panel" onPointerDown={(e) => e.stopPropagation()}>
        <h3>
          {SLOT_LABELS[slot]} · {formatKey(dateKey, 'EEEE, MMM d')}
        </h3>
        <div className="field">
          <label htmlFor="meal-name">What's cooking?</label>
          <input
            id="meal-name"
            className="input"
            value={name}
            autoFocus
            placeholder="e.g. Taco night"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="meal-notes">Notes (optional)</label>
          <input
            id="meal-notes"
            className="input"
            value={notes}
            placeholder="e.g. use the slow cooker"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {lists.length > 0 && (
          <div className="field">
            <label htmlFor="meal-ingredients">
              Need ingredients? One per line — sent to a shopping list.
            </label>
            <textarea
              id="meal-ingredients"
              className="input"
              rows={3}
              placeholder={'tortillas\nground beef\nsalsa'}
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {lists.length > 1 && (
                <select
                  className="input"
                  value={targetList}
                  onChange={(e) => setTargetList(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn"
                disabled={ingredients.trim() === '' || targetList === ''}
                onClick={() => {
                  const items = ingredients
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  addItems.mutate(
                    { listId: targetList, items },
                    {
                      onSuccess: () => {
                        setIngredients('');
                        setPushed(true);
                        setTimeout(() => setPushed(false), 2500);
                      },
                    },
                  );
                }}
              >
                {pushed ? 'Added ✓' : 'Add to list'}
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {meal && (
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--danger)' }}
              onClick={() =>
                setMeal.mutate({ dateKey, slot, name: '', notes: '' }, { onSuccess: onClose })
              }
            >
              Clear
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={name.trim() === ''} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
