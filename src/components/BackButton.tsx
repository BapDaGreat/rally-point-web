import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

interface BackButtonProps {
  onClick?: () => void
}

export function BackButton({ onClick }: BackButtonProps) {
  const nav = useNavigate()

  return (
    <button
      type="button"
      onClick={onClick ?? (() => nav(-1))}
      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 active:bg-slate-200 control-feedback"
      aria-label="Go back"
    >
      <ChevronLeft size={16} />
      Back
    </button>
  )
}
