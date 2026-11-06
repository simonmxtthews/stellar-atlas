import type { ReactNode } from 'react';

export function ModalSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="mt-4">
      <h3 className="mb-1 section-label">{title}</h3>
      {children}
    </section>
  );
}
