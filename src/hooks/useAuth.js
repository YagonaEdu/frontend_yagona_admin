import { useEffect, useState } from "react";
import { getSession } from "@/services/api/client";

export function useAuth() {
  const [session, setLocal] = useState(getSession);
  useEffect(() => {
    const sync = () => setLocal(getSession());
    window.addEventListener("yagona-session", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("yagona-session", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return session;
}
