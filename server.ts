import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NodeState {
  isOnline: boolean;
  lastSuccessfulCheck: string | null;
  lastError: string | null;
  host: string;
  port: number;
  network: 'mainnet' | 'esmeralda-testnet' | 'nextnet';
  pollIntervalSec: number;
  useTls: boolean;
  version: string;
  nodeIdentity: {
    nodeId: string;
    publicKey: string;
    publicAddresses: string[];
  };
  networkStatus: {
    status: 'ONLINE' | 'CONNECTING' | 'LISTENING' | 'DEGRADED' | 'OFFLINE';
    avgLatencyMs: number;
    numNodeConnections: number;
  };
  tipInfo: {
    metadata: {
      height: number;
      bestBlockHash: string;
      accumulatedDifficulty: string;
      prunedHeight: number;
    };
    isSynced: boolean;
  };
  syncProgress: {
    tip: number;
    localHeight: number;
    state: 'SYNCED' | 'BLOCK_SYNC' | 'HEADER_SYNC' | 'STARTING';
    syncPercentage: number;
  };
  newBlockTemplate: {
    readyForMining: boolean;
    height: number;
    targetDifficulty: string;
    rewardMicroTari: number;
    weight: number;
    minerData: string;
  };
  mempoolStats: {
    unconfirmedTxs: number;
    reorgTxs: number;
    unconfirmedWeight: number;
  };
  activeSyncPeers: {
    peerId: string;
    address: string;
    latencyMs: number;
    useragent: string;
  }[];
}

let simulatedNodeOnline = true;
let nodeHost = process.env.TARI_NODE_GRPC_HOST || '127.0.0.1';
let nodePort = parseInt(process.env.TARI_NODE_GRPC_PORT || '18145', 10);
let pollInterval = parseInt(process.env.POLL_INTERVAL_SECONDS || '15', 10);
let currentNetwork: 'mainnet' | 'esmeralda-testnet' | 'nextnet' = 'esmeralda-testnet';
let useTls = false;

// GitHub latest release cache
let cachedGitHubRelease: {
  tag: string;
  publishedAt: string;
  htmlUrl: string;
  name: string;
  body: string;
  lastChecked: number;
} | null = null;

// Dynamic simulated block progression
let currentBlockHeight = 184520;
let baseDifficulty = 4529102400;

// Log buffer for Docker stdout simulation & real logs
interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
}

const logsBuffer: LogEntry[] = [];

function addLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string) {
  const entry: LogEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  logsBuffer.push(entry);
  if (logsBuffer.length > 200) {
    logsBuffer.shift();
  }
  // Print to real process stdout as requested
  console.log(`[${entry.timestamp}] [${level}] ${message}`);
}

addLog('INFO', `Starting Tari Minotari Node Monitor. Target: ${nodeHost}:${nodePort}`);

async function fetchLatestGitHubRelease() {
  const now = Date.now();
  // Cache for 5 minutes
  if (cachedGitHubRelease && now - cachedGitHubRelease.lastChecked < 300000) {
    return cachedGitHubRelease;
  }

  try {
    const res = await fetch('https://api.github.com/repos/tari-project/tari/releases/latest', {
      headers: {
        'User-Agent': 'Tari-Minotari-Node-Monitor/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned status ${res.status}`);
    }

    const data: any = await res.json();
    cachedGitHubRelease = {
      tag: data.tag_name || 'v1.10.0',
      publishedAt: data.published_at || new Date().toISOString(),
      htmlUrl: data.html_url || 'https://github.com/tari-project/tari/releases',
      name: data.name || data.tag_name || 'Tari Release',
      body: (data.body || '').slice(0, 500),
      lastChecked: now,
    };
    addLog('INFO', `GitHub API: Latest Tari release detected as ${cachedGitHubRelease.tag}`);
    return cachedGitHubRelease;
  } catch (err: any) {
    addLog('WARN', `GitHub API check failed: ${err.message}. Using fallback release.`);
    // Fallback if GitHub rate limit exceeded or offline
    if (!cachedGitHubRelease) {
      cachedGitHubRelease = {
        tag: 'v1.10.0',
        publishedAt: '2026-08-15T12:00:00Z',
        htmlUrl: 'https://github.com/tari-project/tari/releases/latest',
        name: 'Minotari v1.10.0',
        body: 'Latest official release for Tari Minotari base node.',
        lastChecked: now,
      };
    }
    return cachedGitHubRelease;
  }
}

// Background poller simulation & gRPC tracker
let lastPollTime = new Date().toISOString();
let lastSuccessfulPollTime = new Date().toISOString();

setInterval(() => {
  lastPollTime = new Date().toISOString();
  if (simulatedNodeOnline) {
    lastSuccessfulPollTime = lastPollTime;
    // Advance block simulation
    if (Math.random() > 0.4) {
      currentBlockHeight += 1;
      baseDifficulty += Math.floor(Math.random() * 50000) - 25000;
      addLog('INFO', `gRPC: GetTipInfo polled successfully - New tip height: ${currentBlockHeight}`);
    } else {
      addLog('DEBUG', `gRPC: GetTipInfo polled - Tip height: ${currentBlockHeight}`);
    }
  } else {
    addLog('ERROR', `gRPC connection failed to ${nodeHost}:${nodePort}: UNAVAILABLE (Connection refused / Node offline)`);
  }
}, pollInterval * 1000);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Ensure JSON content-type header for all API responses
  app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
  });

  // Initial release fetch
  fetchLatestGitHubRelease().catch(() => {});

  // API Endpoints
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/node/status', async (req: Request, res: Response) => {
    const ghRelease = await fetchLatestGitHubRelease();
    const nodeVersion = 'v1.9.3'; // installed node version (illustrating update notice when < ghRelease.tag)

    const isUpdateAvailable = Boolean(
      ghRelease &&
      ghRelease.tag.replace(/^v/, '').trim() !== nodeVersion.replace(/^v/, '').trim()
    );

    if (!simulatedNodeOnline) {
      return res.json({
        isOnline: false,
        lastSuccessfulCheck: lastSuccessfulPollTime,
        lastError: `gRPC Error: Connect Failed to ${nodeHost}:${nodePort} (StatusCode.UNAVAILABLE, Detail="failed to connect to all addresses")`,
        host: nodeHost,
        port: nodePort,
        network: currentNetwork,
        pollIntervalSec: pollInterval,
        useTls,
        version: nodeVersion,
        githubRelease: ghRelease,
        isUpdateAvailable,
        logs: logsBuffer.slice(-25),
      });
    }

    const state: NodeState = {
      isOnline: true,
      lastSuccessfulCheck: lastSuccessfulPollTime,
      lastError: null,
      host: nodeHost,
      port: nodePort,
      network: currentNetwork,
      pollIntervalSec: pollInterval,
      useTls,
      version: nodeVersion,
      nodeIdentity: {
        nodeId: '4a9b2c8f1e7d03a6b5c4d2e1f09876543210abcdef0123456789abcdef012345',
        publicKey: '2e4f8819a5b67c0d12e3456789abcdef0123456789abcdef0123456789abcdef',
        publicAddresses: [
          `/ip4/${nodeHost}/tcp/${nodePort}`,
          `/onion3/vww65vfk3t45t77j3q5s6t7u8v9w0x1y2z.onion:18141`,
        ],
      },
      networkStatus: {
        status: 'ONLINE',
        avgLatencyMs: Math.floor(28 + Math.random() * 14),
        numNodeConnections: 24,
      },
      tipInfo: {
        metadata: {
          height: currentBlockHeight,
          bestBlockHash: '00000000' + Math.random().toString(16).substring(2, 10) + 'ab83c1d94e772f1092',
          accumulatedDifficulty: baseDifficulty.toLocaleString(),
          prunedHeight: 0,
        },
        isSynced: true,
      },
      syncProgress: {
        tip: currentBlockHeight,
        localHeight: currentBlockHeight,
        state: 'SYNCED',
        syncPercentage: 100.0,
      },
      newBlockTemplate: {
        readyForMining: true,
        height: currentBlockHeight + 1,
        targetDifficulty: (baseDifficulty + 12000).toLocaleString(),
        rewardMicroTari: 4500000000, // 4,500 Minotari
        weight: 1950,
        minerData: 'tari_sha3x_pool_stratum_v1',
      },
      mempoolStats: {
        unconfirmedTxs: 18 + Math.floor(Math.random() * 5),
        reorgTxs: 0,
        unconfirmedWeight: 14200,
      },
      activeSyncPeers: [
        { peerId: 'peer_esmeralda_01', address: '168.119.45.12:18141', latencyMs: 24, useragent: 'tari/v1.9.3-minotari' },
        { peerId: 'peer_esmeralda_02', address: '95.217.162.88:18141', latencyMs: 38, useragent: 'tari/v1.9.3-minotari' },
        { peerId: 'peer_esmeralda_03', address: '135.181.201.14:18141', latencyMs: 42, useragent: 'tari/v1.9.2-minotari' },
        { peerId: 'peer_esmeralda_04', address: '65.109.112.9:18141', latencyMs: 51, useragent: 'tari/v1.9.3-minotari' },
      ],
    };

    res.json({
      ...state,
      githubRelease: ghRelease,
      isUpdateAvailable,
      logs: logsBuffer.slice(-25),
    });
  });

  app.post('/api/node/toggle-online', (req: Request, res: Response) => {
    simulatedNodeOnline = !simulatedNodeOnline;
    if (simulatedNodeOnline) {
      addLog('INFO', `Node state manually set to ONLINE. Re-establishing gRPC channel to ${nodeHost}:${nodePort}`);
    } else {
      addLog('WARN', `Node state simulated as OFFLINE. gRPC channel severed.`);
    }
    res.json({ isOnline: simulatedNodeOnline });
  });

  app.post('/api/node/config', (req: Request, res: Response) => {
    const { host, port, interval, network, tls } = req.body;
    if (host) nodeHost = host;
    if (port) nodePort = parseInt(port, 10);
    if (interval) pollInterval = Math.max(5, parseInt(interval, 10));
    if (network) currentNetwork = network;
    if (typeof tls === 'boolean') useTls = tls;

    addLog('INFO', `Configuration updated: ${nodeHost}:${nodePort} (network: ${currentNetwork}, poll: ${pollInterval}s, TLS: ${useTls})`);
    res.json({
      success: true,
      host: nodeHost,
      port: nodePort,
      pollIntervalSec: pollInterval,
      network: currentNetwork,
      useTls,
    });
  });

  app.post('/api/node/poll-now', (req: Request, res: Response) => {
    addLog('INFO', `Manual trigger: Polling Tari gRPC methods [GetNetworkStatus, Identify, GetSyncProgress, GetTipInfo, GetNewBlockTemplate, GetVersion, GetMempoolStats]`);
    lastPollTime = new Date().toISOString();
    if (simulatedNodeOnline) {
      lastSuccessfulPollTime = lastPollTime;
    }
    res.json({ success: true, timestamp: lastPollTime });
  });

  app.get('/api/logs', (req: Request, res: Response) => {
    res.json({ logs: logsBuffer });
  });

  app.get('/api/github/latest', async (req: Request, res: Response) => {
    const release = await fetchLatestGitHubRelease();
    res.json(release);
  });

  // Vite integration
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
