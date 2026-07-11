import axios from "axios";
import { useSesionStore } from "./store";

export const api = axios.create();

api.interceptors.request.use((config) => {
  const { apiBaseUrl, token } = useSesionStore.getState();
  config.baseURL = apiBaseUrl;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
