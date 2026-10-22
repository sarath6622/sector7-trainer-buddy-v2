'use client';

import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Bottom sheet on phones, centered modal from `sm:` — the same treatment as
 * the exercise library's create dialog, shared by the routine dialogs.
 */
export function RoutineSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={[
          'max-sm:!top-auto max-sm:!bottom-0 max-sm:!left-0 max-sm:!right-0',
          'max-sm:!translate-x-0 max-sm:!translate-y-0',
          'max-sm:!max-w-full max-sm:!w-full',
          'max-sm:!rounded-b-none max-sm:!rounded-t-2xl',
          'sm:max-w-lg',
          'flex max-h-[88dvh] flex-col overflow-hidden p-0 gap-0',
        ].join(' ')}
      >
        <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
        </div>
        <div className="relative border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3 pr-8">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-bold">{title}</DialogTitle>
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
