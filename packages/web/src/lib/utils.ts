import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility to merge Tailwind CSS classes (shadcn/ui standard)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
