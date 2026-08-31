import { create } from "zustand";
import api from "../api/client";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  hasPermission: (codes: string[]) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("access_token"),
  loading: true,

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    set({ user: data.user, token: data.access_token });
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, token: null });
  },

  loadUser: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  hasPermission: (codes) => {
    const user = get().user;
    if (!user) return false;
    if (user.is_superuser) return true;
    const granted = new Set<string>();
    user.roles.forEach((r) => r.code && granted.add(r.code));
    return codes.some((c) => granted.has(c));
  },
}));
