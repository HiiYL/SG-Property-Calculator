import { useState } from 'react'
import { Share2, Check, Link } from 'lucide-react'
import type { PropertyInputs } from '../types'
import { getShareableUrl } from '../utils/url-state'

interface ShareButtonProps {
  inputs: PropertyInputs
}

export function ShareButton({ inputs }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = getShareableUrl(inputs)
    
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleShare}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
        copied 
          ? 'bg-emerald-500 text-white' 
          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
      }`}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </>
      )}
    </button>
  )
}

export function CopyLinkButton({ inputs }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const url = getShareableUrl(inputs)
    
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
      title="Copy shareable link"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link className="w-4 h-4" />}
    </button>
  )
}
