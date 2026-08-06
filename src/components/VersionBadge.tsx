'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

export default function VersionBadge() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const win = window as unknown as {
      electronAPI?: { getAppVersion: () => Promise<string> };
    };

    if (win.electronAPI?.getAppVersion) {
      win.electronAPI.getAppVersion().then(setVersion).catch(() => {
        fetch('/api/version')
          .then((r) => r.json())
          .then((d) => setVersion(d.version))
          .catch(() => setVersion('0.3.7'));
      });
    } else {
      fetch('/api/version')
        .then((r) => r.json())
        .then((d) => setVersion(d.version))
        .catch(() => setVersion('0.3.7'));
    }
  }, []);

  if (!version) return null;

  return (
    <Badge variant="outline" className="text-xs text-slate-500 border-slate-600 font-mono">
      v{version}
    </Badge>
  );
}
