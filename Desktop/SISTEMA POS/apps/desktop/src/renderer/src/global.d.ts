import type { PosApi } from "../../shared/api-types";

declare global {
  interface Window {
    pos: PosApi;
  }
}

export {};
