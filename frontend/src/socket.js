import { io } from 'socket.io-client';

const socket = io({
  autoConnect: false,
  reconnectionAttempts: 5,
  timeout: 10000
});

socket.on('connect', () => {
  console.log('Connected to game server websocket:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected from game server websocket');
});

export default socket;
