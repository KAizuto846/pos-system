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

interface Window {
  electronAPI?: {
    checkForUpdates: () => Promise<ElectronUpdateResult>;
    installUpdate: () => Promise<{ installed: boolean }>;
    onUpdateStatus: (
      callback: (status: ElectronUpdateStatus) => void,
    ) => () => void;
  };
}
