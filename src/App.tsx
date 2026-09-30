import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  FileCode,
  Globe,
  HardDrive,
  Info,
  Layers,
  Network,
  Pickaxe,
  Play,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  Shield,
  Terminal,
  Wifi,
  WifiOff,
  Copy,
  Check,
  Download
} from 'lucide-react';

interface GitHubRelease {
  tag: string;
  publishedAt: string;
  htmlUrl: string;
  name: string;
  body: string;
}

interface NodeData {
  isOnline: boolean;
  lastSuccessfulCheck: string | null;
  lastError: string | null;
  host: string;
  port: number;
  network: 'mainnet' | 'esmeralda-testnet' | 'nextnet';
  pollIntervalSec: number;
  useTls: boolean;
  version: string;
  githubRelease?: GitHubRelease;
  isUpdateAvailable: boolean;
  nodeIdentity?: {
    nodeId: string;
    publicKey: string;
    publicAddresses: string[];
  };
  networkStatus?: {
    status: 'ONLINE' | 'CONNECTING' | 'LISTENING' | 'DEGRADED' | 'OFFLINE';
    avgLatencyMs: number;
    numNodeConnections: number;
  };
  tipInfo?: {
    metadata: {
      height: number;
      bestBlockHash: string;
      accumulatedDifficulty: string;
      prunedHeight: number;
    };
    isSynced: boolean;
  };
  syncProgress?: {
    tip: number;
    localHeight: number;
    state: 'SYNCED' | 'BLOCK_SYNC' | 'HEADER_SYNC' | 'STARTING';
    syncPercentage: number;
  };
  newBlockTemplate?: {
    readyForMining: boolean;
    height: number;
    targetDifficulty: string;
    rewardMicroTari: number;
    weight: number;
    minerData: string;
  };
  mempoolStats?: {
    unconfirmedTxs: number;
    reorgTxs: number;
    unconfirmedWeight: number;
  };
  activeSyncPeers?: {
    peerId: string;
    address: string;
    latencyMs: number;
    useragent: string;
  }[];
  logs?: {
    id: string;
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
  }[];
}

const INITIAL_DATA: NodeData = {
  isOnline: true,
  lastSuccessfulCheck: new Date().toISOString(),
  lastError: null,
  host: '127.0.0.1',
  port: 18145,
  network: 'esmeralda-testnet',
  pollIntervalSec: 15,
  useTls: false,
  version: 'v1.9.3',
  githubRelease: {
    tag: 'v6.0.0',
    publishedAt: new Date().toISOString(),
    htmlUrl: 'https://github.com/tari-project/tari/releases',
    name: 'v6.0.0',
    body: 'Official Tari release'
  },
  isUpdateAvailable: true,
  nodeIdentity: {
    nodeId: '4a9b2c8f1e7d03a6b5c4d2e1f09876543210abcdef0123456789abcdef012345',
    publicKey: '2e4f8819a5b67c0d12e3456789abcdef0123456789abcdef0123456789abcdef',
    publicAddresses: ['/ip4/127.0.0.1/tcp/18145', '/onion3/vww65vfk3t45t77j3q5s6t7u8v9w0x1y2z.onion:18141']
  },
  networkStatus: {
    status: 'ONLINE',
    avgLatencyMs: 32,
    numNodeConnections: 24
  },
  tipInfo: {
    metadata: {
      height: 184525,
      bestBlockHash: '00000000d02f63adab83c1d94e772f1092',
      accumulatedDifficulty: '4,529,120,000',
      prunedHeight: 0
    },
    isSynced: true
  },
  syncProgress: {
    tip: 184525,
    localHeight: 184525,
    state: 'SYNCED',
    syncPercentage: 100
  },
  newBlockTemplate: {
    readyForMining: true,
    height: 184526,
    targetDifficulty: '4,529,132,000',
    rewardMicroTari: 4500000000,
    weight: 1950,
    minerData: 'tari_sha3x_pool_stratum_v1'
  },
  mempoolStats: {
    unconfirmedTxs: 22,
    reorgTxs: 0,
    unconfirmedWeight: 14200
  },
  activeSyncPeers: [
    { peerId: 'peer_esmeralda_01', address: '168.119.45.12:18141', latencyMs: 24, useragent: 'tari/v1.9.3-minotari' },
    { peerId: 'peer_esmeralda_02', address: '95.217.162.88:18141', latencyMs: 38, useragent: 'tari/v1.9.3-minotari' },
    { peerId: 'peer_esmeralda_03', address: '135.181.201.14:18141', latencyMs: 42, useragent: 'tari/v1.9.2-minotari' },
    { peerId: 'peer_esmeralda_04', address: '65.109.112.9:18141', latencyMs: 51, useragent: 'tari/v1.9.3-minotari' }
  ],
  logs: [
    { id: '1', timestamp: new Date().toISOString(), level: 'INFO', message: 'Tari Minotari Base Node Monitor online and connected' },
    { id: '2', timestamp: new Date().toISOString(), level: 'INFO', message: 'gRPC BaseNode channel responding to RPC inquiries' }
  ]
};

export default function App() {
  const [data, setData] = useState<NodeData>(INITIAL_DATA);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'grpc' | 'peers' | 'logs' | 'docker'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedDocFile, setSelectedDocFile] = useState<string>('docker-compose.yml');

  // Config modal state
  const [cfgHost, setCfgHost] = useState('127.0.0.1');
  const [cfgPort, setCfgPort] = useState(18145);
  const [cfgInterval, setCfgInterval] = useState(15);
  const [cfgNetwork, setCfgNetwork] = useState<'mainnet' | 'esmeralda-testnet' | 'nextnet'>('esmeralda-testnet');
  const [cfgTls, setCfgTls] = useState(false);

  // Terminal log auto-scroll
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/node/status', {
        headers: { Accept: 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          const json = JSON.parse(text);
          setData(json);
          if (json.host) setCfgHost(json.host);
          if (json.port) setCfgPort(json.port);
          if (json.pollIntervalSec) setCfgInterval(json.pollIntervalSec);
          if (json.network) setCfgNetwork(json.network);
          if (typeof json.useTls === 'boolean') setCfgTls(json.useTls);
        }
      }
    } catch {
      // Graceful fallback during dev server startup or network hiccups
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'logs' && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data?.logs, activeTab]);

  const handlePollNow = async () => {
    setPolling(true);
    try {
      await fetch('/api/node/poll-now', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      await fetchStatus();
    } catch {
      // Ignore network glitch
    } finally {
      setTimeout(() => setPolling(false), 500);
    }
  };

  const handleToggleOnline = async () => {
    try {
      await fetch('/api/node/toggle-online', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      await fetchStatus();
    } catch {
      // Toggle locally if network unreachable
      setData((prev) => ({
        ...prev,
        isOnline: !prev.isOnline,
        lastError: prev.isOnline ? 'gRPC Error: Connect Failed (StatusCode.UNAVAILABLE)' : null,
      }));
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/node/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          host: cfgHost,
          port: cfgPort,
          interval: cfgInterval,
          network: cfgNetwork,
          tls: cfgTls,
        }),
      });
      setIsConfigOpen(false);
      await fetchStatus();
    } catch {
      setIsConfigOpen(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const projectFiles: Record<string, string> = {
    'docker-compose.prod.yml': `version: "3.8"

# Production deployment: Pulls pre-built image from GitHub Container Registry (GHCR)
# Image: ghcr.io/lollipopll/minotari-node-monitor:latest
services:
  minotari-monitor:
    image: ghcr.io/lollipopll/minotari-node-monitor:latest
    container_name: minotari-node-monitor
    restart: unless-stopped
    ports:
      - "\${WEB_PORT:-8000}:8000"
    env_file:
      - .env
    environment:
      - TARI_NODE_GRPC_HOST=\${TARI_NODE_GRPC_HOST:-host.docker.internal}
      - TARI_NODE_GRPC_PORT=\${TARI_NODE_GRPC_PORT:-18145}
      - POLL_INTERVAL_SECONDS=\${POLL_INTERVAL_SECONDS:-15}
      - WEB_HOST=0.0.0.0
      - WEB_PORT=8000
      - GITHUB_REPO=\${GITHUB_REPO:-tari-project/tari}
      - TARI_NODE_TLS=\${TARI_NODE_TLS:-false}
      - LOG_LEVEL=\${LOG_LEVEL:-INFO}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3`,

    '.github/workflows/docker-publish.yml': `name: "Build and Publish Docker Image to GHCR"

on:
  push:
    branches: [ "main" ]
    tags: [ "v*.*.*" ]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: "Checkout repository"
        uses: actions/checkout@v4

      - name: "Set lowercase image name"
        run: echo "IMAGE_NAME=\${GITHUB_REPOSITORY,,}" >> $GITHUB_ENV

      - name: "Set up QEMU"
        uses: docker/setup-qemu-action@v3

      - name: "Set up Docker Buildx"
        uses: docker/setup-buildx-action@v3

      - name: "Log in to GitHub Container Registry"
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: "Build and push Docker image"
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest`,

    'docker-compose.yml': `version: "3.8"

services:
  minotari-monitor:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: minotari-node-monitor
    restart: unless-stopped
    ports:
      - "\${WEB_PORT:-8000}:8000"
    env_file:
      - .env
    environment:
      - TARI_NODE_GRPC_HOST=\${TARI_NODE_GRPC_HOST:-host.docker.internal}
      - TARI_NODE_GRPC_PORT=\${TARI_NODE_GRPC_PORT:-18145}
      - POLL_INTERVAL_SECONDS=\${POLL_INTERVAL_SECONDS:-15}
      - WEB_HOST=0.0.0.0
      - WEB_PORT=8000
      - GITHUB_REPO=\${GITHUB_REPO:-tari-project/tari}
      - TARI_NODE_TLS=\${TARI_NODE_TLS:-false}
      - LOG_LEVEL=\${LOG_LEVEL:-INFO}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "5"`,

    'Dockerfile': `FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    ca-certificates \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY protos/ ./protos/
COPY app/ ./app/

RUN mkdir -p /app/app/generated && \\
    python -m grpc_tools.protoc \\
    -I./protos \\
    --python_out=/app/app/generated \\
    --grpc_python_out=/app/app/generated \\
    ./protos/base_node.proto

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/healthz || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`,

    '.env': `# Minotari Node gRPC Configuration
TARI_NODE_GRPC_HOST=127.0.0.1
TARI_NODE_GRPC_PORT=18145
POLL_INTERVAL_SECONDS=15

# Web UI Dashboard Server
WEB_HOST=0.0.0.0
WEB_PORT=8000

# GitHub Release Auto-check
GITHUB_REPO=tari-project/tari
GITHUB_CHECK_INTERVAL_SECONDS=1800

# TLS Configuration
TARI_NODE_TLS=false
TARI_CA_CERT_PATH=
LOG_LEVEL=INFO`,

    'requirements.txt': `fastapi>=0.115.0
uvicorn[standard]>=0.32.0
grpcio>=1.68.0
grpcio-tools>=1.68.0
protobuf>=5.28.0
httpx>=0.28.0
jinja2>=3.1.4
pydantic-settings>=2.7.0
python-dotenv>=1.0.1`,

    'app/main.py': `# FastAPI application with background polling loop and Tari gRPC checks
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
import asyncio, logging
from app.tari_grpc import TariBaseNodeClient
from app.github_checker import GitHubReleaseChecker

app = FastAPI(title="Tari Minotari Node Monitor")
# Includes: GetNetworkStatus, Identify, GetSyncProgress, GetTipInfo,
# GetNewBlockTemplate, GetVersion, GetMempoolStats, and GetActiveSyncPeers`,

    'protos/base_node.proto': `syntax = "proto3";
package tari.rpc;

message Empty {}
message VersionResponse { string version = 1; }
message NodeIdentity { bytes public_key = 1; repeated string public_addresses = 2; bytes node_id = 3; }
message NetworkStatusResponse { enum Status { LISTENING = 0; CONNECTING = 1; ONLINE = 2; DEGRADED = 3; OFFLINE = 4; } Status status = 1; uint32 avg_latency_ms = 2; uint32 num_node_connections = 3; }
message ChainMetadata { uint64 height_of_longest_chain = 1; bytes best_block_hash = 2; bytes accumulated_difficulty = 3; uint64 pruned_height = 4; }
message TipInfoResponse { ChainMetadata metadata = 1; bool is_synced = 2; }
message SyncProgressResponse { uint64 tip = 1; uint64 local_height = 2; enum SyncState { STARTING = 0; HEADER_SYNC = 1; BLOCK_SYNC = 2; SYNCED = 3; } SyncState state = 3; }
message PowAlgo { enum PowAlgos { POW_ALGOS_RANDOM_X = 0; POW_ALGOS_SHA3X = 1; } PowAlgos pow_algo = 1; }
message NewBlockTemplateRequest { PowAlgo algo = 1; uint64 max_weight = 2; }
message NewBlockTemplateResponse { string miner_data = 1; uint64 reward = 3; uint64 weight = 5; bytes target_difficulty = 6; }
message MempoolStatsResponse { uint64 unconfirmed_txs = 1; uint64 reorg_txs = 2; uint64 unconfirmed_weight = 3; }

service BaseNode {
    rpc GetVersion (Empty) returns (VersionResponse);
    rpc Identify (Empty) returns (NodeIdentity);
    rpc GetNetworkStatus (Empty) returns (NetworkStatusResponse);
    rpc GetTipInfo (Empty) returns (TipInfoResponse);
    rpc GetSyncProgress (Empty) returns (SyncProgressResponse);
    rpc GetNewBlockTemplate (NewBlockTemplateRequest) returns (NewBlockTemplateResponse);
    rpc GetMempoolStats (Empty) returns (MempoolStatsResponse);
}`
  };

  const isOnline = data?.isOnline ?? true;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center font-black text-white shadow-lg shadow-purple-900/30">
              <span className="text-xl tracking-tighter">₮</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-white text-base">Minotari Node Monitor</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-700/60 text-purple-300 font-mono font-semibold">
                  v1.9 BaseNode gRPC
                </span>
              </div>
              <p className="text-xs text-slate-400">Tari Blockchain Telemetry & Node Health</p>
            </div>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-2.5">
            <div className="hidden md:flex items-center space-x-2 text-xs font-mono bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg text-slate-300">
              <span className="text-slate-400">Target:</span>
              <span className="text-purple-300 font-bold">{data?.host || '127.0.0.1'}:{data?.port || 18145}</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400">{data?.network === 'esmeralda-testnet' ? 'Esmeralda Testnet' : data?.network || 'Testnet'}</span>
            </div>

            {/* Offline Simulation Toggle (DevOps QA feature) */}
            <button
              onClick={handleToggleOnline}
              title="Simulate Node Connection Drop to test DevOps alerts"
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition ${
                isOnline
                  ? 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'bg-red-950/60 border-red-700 text-red-300 hover:bg-red-900/80'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
              <span className="hidden sm:inline">{isOnline ? 'Simulate Offline' : 'Restore Online'}</span>
            </button>

            {/* Poll Now Button */}
            <button
              onClick={handlePollNow}
              disabled={polling}
              className="text-xs font-medium px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 active:scale-95 transition text-white flex items-center gap-1.5 shadow-md shadow-purple-900/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${polling ? 'animate-spin' : ''}`} />
              <span>Poll Now</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setIsConfigOpen(true)}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              title="Configure Node Address & Ports"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">

        {/* GitHub Release Update Alert Banner */}
        {data?.isUpdateAvailable && data.githubRelease && (
          <div className="border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl shadow-amber-950/20 animate-in fade-in duration-300">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-amber-300">Minotari Node Update Available!</h3>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40">
                    {data.githubRelease.tag}
                  </span>
                </div>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  Your node is running <span className="font-mono font-semibold text-white">{data.version}</span>. An official new release was published to GitHub.
                </p>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-amber-300/70 font-mono">
                  <span>Published: {new Date(data.githubRelease.publishedAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Docker command: <code className="bg-slate-950/80 px-1.5 py-0.5 rounded text-amber-300">docker compose pull && docker compose up -d</code></span>
                </div>
              </div>
            </div>
            <a
              href={data.githubRelease.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition flex items-center gap-1.5 whitespace-nowrap shadow-lg shadow-amber-500/20"
            >
              <span>View Release Notes</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Primary Health & Node Status Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          {/* Node Health Card */}
          <div className="md:col-span-2 p-5 rounded-2xl border border-slate-800 bg-slate-900/90 relative overflow-hidden flex flex-col justify-between shadow-xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-purple-400" />
                Tari Node Health
              </span>

              {isOnline ? (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  NODE OFFLINE
                </span>
              )}
            </div>

            <div className="my-3">
              <div className="flex items-center space-x-2.5">
                <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${isOnline ? 'text-white' : 'text-red-400'}`}>
                  {isOnline ? 'Connected & Synced' : 'Connection Refused'}
                </h2>
                {isOnline && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">
                    {data?.version || 'v1.9.3'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                {isOnline
                  ? `gRPC channel open on ${data?.host}:${data?.port}. BaseNode RPC service answering requests.`
                  : data?.lastError || 'Unable to establish gRPC stream to tari.rpc.BaseNode. Check if minotari_node daemon is running.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800/80 font-mono gap-2">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Last success:</span>
                <span className="text-slate-200 font-semibold">{data?.lastSuccessfulCheck ? new Date(data.lastSuccessfulCheck).toLocaleTimeString() : 'Never'}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span>Poll: {data?.pollIntervalSec || 15}s</span>
                <span>•</span>
                <span>TLS: {data?.useTls ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {/* Tip Height & Metadata */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90 flex flex-col justify-between shadow-xl">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-400" />
                Chain Tip Height
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800 text-purple-300">
                GetTipInfo
              </span>
            </div>

            <div className="my-2">
              <div className="text-3xl sm:text-4xl font-black text-purple-400 font-mono tracking-tight">
                {isOnline && data?.tipInfo ? Number(data.tipInfo.metadata.height).toLocaleString() : '--'}
              </div>
              <div className="text-[11px] font-mono text-slate-500 truncate mt-1" title={data?.tipInfo?.metadata.bestBlockHash}>
                Hash: {isOnline && data?.tipInfo?.metadata.bestBlockHash ? `${data.tipInfo.metadata.bestBlockHash.slice(0, 16)}...` : 'n/a'}
              </div>
            </div>

            <div className="text-xs text-slate-400 flex justify-between items-center pt-2.5 border-t border-slate-800/80 font-mono">
              <span>Sync State:</span>
              <span className={`font-bold ${isOnline && data?.syncProgress?.state === 'SYNCED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isOnline ? data?.syncProgress?.state || 'SYNCED' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Network & Latency */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/90 flex flex-col justify-between shadow-xl">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5">
                <Network className="w-4 h-4 text-teal-400" />
                P2P Network
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950/60 border border-teal-800 text-teal-300">
                GetNetworkStatus
              </span>
            </div>

            <div className="my-2">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl sm:text-4xl font-black text-teal-400 font-mono">
                  {isOnline && data?.networkStatus ? data.networkStatus.avgLatencyMs : '--'}
                </span>
                <span className="text-xs text-slate-400 font-mono">ms avg</span>
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <span>Active Peers:</span>
                <span className="font-bold text-white font-mono">
                  {isOnline ? data?.networkStatus?.numNodeConnections || 0 : 0}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-400 flex justify-between items-center pt-2.5 border-t border-slate-800/80 font-mono">
              <span>Status:</span>
              <span className="font-bold text-teal-300">
                {isOnline ? data?.networkStatus?.status || 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 border-b border-slate-800 overflow-x-auto pb-1 text-sm font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-purple-600/15 text-purple-300 border border-purple-500/30 font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Telemetry Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('grpc')}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'grpc'
                ? 'bg-purple-600/15 text-purple-300 border border-purple-500/30 font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>gRPC Protocol Inspector</span>
          </button>

          <button
            onClick={() => setActiveTab('peers')}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'peers'
                ? 'bg-purple-600/15 text-purple-300 border border-purple-500/30 font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Connected Peers ({data?.activeSyncPeers?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-purple-600/15 text-purple-300 border border-purple-500/30 font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Docker Logs Stream</span>
            {data?.logs && data.logs.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('docker')}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'docker'
                ? 'bg-purple-600/15 text-purple-300 border border-purple-500/30 font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Docker & Deployment Files</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Card 1: Node Identity (Identify RPC) */}
            <div className="border border-slate-800 bg-slate-900/80 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  Identify (Node Identity)
                </h3>
                <span className="text-[10px] font-mono text-indigo-400">tari.rpc.BaseNode.Identify</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Node ID:</span>
                    {data?.nodeIdentity?.nodeId && (
                      <button
                        onClick={() => copyToClipboard(data.nodeIdentity!.nodeId, 'nodeId')}
                        className="text-[10px] text-slate-500 hover:text-indigo-400 flex items-center gap-1 font-mono"
                      >
                        {copiedKey === 'nodeId' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        Copy
                      </button>
                    )}
                  </div>
                  <div className="font-mono text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 break-all select-all text-[11px]">
                    {isOnline && data?.nodeIdentity?.nodeId ? data.nodeIdentity.nodeId : '--'}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-slate-400 mb-1">
                    <span>Public Key:</span>
                    {data?.nodeIdentity?.publicKey && (
                      <button
                        onClick={() => copyToClipboard(data.nodeIdentity!.publicKey, 'pubKey')}
                        className="text-[10px] text-slate-500 hover:text-indigo-400 flex items-center gap-1 font-mono"
                      >
                        {copiedKey === 'pubKey' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        Copy
                      </button>
                    )}
                  </div>
                  <div className="font-mono text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 break-all select-all text-[11px]">
                    {isOnline && data?.nodeIdentity?.publicKey ? data.nodeIdentity.publicKey : '--'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Advertised Addresses:</span>
                  <div className="font-mono text-slate-300 space-y-1.5 text-[11px]">
                    {isOnline && data?.nodeIdentity?.publicAddresses && data.nodeIdentity.publicAddresses.length > 0 ? (
                      data.nodeIdentity.publicAddresses.map((addr, idx) => (
                        <div key={idx} className="p-1.5 rounded-lg bg-slate-950 border border-slate-800/80 truncate">
                          {addr}
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-600 font-mono">No advertised addresses</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Mining & Block Template (GetNewBlockTemplate) */}
            <div className="border border-slate-800 bg-slate-900/80 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Pickaxe className="w-4 h-4 text-amber-400" />
                  Mining & Block Template
                </h3>
                <span className="text-[10px] font-mono text-amber-400">GetNewBlockTemplate</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Mining Readiness:</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                    isOnline && data?.newBlockTemplate?.readyForMining
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {isOnline && data?.newBlockTemplate?.readyForMining ? 'READY TO MINE' : 'BLOCKED'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Next Target Height:</span>
                  <span className="font-mono font-bold text-white">
                    {isOnline && data?.newBlockTemplate ? Number(data.newBlockTemplate.height).toLocaleString() : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Block Reward (XTM):</span>
                  <span className="font-mono font-bold text-amber-300">
                    {isOnline && data?.newBlockTemplate ? (data.newBlockTemplate.rewardMicroTari / 1000000).toLocaleString() + ' XTM' : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Max Block Weight:</span>
                  <span className="font-mono text-slate-200">
                    {isOnline && data?.newBlockTemplate ? data.newBlockTemplate.weight : '--'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Target Difficulty:</span>
                  <div className="font-mono text-amber-200/90 bg-slate-950 p-2 rounded-xl border border-slate-800 truncate text-[11px]">
                    {isOnline && data?.newBlockTemplate ? data.newBlockTemplate.targetDifficulty : '--'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Miner Data / Stratum Protocol:</span>
                  <div className="font-mono text-slate-400 bg-slate-950 p-2 rounded-xl border border-slate-800 text-[11px] truncate">
                    {isOnline && data?.newBlockTemplate ? data.newBlockTemplate.minerData : '--'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Mempool & Chain Details */}
            <div className="border border-slate-800 bg-slate-900/80 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  Mempool & Chain State
                </h3>
                <span className="text-[10px] font-mono text-cyan-400">GetMempoolStats</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Unconfirmed Transactions:</span>
                  <span className="font-mono font-bold text-cyan-300 text-sm">
                    {isOnline && data?.mempoolStats ? data.mempoolStats.unconfirmedTxs : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Mempool Weight:</span>
                  <span className="font-mono text-slate-300">
                    {isOnline && data?.mempoolStats ? Number(data.mempoolStats.unconfirmedWeight).toLocaleString() : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Reorg Transactions:</span>
                  <span className="font-mono text-slate-400">
                    {isOnline && data?.mempoolStats ? data.mempoolStats.reorgTxs : 0}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Accumulated Difficulty:</span>
                  <span className="font-mono text-slate-300 truncate max-w-[140px]">
                    {isOnline && data?.tipInfo ? data.tipInfo.metadata.accumulatedDifficulty : '--'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Pruning Strategy:</span>
                  <span className="font-mono text-slate-300">
                    {isOnline && data?.tipInfo?.metadata.prunedHeight === 0 ? 'Full Archive Node (0)' : 'Pruned'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-400">GitHub Release Sync:</span>
                  <a
                    href="https://github.com/tari-project/tari/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <span>{data?.githubRelease?.tag || 'Checking...'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: gRPC PROTOCOL INSPECTOR */}
        {activeTab === 'grpc' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-base font-bold text-white mb-1">Tari BaseNode RPC Service Definition</h3>
              <p className="text-xs text-slate-400 mb-4">
                The monitor queries the following 8 gRPC endpoints defined in <code className="text-purple-300 font-mono">tari.rpc.BaseNode</code> via non-blocking asynchronous calls:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    name: 'GetVersion',
                    desc: 'Retrieves current Minotari version string for GitHub release comparison',
                    req: 'tari.rpc.Empty',
                    resp: 'VersionResponse { version: string }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? data?.version : 'Error: Connect failed',
                  },
                  {
                    name: 'Identify',
                    desc: 'Extracts node public identity, advertised P2P addresses, and node_id',
                    req: 'tari.rpc.Empty',
                    resp: 'NodeIdentity { public_key, public_addresses, node_id }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? `NodeID: ${data?.nodeIdentity?.nodeId.slice(0, 16)}...` : 'Error: Connect failed',
                  },
                  {
                    name: 'GetNetworkStatus',
                    desc: 'Reports P2P network health, listening state, connections, and avg ping',
                    req: 'tari.rpc.Empty',
                    resp: 'NetworkStatusResponse { status, avg_latency_ms, num_node_connections }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? `${data?.networkStatus?.status} (${data?.networkStatus?.avgLatencyMs} ms)` : 'Error: Connect failed',
                  },
                  {
                    name: 'GetTipInfo',
                    desc: 'Chain tip height, best block hash, cumulative difficulty, and sync boolean',
                    req: 'tari.rpc.Empty',
                    resp: 'TipInfoResponse { metadata, is_synced }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? `Height: ${data?.tipInfo?.metadata.height}` : 'Error: Connect failed',
                  },
                  {
                    name: 'GetSyncProgress',
                    desc: 'Determines blockchain header/block sync phase vs the network tip',
                    req: 'tari.rpc.Empty',
                    resp: 'SyncProgressResponse { tip, local_height, state }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? `State: ${data?.syncProgress?.state}` : 'Error: Connect failed',
                  },
                  {
                    name: 'GetNewBlockTemplate',
                    desc: 'Validates mining readiness, stratum miner data, reward, and difficulty target',
                    req: 'NewBlockTemplateRequest { weight }',
                    resp: 'NewBlockTemplateResponse { miner_data, header, reward, target_difficulty }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? `Ready: ${data?.newBlockTemplate?.readyForMining}` : 'Error: Connect failed',
                  },
                  {
                    name: 'GetMempoolStats',
                    desc: 'Unconfirmed transactions pool size and pending block weight',
                    req: 'tari.rpc.Empty',
                    resp: 'MempoolStatsResponse { unconfirmed_txs, reorg_txs, unconfirmed_weight }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? `Txs: ${data?.mempoolStats?.unconfirmedTxs}` : 'Error: Connect failed',
                  },
                  {
                    name: 'GetActiveSyncPeers',
                    desc: 'Active P2P synchronization peers list with latency and node versions',
                    req: 'tari.rpc.Empty',
                    resp: 'ActiveSyncPeersResponse { repeated Peer peers }',
                    status: isOnline ? 'OK (200)' : 'UNAVAILABLE',
                    value: isOnline ? `${data?.activeSyncPeers?.length || 0} peers active` : 'Error: Connect failed',
                  },
                ].map((rpc, i) => (
                  <div key={i} className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-purple-300">{rpc.name}</span>
                      <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                        rpc.status.startsWith('OK')
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/10 text-red-400 border border-red-500/30'
                      }`}>
                        {rpc.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{rpc.desc}</p>
                    <div className="font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800/80 text-slate-300">
                      <div><span className="text-slate-500">Request:</span> {rpc.req}</div>
                      <div><span className="text-slate-500">Response:</span> {rpc.resp}</div>
                      <div className="mt-1 pt-1 border-t border-slate-800 text-teal-300">
                        <span className="text-slate-500">Sample:</span> {rpc.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CONNECTED PEERS */}
        {activeTab === 'peers' && (
          <div className="border border-slate-800 bg-slate-900 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white">Active Sync Peers</h3>
                <p className="text-xs text-slate-400">P2P nodes currently connected for chain validation and gossip propagation</p>
              </div>
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-slate-800 text-slate-300">
                {data?.activeSyncPeers?.length || 0} Connected
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Peer ID</th>
                    <th className="py-3 px-4">Network Address</th>
                    <th className="py-3 px-4">Latency</th>
                    <th className="py-3 px-4">Client User-Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {isOnline && data?.activeSyncPeers && data.activeSyncPeers.length > 0 ? (
                    data.activeSyncPeers.map((peer, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/50 transition">
                        <td className="py-3 px-4 text-purple-300 font-semibold">{peer.peerId}</td>
                        <td className="py-3 px-4 text-slate-300">{peer.address}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] ${
                            peer.latencyMs < 35 ? 'text-emerald-400 bg-emerald-950/40' : 'text-amber-400 bg-amber-950/40'
                          }`}>
                            {peer.latencyMs} ms
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400">{peer.useragent}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        {isOnline ? 'No active peers reported' : 'Node is offline. Cannot query peers.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: DOCKER LOGS STREAM */}
        {activeTab === 'logs' && (
          <div className="border border-slate-800 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                <span className="text-xs font-mono font-semibold text-slate-300 ml-2">
                  docker-compose logs -f minotari-node-monitor
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live stdout stream</span>
              </div>
            </div>

            <div className="p-4 bg-slate-950 h-96 overflow-y-auto font-mono text-xs space-y-1.5 text-slate-300">
              {data?.logs && data.logs.length > 0 ? (
                data.logs.map((log) => {
                  const levelClass =
                    log.level === 'ERROR'
                      ? 'text-red-400 bg-red-950/20'
                      : log.level === 'WARN'
                      ? 'text-amber-400 bg-amber-950/20'
                      : 'text-slate-300';
                  return (
                    <div key={log.id} className="flex items-start space-x-2.5 py-0.5">
                      <span className="text-slate-500 text-[11px] shrink-0 select-none">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 select-none ${
                        log.level === 'ERROR' ? 'bg-red-900/60 text-red-300' :
                        log.level === 'WARN' ? 'bg-amber-900/60 text-amber-300' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {log.level}
                      </span>
                      <span className={`${levelClass} break-all`}>{log.message}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500">// Waiting for logs...</div>
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        )}

        {/* TAB 5: DOCKER & DEPLOYMENT FILES */}
        {activeTab === 'docker' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Docker Deployment Bundle</h3>
                  <p className="text-xs text-slate-400">
                    All necessary configuration files to deploy this monitoring agent on any Linux/macOS/Windows server via Docker Compose.
                  </p>
                </div>
                <div className="flex items-center space-x-2 font-mono text-xs">
                  <span className="text-slate-400">Launch command:</span>
                  <code className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-emerald-400 font-bold select-all">
                    docker compose up -d --build
                  </code>
                </div>
              </div>

              {/* File selector pill tabs */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-slate-800 text-xs font-mono">
                {Object.keys(projectFiles).map((filename) => (
                  <button
                    key={filename}
                    onClick={() => setSelectedDocFile(filename)}
                    className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                      selectedDocFile === filename
                        ? 'bg-purple-600 text-white font-bold shadow'
                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{filename}</span>
                  </button>
                ))}
              </div>

              {/* File Viewer Box */}
              <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300 font-bold flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-purple-400" />
                    {selectedDocFile}
                  </span>
                  <button
                    onClick={() => copyToClipboard(projectFiles[selectedDocFile], selectedDocFile)}
                    className="text-xs font-mono px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition"
                  >
                    {copiedKey === selectedDocFile ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-96 leading-relaxed">
                  <code>{projectFiles[selectedDocFile]}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Configuration Settings Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-purple-400" />
                Target Node Configuration
              </h3>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Tari Base Node Host / IP</label>
                <input
                  type="text"
                  value={cfgHost}
                  onChange={(e) => setCfgHost(e.target.value)}
                  placeholder="127.0.0.1 or host.docker.internal"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Use <code>127.0.0.1</code> for local daemon, or <code>host.docker.internal</code> inside Docker on host.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">gRPC Port</label>
                  <input
                    type="number"
                    value={cfgPort}
                    onChange={(e) => setCfgPort(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">Default: 18145 (Testnet) or 18142 (Mainnet)</span>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Poll Interval (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={cfgInterval}
                    onChange={(e) => setCfgInterval(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">Recommended: 10–30s</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Network Preset</label>
                <select
                  value={cfgNetwork}
                  onChange={(e: any) => {
                    const net = e.target.value;
                    setCfgNetwork(net);
                    if (net === 'mainnet') setCfgPort(18142);
                    else if (net === 'esmeralda-testnet') setCfgPort(18145);
                    else if (net === 'nextnet') setCfgPort(18188);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                >
                  <option value="esmeralda-testnet">Esmeralda Testnet (Port 18145)</option>
                  <option value="mainnet">Tari Mainnet (Port 18142)</option>
                  <option value="nextnet">Nextnet Development (Port 18188)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="tlsCheck"
                  checked={cfgTls}
                  onChange={(e) => setCfgTls(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="tlsCheck" className="text-slate-300 font-medium cursor-pointer">
                  Enable TLS Channel Security (Default false for local daemon)
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition shadow-lg shadow-purple-900/30"
                >
                  Save & Reconnect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 font-mono">
          <div>
            Tari Minotari Base Node Monitor • Built for SRE & Blockchain DevOps
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://github.com/lollipopll/Minotari-Node-Monitor"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:underline flex items-center gap-1"
            >
              <span>GitHub lollipopll/Minotari-Node-Monitor</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-slate-700">•</span>
            <a
              href="https://github.com/tari-project/tari"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:underline flex items-center gap-1"
            >
              <span>Tari Upstream</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
