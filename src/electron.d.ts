type ElectronUpdateStatus = {
  type:
    | "checking"
    | "available"
    | "downloading"
    | "ready"
    | "not-available"
    | "error";
  version?: string;
  releaseDate?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
  stack?: string;
};

type ElectronUpdateResult = {
  enabled: boolean;
  reason?: string;
  status?: "available" | "ready" | "not-available";
  version?: string;
};

type SyncPeerResult = {
  peer: string;
  name?: string;
  ok: boolean;
  pulled: number;
  pushed: number;
  error: string | null;
};

type SyncResult = {
  at: string;
  peers: number;
  results: SyncPeerResult[];
};

type DiscoveredServer = {
  ip: string;
  port: number;
  name: string;
  deviceId?: string;
};

interface Window {
  electronAPI?: {
    checkForUpdates: () => Promise<ElectronUpdateResult>;
    installUpdate: () => Promise<{ installed: boolean }>;
    onUpdateStatus: (
      callback: (status: ElectronUpdateStatus) => void,
    ) => () => void;
    getDiscoveredServers: () => Promise<DiscoveredServer[]>;
    getLastSyncResult: () => Promise<SyncResult | null>;
    triggerSync: () => Promise<SyncResult | { ok: false; error: string }>;
    copyFullDb: (peerUrl: string) => Promise<{ ok: boolean; error?: string; counts?: Record<string, number> }>;
    getConfig: () => Promise<{
      mode?: string;
      serverPort?: number;
      serverIP?: string;
      deviceName?: string;
      businessName?: string;
      platform?: string;
    }>;
    openDiagnostics: () => Promise<{ ok: boolean; error?: string }>;
    openFirewall: () => Promise<{ ok: boolean; error?: string }>;
    getTailscaleStatus: () => Promise<{
      available: boolean;
      online: boolean;
      ip?: string | null;
      dnsName?: string | null;
      error?: string | null;
      funnelUrl?: string | null;
    }>;
    setupTailscale: (opts: {
      authkey: string;
      funnel: boolean;
      port?: number;
      hostname?: string;
    }) => Promise<{ ok: boolean; error?: string; code?: string; dnsName?: string; funnelUrl?: string }>;
    repairTailscale: (opts?: {
      authkey?: string;
      funnel?: boolean;
      hostname?: string;
    }) => Promise<{
      ok: boolean;
      error?: string;
      repaired?: "restart" | "reauth" | "reset" | "none";
      needsLogin?: boolean;
      loginUrl?: string;
      online?: boolean;
      ip?: string | null;
      dnsName?: string | null;
      funnelUrl?: string | null;
    }>;
    disconnectTailscale: () => Promise<{ ok: boolean; error?: string; funnelOff?: boolean }>;
    onTailscaleProgress: (callback: (msg: string) => void) => () => void;
  };
}
