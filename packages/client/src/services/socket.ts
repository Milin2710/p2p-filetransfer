import io from 'socket.io-client';

type Socket = ReturnType<typeof io>;

let socket: Socket | null = null;

const isDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function getServerUrl(): string {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  if (isDev) return 'http://localhost:3001';
  return 'https://p2p-web-share-4gk6.onrender.com';
}

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (!socket) {
    socket = io(getServerUrl(), {
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  if (!socket.connected) {
    console.log('[socket] connecting...');
    socket.connect();
  }

  socket.on('connect', () => {
    console.log('[socket] connected', socket?.id);
  });

  socket.on('disconnect', (reason: string) => {
    console.log('[socket] disconnected', reason);
  });

  socket.on('connect_error', (err: Error) => {
    console.error('[socket] connect_error', err);
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
