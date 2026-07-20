/**
 * Professional-invite helpers.
 * ------------------------------------------------------------------
 * An invite is a short server-issued code. We render it two ways:
 *   • a QR encoding a `gbombs://connect?code=…` deep link (a phone's native
 *     camera can scan it and route straight into the accept screen), and
 *   • the bare code, which the professional can type in if scanning isn't handy.
 * `parseInviteCode` accepts either form so paste-the-whole-link also works.
 */

import { Platform, Share } from 'react-native';

export const INVITE_SCHEME = 'gbombs';

/** The deep link encoded in the QR. */
export function inviteDeepLink(code: string): string {
  return `${INVITE_SCHEME}://connect?code=${encodeURIComponent(code)}`;
}

/** Extract the bare code from a raw code OR a full connect deep link. */
export function parseInviteCode(input: string): string {
  const t = input.trim();
  const m = t.match(/code=([A-Za-z0-9_-]+)/);
  return m ? m[1] : t;
}

/**
 * Share / copy an invite so the client can hand it to their professional.
 *   • web:   Web Share sheet if available, else copy to clipboard.
 *   • native: the OS share sheet.
 * Best-effort — a user cancelling the sheet is not an error.
 */
export async function shareInvite(code: string, roleLabel: string): Promise<{
  copied: boolean;
}> {
  const link = inviteDeepLink(code);
  const message = `Connect to me as my ${roleLabel} on gBOMBS.\n\nInvite code: ${code}\n${link}`;

  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator) : undefined;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ text: message });
      } catch {
        /* user cancelled */
      }
      return { copied: false };
    }
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(message);
      return { copied: true };
    }
    return { copied: false };
  }

  await Share.share({ message });
  return { copied: false };
}
