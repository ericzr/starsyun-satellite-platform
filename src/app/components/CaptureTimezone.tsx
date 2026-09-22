import { useId } from 'react';
import { useI18n } from '../i18n';

const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
const zones = [
  'UTC',
  ...(intl.supportedValuesOf?.('timeZone') ?? [
    'Asia/Shanghai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'America/Chicago',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Australia/Sydney',
  ]),
];

export function CaptureTimezone({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs">
        {t.explore.captureTimezone}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        className="h-9 w-full rounded-md border border-border bg-panel px-2 text-sm"
      >
        {[...new Set([value, ...zones])].map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t.explore.timezoneHint}
      </p>
    </div>
  );
}
