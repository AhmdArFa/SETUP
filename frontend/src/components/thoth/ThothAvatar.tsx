'use client'

import { cn } from '@/lib/utils'

/**
 * Thoth, the MCIT agent. Uses the official avatar at /thoth-avatar.png.
 * Set NEXT_PUBLIC_THOTH_AVATAR=true when the approved asset is installed.
 * Avoid requesting a missing asset on every page load.
 */
export function ThothAvatar({ size = 32, className }: { size?: number; className?: string }) {
  if (process.env.NEXT_PUBLIC_THOTH_AVATAR !== 'true') {
    return (
      <span
        aria-label="Thoth"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-[#0b2a5b] font-semibold text-[#d9c27a]',
          className
        )}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      >
        T
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/thoth-avatar.png"
      alt="Thoth"
      width={size}
      height={size}
      className={cn('shrink-0 rounded-full object-cover', className)}
    />
  )
}
