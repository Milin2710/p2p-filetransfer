# P2P Web Share

Direct browser-to-browser file transfer. No uploads. No servers.

End-to-end encrypted peer-to-peer file sharing powered by WebRTC.

**Try it live:** [https://p2-p-web-share-client.vercel.app](https://p2-p-web-share-client.vercel.app)

## Features

- **Peer-to-peer** — files never touch a server; WebRTC DataChannels transfer directly between browsers
- **End-to-end encryption** — AES-GCM keys embedded in share links (URL hash fragments, never sent over the wire)
- **Resumable transfers** — interrupted transfers resume from the last acknowledged chunk
- **Multi-file & folder support** — drag folders, select multiple files, send in batch
- **File preview** — preview images, text, and PDFs before/after download
- **Transfer history** — persistent log of all transfers via IndexedDB
- **Speed & ETA** — real-time throughput and remaining time estimates
- **QR code sharing** — scan to join; encryption fingerprint for manual verification
- **Flow control** — sliding window with buffer management for reliable transfers
- **Integrity verification** — SHA-256 hash verification on the receiving side
- **PWA** — installable, offline-capable, service worker caching
- **Dark theme** — minimal dark UI with custom CSS animations

## Quick Start

```bash
# Install dependencies
npm install

# Start development (server + client concurrently)
npm run dev
```

The server runs on `http://localhost:3001` and the client on `http://localhost:5173`.

## Architecture

```
packages/
  shared/       Protocol types, message encoding/decoding, constants
  server/       WebSocket signaling server (Socket.IO), room management
  client/       React SPA — UI, WebRTC, encryption, IndexedDB stores
```

### Flow

1. **Sender** selects files → creates room → gets a share URL with embedded encryption key
2. **Receiver** opens the URL → joins the room via WebSocket signaling
3. WebRTC negotiates a peer connection (STUN/TURN if needed)
4. Files are chunked (~16 KB), encrypted (AES-GCM), and streamed over a DataChannel with sliding-window flow control
5. Receiver decrypts, reassembles, and verifies the SHA-256 hash
6. Progress, speed, and ETA are displayed in real time

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start server + client in parallel |
| `npm run build` | Build shared → server → client for production |
| `npm test` | Run all test suites (vitest) |
| `npm run typecheck` | TypeScript type checking across all packages |
| `npm run lint` | ESLint |

## Tech Stack

- **Frontend**: React 18, React Router, Zustand, Tailwind CSS, Vite
- **Backend**: Node.js, Socket.IO, Express
- **Crypto**: Web Crypto API (AES-GCM, SHA-256)
- **Storage**: IndexedDB (checkpoints, history, chunks)
- **P2P**: WebRTC (RTCDataChannel)
- **PWA**: Service Worker, Web App Manifest

## License

MIT
