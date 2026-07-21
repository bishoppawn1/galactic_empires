import type { DataConnection, Peer } from 'peerjs';
import { EMPIRE_FACTIONS, isGameCommand, migrateGameState, viewStateForFaction, type EmpireFaction, type GameCommand, type GameConfig, type GameState } from '../game';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'galactic-empires-';
export const MAX_PLAYERS = 4;
export const MULTIPLAYER_SERIALIZATION = 'binary';
export const STATE_SYNC_INTERVAL_MS = 250;
export const MAX_BUFFERED_STATE_MESSAGES = 2;
export const PEER_OPEN_TIMEOUT_MS = 10000;

export const canSendStateUpdate = (lastSentAt: number, now: number, bufferedMessages = 0) =>
  now - lastSentAt >= STATE_SYNC_INTERVAL_MS && bufferedMessages < MAX_BUFFERED_STATE_MESSAGES;

export function prepareIncomingState(payload: unknown): GameState | undefined {
  try {
    return migrateGameState(payload as GameState);
  } catch {
    return undefined;
  }
}

export interface LobbyPlayer {
  id: string;
  label: string;
  host: boolean;
  faction: EmpireFaction;
  ai?: boolean;
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
  onCommand: (command: GameCommand, faction: EmpireFaction) => void;
  onPlayerLeft: (faction: EmpireFaction) => void;
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
  readonly faction: EmpireFaction;
  start: (state: GameState) => void;
  sendState: (state: GameState) => void;
  sendCommand: (command: GameCommand) => void;
  addAi: () => void;
  removeAi: () => void;
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
  if (typed.type === 'message-too-big') return 'The multiplayer snapshot exceeded the channel limit. All commanders should reload the updated game.';
  return typed.message || 'The multiplayer link could not be established.';
}

async function loadPeer() {
  const module = await import('peerjs');
  return module.Peer;
}

function waitForPeerOpen(peer: Peer): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('The multiplayer service did not answer.')), PEER_OPEN_TIMEOUT_MS);
    peer.once('open', () => { window.clearTimeout(timeout); resolve(); });
    peer.once('error', error => { window.clearTimeout(timeout); reject(error); });
  });
}

export async function hostMultiplayer(config: GameConfig, callbacks: MultiplayerCallbacks): Promise<MultiplayerController> {
  const PeerConstructor = await loadPeer();
  const code = createLobbyCode();
  const peer = new PeerConstructor(peerIdForCode(code));
  await waitForPeerOpen(peer).catch(error => { peer.destroy(); throw new Error(peerErrorMessage(error)); });

  const connections = new Map<string, { connection: DataConnection; faction: EmpireFaction }>();
  const aiFactions = new Set<EmpireFaction>();
  let playing = false;
  let closed = false;
  let lastStateSentAt = Number.NEGATIVE_INFINITY;
  const lobby = (): LobbySnapshot => ({
    code,
    config,
    players: [
      { id: peer.id, label: 'HOST COMMANDER', host: true, faction: 'player' },
      ...Array.from(connections.entries()).map(([id, participant]) => ({ id, label: `COMMANDER ${EMPIRE_FACTIONS.indexOf(participant.faction) + 1}`, host: false, faction: participant.faction })),
      ...Array.from(aiFactions).map(faction => ({ id: `ai-${faction}`, label: `AI EMPIRE ${EMPIRE_FACTIONS.indexOf(faction) + 1}`, host: false, faction, ai: true })),
    ],
  });
  const send = (connection: DataConnection, message: HostMessage) => {
    if (!connection.open) return false;
    try {
      connection.send(message);
      return true;
    } catch (error) {
      callbacks.onError(peerErrorMessage(error));
      return false;
    }
  };
  const broadcast = (message: HostMessage, allowBuffered = true) => {
    let sent = false;
    connections.forEach(participant => {
      const bufferedMessages = (participant.connection as DataConnection & { bufferSize?: number }).bufferSize ?? 0;
      if (!allowBuffered || bufferedMessages < MAX_BUFFERED_STATE_MESSAGES) sent = send(participant.connection, message) || sent;
    });
    return sent;
  };
  const broadcastState = (type: 'start' | 'state', state: GameState, allowBuffered = true) => {
    let sent = false;
    connections.forEach(participant => {
      const bufferedMessages = (participant.connection as DataConnection & { bufferSize?: number }).bufferSize ?? 0;
      if (!allowBuffered || bufferedMessages < MAX_BUFFERED_STATE_MESSAGES) sent = send(participant.connection, { type, state: viewStateForFaction(state, participant.faction) }) || sent;
    });
    return sent;
  };
  const availableFaction = () => EMPIRE_FACTIONS.find(faction => faction !== 'player' && !aiFactions.has(faction) && !Array.from(connections.values()).some(participant => participant.faction === faction));
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
        const faction = availableFaction();
        if (!connections.has(connection.peer) && !faction) { send(connection, { type: 'error', message: 'That lobby is full.' }); connection.close(); return; }
        if (!connections.has(connection.peer)) connections.set(connection.peer, { connection, faction: faction! });
        publishLobby();
      } else if (message?.type === 'command' && playing && connections.has(connection.peer) && isGameCommand(message.command)) {
        callbacks.onCommand(message.command, connections.get(connection.peer)!.faction);
      }
    });
    connection.on('close', () => {
      const participant = connections.get(connection.peer);
      const wasParticipant = connections.delete(connection.peer);
      if (wasParticipant && !playing) publishLobby();
      else if (participant && playing && !closed) callbacks.onPlayerLeft(participant.faction);
    });
    connection.on('error', error => callbacks.onError(peerErrorMessage(error)));
  });
  peer.on('error', error => callbacks.onError(peerErrorMessage(error)));
  peer.on('disconnected', () => { if (!closed) callbacks.onError('Signaling disconnected; current allies may remain connected.'); });
  publishLobby();

  return {
    isHost: true,
    code,
    faction: 'player',
    start(state) {
      if (playing || connections.size + aiFactions.size === 0) return;
      playing = true;
      broadcastState('start', state, false);
      lastStateSentAt = Date.now();
    },
    sendState(state) {
      const now = Date.now();
      if (!playing || !canSendStateUpdate(lastStateSentAt, now)) return;
      if (broadcastState('state', state)) lastStateSentAt = now;
    },
    sendCommand() {},
    addAi() { const faction = availableFaction(); if (!playing && faction) { aiFactions.add(faction); publishLobby(); } },
    removeAi() { if (!playing && aiFactions.size) { aiFactions.delete(Array.from(aiFactions).at(-1)!); publishLobby(); } },
    close() {
      closed = true;
      connections.forEach(participant => participant.connection.close());
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

  const connection = peer.connect(peerIdForCode(code), { reliable: true, serialization: MULTIPLAYER_SERIALIZATION });
  let closed = false;
  let assignedFaction: EmpireFaction = 'enemy';
  connection.on('data', payload => {
    const message = payload as HostMessage;
    if (message?.type === 'lobby') {
      assignedFaction = message.lobby.players.find(player => player.id === peer.id)?.faction ?? assignedFaction;
      callbacks.onLobby(message.lobby);
    }
    else if (message?.type === 'start' || message?.type === 'state') {
      const state = prepareIncomingState(message.state);
      if (!state) { callbacks.onError('The host sent an invalid campaign snapshot.'); return; }
      if (message.type === 'start') callbacks.onStart(state);
      else callbacks.onState(state);
    }
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
    get faction() { return assignedFaction; },
    start() {},
    sendState() {},
    sendCommand(command) {
      if (!connection.open) { callbacks.onError('The rival command link is not open.'); return; }
      try { connection.send({ type: 'command', command } satisfies GuestMessage); }
      catch (error) { callbacks.onError(peerErrorMessage(error)); }
    },
    addAi() {},
    removeAi() {},
    close() { closed = true; connection.close(); peer.destroy(); },
  };
}
