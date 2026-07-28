/**
 * PH payment adapter (GCash / Maya / card).
 * Demo mode: instant simulated checkout.
 * Live: set VITE_PAYMONGO_PUBLIC_KEY later + edge function for secret; this client only starts intents.
 */
import type { PaymentIntent, PaymentMethod, PaymentStatus } from '../types'

const PAYMONGO_PK = (import.meta.env.VITE_PAYMONGO_PUBLIC_KEY as string | undefined)?.trim()

export const paymentConfig = {
  /** True when a real PSP public key is present (still needs server secret for production) */
  liveConfigured: Boolean(PAYMONGO_PK && PAYMONGO_PK.length > 8),
  methods: [
    { id: 'gcash' as PaymentMethod, label: 'GCash', blurb: 'E-wallet' },
    { id: 'maya' as PaymentMethod, label: 'Maya', blurb: 'E-wallet' },
    { id: 'card' as PaymentMethod, label: 'Card', blurb: 'Visa / Mastercard' },
  ],
}

export function makePaymentRef(method: PaymentMethod) {
  const tag = method.toUpperCase().slice(0, 5)
  return `${tag}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

/** Simulate PSP redirect / approval delay (demo) */
export async function simulateCheckout(intent: PaymentIntent): Promise<{ status: PaymentStatus; ref: string }> {
  await new Promise((r) => setTimeout(r, 900))
  // Fail rarely for realism if amount is 0
  if (intent.amount <= 0) {
    return { status: 'failed', ref: intent.id }
  }
  return { status: 'paid', ref: makePaymentRef(intent.method) }
}

/**
 * Create checkout. In production this should call your Supabase Edge Function → PayMongo Sources/PaymentIntents.
 * Frontend never holds the secret key.
 */
export async function startCheckout(opts: {
  bookingId: string
  amount: number
  method: PaymentMethod
  description: string
}): Promise<PaymentIntent> {
  const intent: PaymentIntent = {
    id: `pi_${Math.random().toString(36).slice(2, 10)}`,
    booking_id: opts.bookingId,
    amount: opts.amount,
    method: opts.method,
    status: 'pending',
    checkout_url: null,
    created_at: new Date().toISOString(),
  }

  if (paymentConfig.liveConfigured) {
    // Placeholder for real PayMongo/Xendit handoff via backend
    intent.checkout_url = null
  }

  return intent
}
