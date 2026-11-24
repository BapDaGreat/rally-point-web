/** Where a player is in booking a court. */
export type BookingStep = 'choose' | 'login' | 'pay' | 'confirmed'

const STEP_LABELS: Record<BookingStep, string> = {
  choose: 'Choose a time',
  login: 'Log in',
  pay: 'Pay',
  confirmed: 'Confirmed',
}

/**
 * The booking steps, numbered: choose a time, log in (visitors only), pay, confirmed.
 * The current step carries aria-current="step"; earlier steps say they are done.
 */
export function BookingSteps({ current, visitor }: { current: BookingStep; visitor: boolean }) {
  const steps: BookingStep[] = visitor ? ['choose', 'login', 'pay', 'confirmed'] : ['choose', 'pay', 'confirmed']
  // A signed-in player is never on the log-in step; they are still choosing.
  const currentIndex = Math.max(0, steps.indexOf(current))
  return (
    <ol aria-label="Booking steps" className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-body">
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex
        const done = index < currentIndex
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className={`inline-flex min-h-8 items-center gap-1.5 ${
              isCurrent ? 'font-semibold text-brand-700 underline decoration-2 underline-offset-[6px]' : done ? 'text-ink' : 'text-muted'
            }`}
          >
            <span className="tabular-nums">{index + 1}.</span>
            <span>{STEP_LABELS[step]}</span>
            {done ? <span className="sr-only">(done)</span> : null}
          </li>
        )
      })}
    </ol>
  )
}
