interface ToggleProps {
  enabled: boolean
  onChange: () => void
  color?: 'emerald' | 'cyan' | 'amber' | 'purple'
  size?: 'sm' | 'md'
}

export function Toggle({ enabled, onChange, color = 'emerald', size = 'md' }: ToggleProps) {
  const colorClasses = { 
    emerald: 'bg-emerald-500', 
    cyan: 'bg-cyan-500', 
    amber: 'bg-amber-500', 
    purple: 'bg-purple-500' 
  }
  const sizeClasses = size === 'sm' 
    ? { track: 'w-12 h-6', thumb: 'w-4 h-4', on: 'translate-x-6', off: 'translate-x-1' }
    : { track: 'w-14 h-7', thumb: 'w-5 h-5', on: 'translate-x-7', off: 'translate-x-1' }
  
  return (
    <button
      onClick={onChange}
      className={`relative ${sizeClasses.track} rounded-full transition-all ${enabled ? colorClasses[color] : 'bg-slate-600'}`}
    >
      <div className={`absolute top-1 ${sizeClasses.thumb} rounded-full bg-white shadow-md transition-all duration-200 ${enabled ? sizeClasses.on : sizeClasses.off}`} />
    </button>
  )
}
