import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.BACKEND_URL || env.VITE_BACKEND_URL || "http://backend:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      watch: {
        usePolling: true,
        interval: 100,
      },
      proxy: {
        "/api": {
          target: target,
          changeOrigin: true,
        },
      },
    },
  };
});
