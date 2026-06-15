export interface RoomCreatedPayload {
  roomId: string;
  expiresAt: number;
}

export interface RoomJoinedPayload {
  roomId: string;
  peerCount: number;
}

export interface PeerJoinedPayload {
  peerId: string;
}

export interface PeerDisconnectedPayload {
  peerId: string;
}

export interface RoomErrorPayload {
  code: string;
  message: string;
}

export interface RoomExpiredPayload {
  roomId: string;
}

export interface OfferPayload {
  offer: RTCSessionDescriptionInit;
}

export interface AnswerPayload {
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit;
}

export interface FileMetadataPayload {
  fileName: string;
  fileSize: number;
  fileType: string;
}

export interface TransferCompletePayload {
  sha256Hash: string;
}

export interface TransferErrorPayload {
  error: string;
}

export interface RoomEventMap {
  'create-room': undefined;
  'join-room': { roomId: string };
  'leave-room': { roomId: string };
  'offer': { roomId: string; offer: RTCSessionDescriptionInit };
  'answer': { roomId: string; answer: RTCSessionDescriptionInit };
  'ice-candidate': { roomId: string; candidate: RTCIceCandidateInit };
  'file-metadata': { roomId: string } & FileMetadataPayload;
  'transfer-complete': { roomId: string; sha256Hash: string };
  'transfer-error': { roomId: string; error: string };
}

export interface ClientEventMap {
  'room-created': RoomCreatedPayload;
  'room-joined': RoomJoinedPayload;
  'peer-joined': PeerJoinedPayload;
  'peer-disconnected': PeerDisconnectedPayload;
  'offer': OfferPayload;
  'answer': AnswerPayload;
  'ice-candidate': IceCandidatePayload;
  'file-metadata': FileMetadataPayload;
  'room-error': RoomErrorPayload;
  'room-expired': RoomExpiredPayload;
  'transfer-complete': TransferCompletePayload;
  'transfer-error': TransferErrorPayload;
}

export interface ServerEventMap {
  'create-room': undefined;
  'join-room': (data: { roomId: string }) => void;
  'leave-room': (data: { roomId: string }) => void;
  'offer': (data: { roomId: string; offer: RTCSessionDescriptionInit }) => void;
  'answer': (data: { roomId: string; answer: RTCSessionDescriptionInit }) => void;
  'ice-candidate': (data: { roomId: string; candidate: RTCIceCandidateInit }) => void;
  'file-metadata': (data: { roomId: string; fileName: string; fileSize: number; fileType: string }) => void;
  'transfer-complete': (data: { roomId: string; sha256Hash: string }) => void;
  'transfer-error': (data: { roomId: string; error: string }) => void;
}
