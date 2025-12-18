import { HelpCircle } from 'lucide-react'

interface TooltipProps {
  text: string
}

export function Tooltip({ text }: TooltipProps) {
  return (
    <div className="group relative inline-block ml-1">
      <HelpCircle className="w-4 h-4 text-slate-500 cursor-help inline" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-xs text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 z-10">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700"></div>
      </div>
    </div>
  )
}
