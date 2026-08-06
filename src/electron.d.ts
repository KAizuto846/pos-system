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
    getConfig: () => Promise<{
      mode?: string;
      serverPort?: number;
      serverIP?: string;
      deviceName?: string;
      businessName?: string;
    }>;
  };
}
