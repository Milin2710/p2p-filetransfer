# P2P File Transfer

Secure, direct browser-to-browser file sharing with no file uploads, cloud storage, or third-party hosting.

**Live Demo:** https://p2p-filetransfer-sigma.vercel.app/

---

## Overview

P2P File Transfer enables fast and private file sharing using WebRTC. Files move directly between connected browsers, ensuring data remains under user control throughout the transfer process.

Encryption keys are generated client-side and embedded within the share URL fragment, providing end-to-end encrypted transfers without exposing keys to signaling services.

---

## Why Use It?

* No file uploads
* No storage limits imposed by servers
* Direct peer-to-peer transfers
* End-to-end encrypted communication
* Resume interrupted transfers
* Share entire folders or multiple files at once
* Verify file integrity after download
* Works as an installable Progressive Web App (PWA)

---

## Key Features

### Secure by Design

* End-to-end encryption using AES-GCM
* Client-side key generation
* SHA-256 integrity verification
* Encryption fingerprints for manual verification

### Direct Peer-to-Peer Transfer

* WebRTC DataChannels for browser-to-browser communication
* No file data stored on backend infrastructure
* Low-latency transfers with optimized buffering

### Resumable Downloads

* Automatic checkpointing
* Continue interrupted transfers from the last received chunk
* Persistent recovery data stored locally

### Multi-File & Folder Sharing

* Drag-and-drop support
* Folder uploads
* Batch file transfers
* Large file handling

### Real-Time Transfer Analytics

* Live transfer progress
* Current throughput monitoring
* Estimated remaining time (ETA)
* Transfer status indicators

### Built-In File Preview

Preview supported content before downloading:

* Images
* Text files
* PDF documents

### Transfer History

* IndexedDB-backed storage
* Persistent transfer records
* Previous transfer tracking

### QR Code Connection

* Quick device pairing
* Mobile-friendly sharing
* Simplified connection workflow

### Progressive Web App

* Installable on desktop and mobile
* Offline-ready assets
* Service worker caching
* Native app-like experience

---

## Getting Started

### Prerequisites

* Node.js 18+
* npm

### Installation

```bash
git clone <repository-url>
cd p2p-file-transfer
npm install
```

### Development

Start both the client and signaling server:

```bash
npm run dev
```

Application URLs:

| Service          | URL                   |
| ---------------- | --------------------- |
| Client           | http://localhost:5173 |
| Signaling Server | http://localhost:3001 |

---

## Project Structure

```text
packages/
├── client/
│   ├── src/
│   ├── public/
│   └── ...
│
├── server/
│   ├── src/
│   └── ...
│
└── shared/
    ├── protocol/
    ├── types/
    └── constants/
```

### Package Responsibilities

| Package | Purpose                                               |
| ------- | ----------------------------------------------------- |
| shared  | Protocol definitions, shared types, constants         |
| server  | WebSocket signaling, room lifecycle management        |
| client  | UI, WebRTC connections, encryption, local persistence |

---

## How It Works

### 1. Create a Transfer Session

The sender selects files or folders and generates a secure sharing link.

### 2. Share the Link

The generated URL contains the encryption key in its hash fragment, which remains local to the browser.

### 3. Establish Connection

The receiver opens the link and joins the session through the signaling server.

### 4. Negotiate Peer Connection

WebRTC establishes a direct connection between both browsers using STUN/TURN services when required.

### 5. Transfer Data

Files are:

1. Split into chunks
2. Encrypted using AES-GCM
3. Sent through RTCDataChannel
4. Acknowledged via flow-control mechanisms

### 6. Verify Integrity

The receiver reconstructs the file and validates it using SHA-256 hashing.

---

## Technology Stack

### Frontend

* React 18
* TypeScript
* React Router
* Zustand
* Tailwind CSS
* Vite

### Backend

* Node.js
* Express
* Socket.IO

### Peer-to-Peer Layer

* WebRTC
* RTCDataChannel

### Security

* Web Crypto API
* AES-GCM Encryption
* SHA-256 Hashing

### Storage

* IndexedDB

### Progressive Web App

* Service Workers
* Web App Manifest

---

## Available Scripts

### Development

```bash
npm run dev
```

Run client and signaling server concurrently.

### Production Build

```bash
npm run build
```

Build all packages for deployment.

### Testing

```bash
npm test
```

Run Vitest test suites.

### Type Checking

```bash
npm run typecheck
```

Validate TypeScript types across the monorepo.

### Linting

```bash
npm run lint
```

Run ESLint checks.

---

## Security Model

### What Is Protected?

* File contents
* Transfer metadata
* Transfer integrity

### What Is Not Stored?

* Uploaded files
* Encryption keys
* Downloaded content on servers

### Encryption Strategy

* AES-GCM for confidentiality and authentication
* Keys generated locally
* Keys shared through URL fragments
* SHA-256 verification after transfer completion

---

## Future Enhancements

* Multi-peer sharing
* Persistent transfer rooms
* WebTransport support
* Transfer pause/resume controls
* Optional password-protected sessions
* End-to-end encrypted messaging

---

## License

Released under the MIT License.
