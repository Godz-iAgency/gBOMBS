import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import type { GroceryList } from '@/services/gemini';

/**
 * Instacart ordering (Path B — shopping-list deep link).
 * ------------------------------------------------------------------
 * The grocery list is sent to the `create-instacart-list` Edge Function, which
 * calls Instacart's Developer Platform to build a hosted "shopping list page"
 * and returns its URL. Opening that URL lets the user choose a store, review the
 * pre-filled cart, and check out on Instacart. Our Instacart key lives only in
 * the Edge Function, never in the app.
 */

/** One line item sent to the Instacart shopping-list builder. */
export interface InstacartLineItem {
  /** Product name Instacart searches on. */
  name: string;
  /** Human-readable label shown to the shopper (keeps the original amount). */
  display_text?: string;
}

/**
 * Flatten a gBOMBS grocery list into Instacart line items. Items the user has
 * already checked off (things they have) are excluded; if everything is checked
 * we fall back to the whole list so the button is never a silent no-op.
 */
export function groceryListToLineItems(list: GroceryList): InstacartLineItem[] {
  const all = list.sections.flatMap((s) => s.items);
  const needed = all.filter((i) => !i.checked);
  const source = needed.length > 0 ? needed : all;
  return source.map((i) => ({
    name: i.item,
    display_text: i.quantity ? `${i.quantity} ${i.item}`.trim() : i.item,
  }));
}

/** Pull the function's JSON `error` out of a supabase-js FunctionsHttpError. */
async function functionErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = await ctx.json();
      if (parsed?.error) return String(parsed.error);
    } catch {
      /* body wasn't JSON — fall through to the generic message */
    }
  }
  return (error as Error)?.message ?? 'Something went wrong.';
}

/**
 * Ask the Edge Function to build an Instacart shopping-list page from these
 * items and return its URL. Throws with a user-friendly message on failure.
 */
export async function createInstacartList(
  items: InstacartLineItem[],
  title = 'My gBOMBS Grocery List'
): Promise<string> {
  const linkbackUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : undefined;

  const { data, error } = await supabase.functions.invoke(
    'create-instacart-list',
    { body: { items, title, linkbackUrl } }
  );

  if (error) throw new Error(await functionErrorMessage(error));

  const res = data as { url?: string; error?: string };
  if (!res?.url) throw new Error(res?.error ?? 'No Instacart link returned.');
  return res.url;
}

/** Open an Instacart URL: a new tab on web, the in-app browser on native. */
export async function openInstacart(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}
