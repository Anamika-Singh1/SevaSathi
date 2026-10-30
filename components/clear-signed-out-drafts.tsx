"use client";

import { useEffect } from "react";

// Recovery is deliberately retained on normal navigation or session expiry.
// Only a completed, explicit sign-out clears this tab's protected case drafts.
export function ClearSignedOutDrafts() {
  useEffect(() => {
    try {
      const keys = Object.keys(sessionStorage).filter(key => key.startsWith("sevasathi:draft:"));
      for (const key of keys) sessionStorage.removeItem(key);
    } catch {
      // Keep sign-out usable when the browser blocks storage access.
    }
  }, []);
  return null;
}
