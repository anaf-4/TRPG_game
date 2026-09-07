const { contextBridge, ipcRenderer } = require('electron');

const LISTENABLE_CHANNELS = ['net:players-update', 'net:game-event', 'net:disconnected'];

contextBridge.exposeInMainWorld('gameNet', {
  listRooms: (payload) => ipcRenderer.invoke('net:list-rooms', payload),
  hostRoom: (payload) => ipcRenderer.invoke('net:host-room', payload),
  joinRoom: (payload) => ipcRenderer.invoke('net:join-room', payload),
  startSolo: (payload) => ipcRenderer.invoke('net:start-solo', payload),
  sendAction: (payload) => ipcRenderer.invoke('net:send-action', payload),
  leaveRoom: () => ipcRenderer.invoke('net:leave-room'),
  startGame: () => ipcRenderer.invoke('net:start-game'),
  kickPlayer: (targetId) => ipcRenderer.invoke('net:kick-player', { targetId }),
  renameRoom: (title) => ipcRenderer.invoke('net:rename-room', { title }),
  on: (channel, callback) => {
    if (!LISTENABLE_CHANNELS.includes(channel)) return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
