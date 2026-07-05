import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: { id: string; email: string; name: string } | null;
  accessToken: string | null;
  setAuth: (user: AuthState['user'], token: string) => void;
  clearAuth: () => void;
}

interface UiState {
  sidebarCollapsed: boolean;
  selectedOrgId: string | null;
  selectedProjectId: string | null;
  theme: 'dark' | 'light';
  setSidebarCollapsed: (v: boolean) => void;
  setSelectedOrg: (id: string | null) => void;
  setSelectedProject: (id: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken) => {
        localStorage.setItem('tf_access_token', accessToken);
        set({ user, accessToken });
      },
      clearAuth: () => {
        localStorage.removeItem('tf_access_token');
        set({ user: null, accessToken: null });
      },
    }),
    { name: 'tf_auth' },
  ),
);

export const useUiStore = create<UiState>()((set) => ({
  sidebarCollapsed: false,
  selectedOrgId: null,
  selectedProjectId: null,
  theme: 'dark',
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setSelectedOrg: (id) => set({ selectedOrgId: id }),
  setSelectedProject: (id) => set({ selectedProjectId: id }),
}));
