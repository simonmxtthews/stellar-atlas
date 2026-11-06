import { useState } from 'react';
import { formatValue } from '../lib/starFacts';
import {
  DEFAULT_ACCEL_G,
  DEFAULT_DRIVE,
  DRIVE_DEFAULTS,
  formatTravelTime,
  minimumJumps,
  travelTime,
} from '../lib/travel';
import { useWorld } from '../store/world';
import type { DriveModel } from '../types/world';
import { FIELD_LABEL_CLASS, INPUT_CLASS } from './controlStyles';
import { ResetButton } from './ResetButton';

const MAX_JUMP_LIMIT_LY = 50; // beyond this the network is nearly every pair in the catalogue
const DEFAULT_CALCULATOR_LY = 4.37; // Alpha Centauri

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
  defaultValue,
  isValid,
  step,
  field,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly defaultValue: number;
  readonly isValid: (value: number) => boolean;
  readonly step: number;
  readonly field?: string; // typing in it makes one undo step; a reset is always its own
  readonly onCommit: (value: number, field?: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && (draft.trim() === '' || !isValid(Number(draft)));
  return (
    <div className="mt-2 flex items-end gap-1">
      <label className="block min-w-0 flex-1">
        <span className={FIELD_LABEL_CLASS}>{label}</span>
        <input
          type="number"
          step={step}
          aria-invalid={invalid}
          value={draft ?? value}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (text.trim() !== '' && isValid(Number(text))) onCommit(Number(text), field);
          }}
          onBlur={() => setDraft(null)}
          className={`${INPUT_CLASS} tabular-nums aria-invalid:border-danger`}
        />
      </label>
      <ResetButton
        name={label}
        to={String(defaultValue)}
        isDefault={value === defaultValue}
        onReset={() => {
          setDraft(null);
          onCommit(defaultValue);
        }}
      />
    </div>
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
            defaultValue={DRIVE_DEFAULTS.jump.maxJumpLy}
            step={0.5}
            isValid={(value) => value > 0 && value <= MAX_JUMP_LIMIT_LY}
            field="maxJumpLy"
            onCommit={(maxJumpLy, field) => setDrive({ ...drive, maxJumpLy }, field)}
          />
          <NumberField
            label="Days per jump"
            value={drive.daysPerJump}
            defaultValue={DRIVE_DEFAULTS.jump.daysPerJump}
            step={1}
            isValid={(value) => value >= 0}
            field="daysPerJump"
            onCommit={(daysPerJump, field) => setDrive({ ...drive, daysPerJump }, field)}
          />
        </>
      );
    case 'ftl-speed':
      return (
        <NumberField
          label="Speed (multiple of c)"
          value={drive.multipleOfC}
          defaultValue={DRIVE_DEFAULTS['ftl-speed'].multipleOfC}
          step={1}
          isValid={(value) => value > 0}
          field="multipleOfC"
          onCommit={(multipleOfC, field) => setDrive({ ...drive, multipleOfC }, field)}
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
            />
            Constant acceleration, flip at midpoint
          </label>
          <div className="mt-1">
            <ResetButton
              name="constant acceleration"
              to="off"
              isDefault={accelG === undefined}
              onReset={() => setDrive({ type: 'sublight', fractionC: drive.fractionC })}
            />
          </div>
          {accelG === undefined ? (
            <NumberField
              label="Coasting speed (fraction of c)"
              value={drive.fractionC}
              defaultValue={DRIVE_DEFAULTS.sublight.fractionC}
              step={0.01}
              isValid={(value) => value > 0 && value < 1}
              field="fractionC"
              onCommit={(fractionC, field) => setDrive({ ...drive, fractionC }, field)}
            />
          ) : (
            <NumberField
              label="Acceleration (g)"
              value={accelG}
              defaultValue={DEFAULT_ACCEL_G}
              step={0.1}
              isValid={(value) => value > 0}
              field="accelG"
              onCommit={(value, field) => setDrive({ ...drive, accelG: value }, field)}
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
  const [distanceLy, setDistanceLy] = useState(DEFAULT_CALCULATOR_LY);
  return (
    <>
      <div className="flex items-end gap-1">
        <label className="block min-w-0 flex-1">
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
        <ResetButton
          name="the whole drive"
          to="a jump drive's defaults"
          isDefault={JSON.stringify(drive) === JSON.stringify(DEFAULT_DRIVE)}
          onReset={() => setDrive(DEFAULT_DRIVE)}
        />
      </div>
      <DriveFields drive={drive} setDrive={setDrive} />

      <h2 className="mt-3 section-label">Travel calculator</h2>
      <NumberField
        label="Distance (ly)"
        value={distanceLy}
        defaultValue={DEFAULT_CALCULATOR_LY}
        step={0.1}
        isValid={(value) => value > 0}
        onCommit={(value) => setDistanceLy(value)}
      />
      <p data-testid="calculator-result" className="mt-1 text-xs tabular-nums">
        {formatValue(distanceLy, 2, 'ly')}: {calculatorResult(drive, distanceLy)}
      </p>
    </>
  );
}
