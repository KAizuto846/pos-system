'use client';

import { useSession } from 'next-auth/react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/60 bg-canvas/80 px-4 backdrop-blur-xl lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <h1 className="text-[13px] font-medium tracking-tight text-fg">{title}</h1>
        <span className="hidden h-4 w-px bg-line sm:block" />
        <div className="hidden sm:block">
          <SyncStatusBadge />
        </div>
      </div>

      {user && (
        <div className="flex items-center gap-2.5">
          <span className="hidden text-[13px] text-fg-muted sm:inline">{user.name}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium uppercase text-fg-muted ring-1 ring-inset ring-line">
            {user.name?.slice(0, 2) ?? '–'}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
            {user.role}
          </span>
        </div>
      )}
    </header>
  );
}
