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
    if (error.response?.status === 401 && error.config?.url?.includes("usuarios-adicionales")) {
      console.error(`❌ 401 en usuarios-adicionales`);
      console.error(`  Response:`, error.response.data);
      console.error(`  Request headers:`, error.config.headers);
    }
    return Promise.reject(error);
  }
);
