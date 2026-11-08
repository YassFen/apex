// Display label and badge classes per WOD type. Plain module so server components can import it too.
export const WOD_TYPE_META: Record<string, { label: string; cls: string }> = {
  fortime:  { label: 'For Time', cls: 'text-or bg-or/15' },
  amrap:    { label: 'AMRAP',    cls: 'text-ac bg-ac/15' },
  emom:     { label: 'EMOM',     cls: 'text-bl bg-bl/15' },
  tabata:   { label: 'Tabata',   cls: 'text-pu bg-pu/15' },
  strength: { label: 'Fuerza',   cls: 'text-gr bg-gr/15' },
}
