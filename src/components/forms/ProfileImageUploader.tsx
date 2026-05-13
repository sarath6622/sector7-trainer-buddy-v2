'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProfileImageUploaderProps {
  currentUrl: string | null;
  initials: string;
  endpoint: string;
  onChange?: (url: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-14 w-14 text-base',
  md: 'h-20 w-20 text-xl',
  lg: 'h-28 w-28 text-3xl',
};

export function ProfileImageUploader({
  currentUrl,
  initials,
  endpoint,
  onChange,
  size = 'md',
  className,
}: ProfileImageUploaderProps) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Upload failed');
        return;
      }
      const newUrl = json.data.profileImageUrl as string;
      setUrl(newUrl);
      onChange?.(newUrl);
      toast.success('Photo updated');
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemove() {
    if (!url || busy) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Remove failed');
        return;
      }
      setUrl(null);
      onChange?.(null);
      toast.success('Photo removed');
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div
        className={cn(
          'relative shrink-0 overflow-hidden rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center ring-1 ring-border/40',
          SIZE_CLASSES[size],
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
        >
          <Camera className="h-3.5 w-3.5" />
          {url ? 'Change photo' : 'Upload photo'}
        </button>
        {url && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
    </div>
  );
}
