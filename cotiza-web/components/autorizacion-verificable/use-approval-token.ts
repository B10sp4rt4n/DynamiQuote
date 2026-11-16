"use client";
import { useCallback, useSyncExternalStore } from "react";
const memory = new Map<string, { token: string; until: number }>();
const key = (id: string) => `cotiza-approval:${id}`;
const valid = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
function read(id: string): string {
  const fragment = window.location.hash.slice(1);
  if (valid(fragment)) return fragment;
  const cached = memory.get(id);
  if (cached && cached.until > Date.now()) return cached.token;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key(id)) ?? "null");
    if (saved?.until > Date.now() && typeof saved.token === "string" && valid(saved.token)) return saved.token;
  } catch { /* El enlace puede funcionar sin almacenamiento persistente. */ }
  return "";
}
export function clearApprovalToken(id: string) {
  memory.delete(id);
  try { sessionStorage.removeItem(key(id)); } catch { /* No afecta la decisión ya registrada. */ }
}
export function useApprovalToken(id: string) {
  const subscribe = useCallback((changed: () => void) => {
    function capture() {
      const fragment = window.location.hash.slice(1);
      if (valid(fragment)) {
        const value = { token: fragment, until: Date.now() + 300_000 };
        memory.set(id, value);
        try { sessionStorage.setItem(key(id), JSON.stringify(value)); } catch { /* Conserva sólo memoria de esta pestaña. */ }
      }
      history.replaceState(null, "", window.location.pathname);
      changed();
    }
    capture(); window.addEventListener("hashchange", capture);
    return () => window.removeEventListener("hashchange", capture);
  }, [id]);
  const snapshot = useCallback(() => read(id), [id]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
