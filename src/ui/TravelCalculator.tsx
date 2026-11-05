import { useState } from 'react';
import { formatValue } from '../lib/starFacts';
import { formatTravelTime, minimumJumps, travelTime } from '../lib/travel';
import { useWorld } from '../store/world';
import type { DriveModel } from '../types/world';
import { FIELD_LABEL_CLASS, INPUT_CLASS } from './controlStyles';

const MAX_JUMP_LIMIT_LY = 50; // beyond this the network is nearly every pair in the catalogue
const DEFAULT_ACCEL_G = 1;

const DRIVE_DEFAULTS: Readonly<Record<DriveModel['type'], DriveModel>> = {
  jump: { type: 'jump', maxJumpLy: 10, daysPerJump: 7 },
  'ftl-speed': { type: 'ftl-speed', multipleOfC: 50 },
  sublight: { type: 'sublight', fractionC: 0.1 },
};

const DRIVE_LABELS: Readonly<Record<DriveModel['type'], string>> = {
  jump: 'Jump drive',
  'ftl-speed': 'FTL at a constant speed',
  sublight: 'Sublight',
};

function isDriveType(value: string): value is DriveModel['type'] {
  return value in DRIVE_DEFAULTS;
}

// Holds what is being typed, and passes on only valid numbers: a world saved with a zero or empty
// drive setting wouldn't load again.
function NumberField({
  label,
  value,
  isValid,
  step,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly isValid: (value: number) => boolean;
  readonly step: number;
  readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && (draft.trim() === '' || !isValid(Number(draft)));
  return (
    <label className="mt-2 block">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <input
        type="number"
        step={step}
        aria-invalid={invalid}
        value={draft ?? value}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (text.trim() !== '' && isValid(Number(text))) onCommit(Number(text));
        }}
        onBlur={() => setDraft(null)}
        className={`${INPUT_CLASS} tabular-nums aria-invalid:border-rose-400`}
      />
    </label>
  );
}

function DriveFields({
  drive,
  setDrive,
}: {
  readonly drive: DriveModel;
  readonly setDrive: (drive: DriveModel, field?: string) => void;
}) {
  switch (drive.type) {
    case 'jump':
      return (
        <>
          <NumberField
            label={`Max jump (ly, up to ${MAX_JUMP_LIMIT_LY})`}
            value={drive.maxJumpLy}
            step={0.5}
            isValid={(value) => value > 0 && value <= MAX_JUMP_LIMIT_LY}
            onCommit={(maxJumpLy) => setDrive({ ...drive, maxJumpLy }, 'maxJumpLy')}
          />
          <NumberField
            label="Days per jump"
            value={drive.daysPerJump}
            step={1}
            isValid={(value) => value >= 0}
            onCommit={(daysPerJump) => setDrive({ ...drive, daysPerJump }, 'daysPerJump')}
          />
        </>
      );
    case 'ftl-speed':
      return (
        <NumberField
          label="Speed (multiple of c)"
          value={drive.multipleOfC}
          step={1}
          isValid={(value) => value > 0}
          onCommit={(multipleOfC) => setDrive({ ...drive, multipleOfC }, 'multipleOfC')}
        />
      );
    case 'sublight': {
      const { accelG } = drive;
      return (
        <>
          <label className="mt-2 flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={accelG !== undefined}
              onChange={() =>
                setDrive(
                  accelG === undefined
                    ? { ...drive, accelG: DEFAULT_ACCEL_G }
                    : { type: 'sublight', fractionC: drive.fractionC },
                )
              }
              className="accent-sky-400"
            />
            Constant acceleration, flip at midpoint
          </label>
          {accelG === undefined ? (
            <NumberField
              label="Coasting speed (fraction of c)"
              value={drive.fractionC}
              step={0.01}
              isValid={(value) => value > 0 && value < 1}
              onCommit={(fractionC) => setDrive({ ...drive, fractionC }, 'fractionC')}
            />
          ) : (
            <NumberField
              label="Acceleration (g)"
              value={accelG}
              step={0.1}
              isValid={(value) => value > 0}
              onCommit={(value) => setDrive({ ...drive, accelG: value }, 'accelG')}
            />
          )}
        </>
      );
    }
  }
}

// The straight-line estimate: real jump chains depend on which stars lie along the way, which the
// route panel and ruler show.
function calculatorResult(drive: DriveModel, distanceLy: number): string {
  if (drive.type !== 'jump') return formatTravelTime(travelTime(drive, distanceLy, null));
  const jumps = minimumJumps(distanceLy, drive.maxJumpLy);
  return `at least ${formatTravelTime(travelTime(drive, distanceLy, jumps))}`;
}

export function TravelCalculator() {
  const drive = useWorld((state) => state.world.drive);
  const setDrive = useWorld((state) => state.setDrive);
  const [distanceLy, setDistanceLy] = useState(4.37);
  return (
    <>
      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Drive model</span>
        <select
          value={drive.type}
          onChange={(event) => {
            const type = event.target.value;
            if (isDriveType(type)) setDrive(DRIVE_DEFAULTS[type]);
          }}
          className={INPUT_CLASS}
        >
          {Object.entries(DRIVE_LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <DriveFields drive={drive} setDrive={setDrive} />

      <h2 className="mt-3 text-xs tracking-wide text-slate-400 uppercase">Travel calculator</h2>
      <NumberField
        label="Distance (ly)"
        value={distanceLy}
        step={0.1}
        isValid={(value) => value > 0}
        onCommit={setDistanceLy}
      />
      <p data-testid="calculator-result" className="mt-1 text-xs tabular-nums">
        {formatValue(distanceLy, 2, 'ly')}: {calculatorResult(drive, distanceLy)}
      </p>
    </>
  );
}
