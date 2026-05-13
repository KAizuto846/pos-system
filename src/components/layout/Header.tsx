'use client';

import { useSession } from 'next-auth/react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-300 hover:text-slate-100 lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">{user.name}</span>
          <Badge
            variant={user.role === 'ADMIN' ? 'default' : 'secondary'}
            className="uppercase"
          >
            {user.role}
          </Badge>
        </div>
      )}
    </header>
  );
}
