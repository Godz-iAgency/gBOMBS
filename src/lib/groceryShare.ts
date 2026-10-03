import type { GroceryList } from '@/services/gemini';

/** Plain checklist for sharing; preserves every ingredient, quantity and check-off. */
export function formatGroceryList(list: GroceryList, title: string): string {
  const sections = list.sections
    .filter((section) => section.items.length > 0)
    .map((section) => [
      section.title,
      ...section.items.map((item) =>
        `[${item.checked ? 'x' : ' '}] ${item.quantity ? item.quantity + ' ' : ''}${item.item}`
      ),
    ].join('\n'));
  return [title, ...sections].join('\n\n');
}
