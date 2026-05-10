'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    description: '',
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const isDestructive = options.variant === 'destructive';
  const Icon = isDestructive ? AlertTriangle : HelpCircle;

  // Custom-styled buttons (not <Button>) so we can stack them vertically with
  // consistent height and rounded shape on mobile — shadcn's Button + DialogFooter
  // would render them flat-bottomed and with a cancel-on-bottom default that
  // makes the destructive option the visual lead.
  const ConfirmDialog = (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleCancel();
      }}
    >
      <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="space-y-3 px-6 pt-7 pb-2 text-center">
          <div className="mx-auto flex flex-col items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                isDestructive
                  ? 'bg-red-500/10 ring-1 ring-red-500/20'
                  : 'bg-primary/10 ring-1 ring-primary/20'
              }`}
            >
              <Icon className={`h-5 w-5 ${isDestructive ? 'text-red-500' : 'text-primary'}`} />
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight">
              {options.title ?? 'Confirm'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {options.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-5 pb-5 pt-4">
          <button
            type="button"
            onClick={handleConfirm}
            className={`flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-colors active:scale-[0.99] ${
              isDestructive
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            }`}
          >
            {options.confirmText ?? 'Confirm'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/60"
          >
            {options.cancelText ?? 'Cancel'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { confirm, ConfirmDialog };
}
