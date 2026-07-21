import type { DataConnection, Peer } from 'peerjs';
import { isGameCommand, type GameCommand, type GameConfig, type GameState } from '../game';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'galactic-empires-';
const MAX_PLAYERS = 4;

export interface LobbyPlayer {
  id: string;
  label: string;
  host: boolean;
}

export interface LobbySnapshot {
  code: string;
  config: GameConfig;
  players: LobbyPlayer[];
}

interface MultiplayerCallbacks {
  onLobby: (lobby: LobbySnapshot) => void;
  onStart: (state: GameState) => void;
  onState: (state: GameState) => void;
  onCommand: (command: GameCommand) => void;
  onError: (message: string) => void;
  onClosed: (message: string) => void;
}

type HostMessage =
  | { type: 'lobby'; lobby: LobbySnapshot }
  | { type: 'start'; state: GameState }
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string };

type GuestMessage = { type: 'join' } | { type: 'command'; command: GameCommand };

export interface MultiplayerController {
  readonly isHost: boolean;
  readonly code: string;
  start: (state: GameState) => void;
  sendState: (state: GameState) => void;
  sendCommand: (command: GameCommand) => void;
  close: () => void;
}

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
const peerIdForCode = (code: string) => `${PEER_PREFIX}${code.toLowerCase()}`;

export function createLobbyCode() {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, value => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
}

function peerErrorMessage(error: unknown) {
  const typed = error as { type?: string; message?: string };
  if (typed.type === 'peer-unavailable') return 'No open lobby uses that code.';
  if (typed.type === 'unavailable-id') return 'That lobby code is already active. Try hosting again.';
  if (typed.type === 'browser-incompatible') return 'This browser does not support multiplayer connections.';
  return typed.message || 'The multiplayer link could not be established.';
}

async function loadPeer() {
  const module = await import('peerjs');
  return module.Peer;
}

function waitForPeerOpen(peer: Peer): Promise<void> {
  return new Promise((resolve, reject) => {
    peer.once('open', () => resolve());
    peer.once('error', error => reject(error));
  });
}

export async function hostMultiplayer(config: GameConfig, callbacks: MultiplayerCallbacks): Promise<MultiplayerController> {
  const PeerConstructor = await loadPeer();
  const code = createLobbyCode();
  const peer = new PeerConstructor(peerIdForCode(code));
  await waitForPeerOpen(peer).catch(error => { peer.destroy(); throw new Error(peerErrorMessage(error)); });

  const connections = new Map<string, DataConnection>();
  let playing = false;
  let closed = false;
  const lobby = (): LobbySnapshot => ({
    code,
    config,
    players: [
      { id: peer.id, label: 'HOST COMMANDER', host: true },
      ...Array.from(connections.keys()).map((id, index) => ({ id, label: `ALLIED COMMANDER ${index + 2}`, host: false })),
    ],
  });
  const send = (connection: DataConnection, message: HostMessage) => {
    if (connection.open) connection.send(message);
  };
  const broadcast = (message: HostMessage, allowBuffered = true) => connections.forEach(connection => {
    const bufferedMessages = (connection as DataConnection & { bufferSize?: number }).bufferSize ?? 0;
    if (!allowBuffered || bufferedMessages < 2) send(connection, message);
  });
  const publishLobby = () => {
    const snapshot = lobby();
    callbacks.onLobby(snapshot);
    broadcast({ type: 'lobby', lobby: snapshot });
  };

  peer.on('connection', connection => {
    connection.on('data', payload => {
      const message = payload as GuestMessage;
      if (message?.type === 'join') {
        if (playing) { send(connection, { type: 'error', message: 'That campaign is already underway.' }); connection.close(); return; }
        if (!connections.has(connection.peer) && connections.size >= MAX_PLAYERS - 1) { send(connection, { type: 'error', message: 'That lobby is full.' }); connection.close(); return; }
        connections.set(connection.peer, connection);
        publishLobby();
      } else if (message?.type === 'command' && playing && connections.has(connection.peer) && isGameCommand(message.command)) {
        callbacks.onCommand(message.command);
      }
    });
    connection.on('close', () => {
      if (connections.delete(connection.peer) && !playing) publishLobby();
    });
    connection.on('error', error => callbacks.onError(peerErrorMessage(error)));
  });
  peer.on('error', error => callbacks.onError(peerErrorMessage(error)));
  peer.on('disconnected', () => { if (!closed) callbacks.onError('Signaling disconnected; current allies may remain connected.'); });
  publishLobby();

  return {
    isHost: true,
    code,
    start(state) {
      if (playing || connections.size === 0) return;
      playing = true;
      broadcast({ type: 'start', state }, false);
    },
    sendState(state) { if (playing) broadcast({ type: 'state', state }); },
    sendCommand() {},
    close() {
      closed = true;
      connections.forEach(connection => connection.close());
      peer.destroy();
    },
  };
}

export async function joinMultiplayer(rawCode: string, callbacks: MultiplayerCallbacks): Promise<MultiplayerController> {
  const code = normalizeCode(rawCode);
  if (code.length !== 6) throw new Error('Enter the six-character lobby code.');
  const PeerConstructor = await loadPeer();
  const peer = new PeerConstructor();
  await waitForPeerOpen(peer).catch(error => { peer.destroy(); throw new Error(peerErrorMessage(error)); });

  const connection = peer.connect(peerIdForCode(code), { reliable: true, serialization: 'json' });
  let closed = false;
  connection.on('data', payload => {
    const message = payload as HostMessage;
    if (message?.type === 'lobby') callbacks.onLobby(message.lobby);
    else if (message?.type === 'start') callbacks.onStart(message.state);
    else if (message?.type === 'state') callbacks.onState(message.state);
    else if (message?.type === 'error') callbacks.onError(message.message);
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The lobby did not answer. Check the code and try again.')), 10000);
    connection.once('open', () => { window.clearTimeout(timeout); connection.send({ type: 'join' } satisfies GuestMessage); resolve(); });
    connection.once('error', error => { window.clearTimeout(timeout); reject(new Error(peerErrorMessage(error))); });
    peer.once('error', error => { window.clearTimeout(timeout); reject(new Error(peerErrorMessage(error))); });
  }).catch(error => { connection.close(); peer.destroy(); throw error; });

  connection.on('close', () => { if (!closed) callbacks.onClosed('The host ended the multiplayer session.'); });
  connection.on('error', error => callbacks.onError(peerErrorMessage(error)));
  peer.on('error', error => callbacks.onError(peerErrorMessage(error)));

  return {
    isHost: false,
    code,
    start() {},
    sendState() {},
    sendCommand(command) { if (connection.open) connection.send({ type: 'command', command } satisfies GuestMessage); },
    close() { closed = true; connection.close(); peer.destroy(); },
  };
}
