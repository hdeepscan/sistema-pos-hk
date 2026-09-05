import axios from "axios";
import { useSesionStore } from "./store";

export const api = axios.create();

api.interceptors.request.use((config) => {
  const { apiBaseUrl, token } = useSesionStore.getState();
  config.baseURL = apiBaseUrl;

  // Debug logging
  if (config.url?.includes("usuarios-adicionales")) {
    console.log(`📤 POST usuarios-adicionales`);
    console.log(`  Base URL: ${apiBaseUrl}`);
    console.log(`  Token presente: ${token ? "SÍ" : "NO"}`);
    if (token) {
      console.log(`  Token length: ${token.length} chars`);
      console.log(`  Token prefix: ${token.substring(0, 20)}...`);
    }
  }

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      console.error(`🔴 401 UNAUTHORIZED`, {
        url: error.config?.url,
        message: error.response.data?.error,
        timestamp: new Date().toISOString(),
      });

      // Clear local storage
      localStorage.removeItem("token");
      localStorage.removeItem("empresaId");
      localStorage.removeItem("sucursalId");
      localStorage.removeItem("sessionData");

      // Get current location and redirect to login
      const currentPath = window.location.pathname;
      if (!currentPath.includes("/login")) {
        console.log("🔄 Redirecting to /login due to 401");
        // Use window.location.hash for Electron/React Router Hash routing
        window.location.hash = "#/login";
      }
    }

    // Debug logging for specific endpoints
    if (error.response?.status === 401 && error.config?.url?.includes("admin")) {
      console.error(`❌ 401 en endpoint admin`);
      console.error(`  URL:`, error.config.url);
      console.error(`  Response:`, error.response.data);
      console.error(`  Token sent:`, error.config.headers?.Authorization ? "SÍ" : "NO");
    }

    return Promise.reject(error);
  }
);
