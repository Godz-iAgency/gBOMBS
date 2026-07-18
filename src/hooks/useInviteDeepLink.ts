import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { parseInviteCode } from '@/lib/invite';

/**
 * Captures a professional invite from a deep link and hands the code back once.
 * ------------------------------------------------------------------
 * Handles both shapes:
 *   • native:  gbombs://connect?code=ABC123   (hostname = "connect")
 *   • web/url: https://gbombs.app/connect?code=ABC123  (path = "connect")
 *
 * Fires `onCode` for the launch URL and any URL received while running, but only
 * ONCE per unique code — so dismissing the accept modal doesn't make it pop back
 * up (on web the ?code stays in the address bar and would otherwise re-trigger).
 */
export function useInviteDeepLink(onCode: (code: string) => void): void {
  const handledRef = useRef<Set<string>>(new Set());
  // Keep the latest callback without re-subscribing the listener each render.
  const cbRef = useRef(onCode);
  cbRef.current = onCode;

  useEffect(() => {
    let mounted = true;

    function handle(url: string | null) {
      if (!url) return;
      let parsed: Linking.ParsedURL;
      try {
        parsed = Linking.parse(url);
      } catch {
        return;
      }
      const target = parsed.hostname ?? parsed.path ?? '';
      const isConnect = /(^|\/)connect$/i.test(target);
      const raw = parsed.queryParams?.code;
      const rawCode = Array.isArray(raw) ? raw[0] : raw;
      if (!isConnect || typeof rawCode !== 'string') return;

      const code = parseInviteCode(rawCode);
      if (!code || handledRef.current.has(code)) return;
      handledRef.current.add(code);
      cbRef.current(code);
    }

    Linking.getInitialURL().then((url) => {
      if (mounted) handle(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
}
