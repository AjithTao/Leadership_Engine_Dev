// This is a placeholder for Zustand store integration
// Install zustand with: npm install zustand

'use client'

// import { create } from 'zustand'
// import type { Notification } from '../components/NotificationCenter'

// interface AppState {
//   // Notifications
//   notifications: Notification[]
//   addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
//   removeNotification: (id: string) => void
//   markNotificationAsRead: (id: string) => void
//   clearAllNotifications: () => void
//
//   // Command Palette
//   isCommandPaletteOpen: boolean
//   setCommandPaletteOpen: (open: boolean) => void
//
//   // UI State
//   sidebarOpen: boolean
//   setSidebarOpen: (open: boolean) => void
//
//   // Search
//   searchQuery: string
//   setSearchQuery: (query: string) => void
// }
//
// export const useAppStore = create<AppState>((set) => ({
//   // Notifications
//   notifications: [],
//   addNotification: (notification) =>
//     set((state) => ({
//       notifications: [
//         {
//           ...notification,
//           id: `notif-${Date.now()}`,
//           timestamp: new Date(),
//           read: false,
//         },
//         ...state.notifications,
//       ].slice(0, 50), // Keep last 50 notifications
//     })),
//   removeNotification: (id) =>
//     set((state) => ({
//       notifications: state.notifications.filter((n) => n.id !== id),
//     })),
//   markNotificationAsRead: (id) =>
//     set((state) => ({
//       notifications: state.notifications.map((n) =>
//         n.id === id ? { ...n, read: true } : n
//       ),
//     })),
//   clearAllNotifications: () => set({ notifications: [] }),
//
//   // Command Palette
//   isCommandPaletteOpen: false,
//   setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
//
//   // UI State
//   sidebarOpen: true,
//   setSidebarOpen: (open) => set({ sidebarOpen: open }),
//
//   // Search
//   searchQuery: '',
//   setSearchQuery: (query) => set({ searchQuery: query }),
// }))

// Temporary hook for compatibility
export const useAppStore = () => ({
  notifications: [],
  addNotification: () => {},
  removeNotification: () => {},
  markNotificationAsRead: () => {},
  clearAllNotifications: () => {},
  isCommandPaletteOpen: false,
  setCommandPaletteOpen: () => {},
  sidebarOpen: true,
  setSidebarOpen: () => {},
  searchQuery: '',
  setSearchQuery: () => {},
})
