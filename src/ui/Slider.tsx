import type { CSSProperties, InputHTMLAttributes } from 'react';

type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'style'> & {
  readonly min: number;
  readonly max: number;
  readonly value: number;
};

export function Slider({ className = '', ...props }: SliderProps) {
  const { min, max, value } = props;
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <input
      type="range"
      style={{ '--fill': fill } as CSSProperties}
      className={`slider ${className}`}
      {...props}
    />
  );
}
