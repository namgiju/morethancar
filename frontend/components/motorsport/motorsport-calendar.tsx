import type {CSSProperties, MouseEvent} from 'react';
import {barTitle, dateRangeLabel, eventPhase, hiddenCounts, localDateLabel, monthGrid, monthLabel, seriesStyle, weekSegments} from '../../lib/motorsport';
import {PHASE_LABELS, type PublicEvent} from '../../lib/motorsport-types';
import styles from './motorsport.module.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export type CalendarSelection = {type: 'event'; id: number} | {type: 'day'; date: string} | null;

type Props = {
  month: string;
  events: PublicEvent[];
  today: string;
  maxLanes: number;
  selection: CalendarSelection;
  // `origin` is the button that was pressed, so the panel can hand focus back.
  onSelectEvent: (id: number, origin: HTMLElement) => void;
  onSelectDay: (date: string, origin: HTMLElement) => void;
};

// Month grid with one bar per event per week (start → end, venue-local dates).
// Bars are the only interactive parts: pressing one opens the detail panel;
// "+N개" opens the list of every event on that day. Elements that keep the
// panel open when clicked carry data-ms-keep-panel (see motorsport-event-panel).
export default function MotorsportCalendar({month, events, today, maxLanes, selection, onSelectEvent, onSelectDay}: Props) {
  const weeks = monthGrid(month);
  const rowStyle = {'--lanes': maxLanes} as CSSProperties;

  return (
    // div role="region", not section: app/globals.css gives bare `section` a 34px margin (legacy theme).
    <div role="region" className={styles.calendar} aria-label={`${monthLabel(month)} 일정 달력`}>
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      {weeks.map((week) => {
        const dates = week.map((c) => c.date);
        const segments = weekSegments(dates, events);
        const hidden = hiddenCounts(segments, maxLanes);
        return (
          <div key={dates[0]} className={styles.weekRow} style={rowStyle}>
            {week.map((cell, col) => (
              <div
                key={cell.date}
                className={styles.dayCell}
                style={{gridColumn: col + 1}}
                data-in-month={cell.inMonth || undefined}
                data-today={cell.date === today || undefined}
                data-selected={(selection?.type === 'day' && selection.date === cell.date) || undefined}
              >
                <span className={styles.dayNumber} aria-current={cell.date === today ? 'date' : undefined}>
                  {Number(cell.date.slice(8, 10))}
                  {cell.date === today && <span className={styles.srOnly}> (오늘)</span>}
                </span>
              </div>
            ))}
            {segments
              .filter((seg) => seg.lane < maxLanes)
              .map((seg) => {
                const {event} = seg;
                const look = seriesStyle(event);
                const phase = eventPhase(event, today);
                const selected = selection?.type === 'event' && selection.id === event.id;
                return (
                  <button
                    key={event.id}
                    type="button"
                    className={styles.bar}
                    style={{gridColumn: `${seg.start + 1} / span ${seg.span}`, gridRow: seg.lane + 2, '--bar': look.color} as CSSProperties}
                    data-ms-keep-panel=""
                    data-ms-event={event.id}
                    data-before={seg.continuesBefore || undefined}
                    data-after={seg.continuesAfter || undefined}
                    data-phase={phase}
                    data-cancelled={event.status === 'CANCELLED' || undefined}
                    aria-pressed={selected}
                    aria-label={`${barTitle(event.title, look.label) === event.title ? `${look.label} ` : ''}${event.title}, ${dateRangeLabel(event.startsOn, event.endsOn)}, ${PHASE_LABELS[phase]}${
                      event.status === 'CANCELLED' ? ', 취소' : ''
                    }${seg.continuesBefore ? ', 지난주에서 이어짐' : ''}`}
                    title={event.title}
                    onClick={(e: MouseEvent<HTMLButtonElement>) => onSelectEvent(event.id, e.currentTarget)}
                  >
                    {seg.continuesBefore && <span className={styles.barArrow} aria-hidden="true">‹</span>}
                    <span className={styles.barSeries}>{look.label}</span>
                    <span className={styles.barTitle}>{barTitle(event.title, look.label)}</span>
                    {seg.continuesAfter && <span className={styles.barArrow} aria-hidden="true">›</span>}
                  </button>
                );
              })}
            {hidden.map((count, col) =>
              count > 0 ? (
                <button
                  key={`more-${dates[col]}`}
                  type="button"
                  className={styles.moreButton}
                  style={{gridColumn: col + 1, gridRow: maxLanes + 2}}
                  data-ms-keep-panel=""
                  aria-label={`${localDateLabel(dates[col])} 일정 ${count}개 더 보기`}
                  onClick={(e: MouseEvent<HTMLButtonElement>) => onSelectDay(dates[col], e.currentTarget)}
                >
                  +{count}개
                </button>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}
