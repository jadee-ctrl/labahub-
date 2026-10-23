import type { IconType } from "react-icons";
import {
  IoBasketOutline, IoBedOutline, IoBriefcaseOutline, IoColorPaletteOutline, IoColorWandOutline, IoDiamondOutline, IoFlameOutline,
  IoFlashOutline, IoFlowerOutline, IoFootstepsOutline, IoLeafOutline, IoShirtOutline, IoSnowOutline, IoSparklesOutline, IoStarOutline,
  IoWaterOutline,
} from "react-icons/io5";

// The same icon names the customer app uses (Ionicons). Must match service_icon_choices() in 15_service_icons_delete.sql.
export const SERVICE_ICONS: { name: string; label: string; Icon: IconType }[] = [
  { name: "shirt-outline", label: "Shirt", Icon: IoShirtOutline },
  { name: "sparkles-outline", label: "Sparkles", Icon: IoSparklesOutline },
  { name: "flame-outline", label: "Iron / heat", Icon: IoFlameOutline },
  { name: "flash-outline", label: "Express", Icon: IoFlashOutline },
  { name: "water-outline", label: "Water", Icon: IoWaterOutline },
  { name: "bed-outline", label: "Bedding", Icon: IoBedOutline },
  { name: "basket-outline", label: "Basket", Icon: IoBasketOutline },
  { name: "snow-outline", label: "Cold wash", Icon: IoSnowOutline },
  { name: "color-wand-outline", label: "Stain removal", Icon: IoColorWandOutline },
  { name: "diamond-outline", label: "Premium", Icon: IoDiamondOutline },
  { name: "footsteps-outline", label: "Shoes", Icon: IoFootstepsOutline },
  { name: "briefcase-outline", label: "Bags", Icon: IoBriefcaseOutline },
  { name: "flower-outline", label: "Delicates", Icon: IoFlowerOutline },
  { name: "leaf-outline", label: "Eco", Icon: IoLeafOutline },
  { name: "star-outline", label: "Special", Icon: IoStarOutline },
  { name: "color-palette-outline", label: "Colors", Icon: IoColorPaletteOutline },
];

export const iconFor = (name?: string): IconType => SERVICE_ICONS.find((i) => i.name === name)?.Icon ?? IoWaterOutline;

/** First icon no other service uses (same rule as the database). Undefined when all are taken. */
export function nextFreeIcon(used: (string | undefined)[]): string | undefined {
  return SERVICE_ICONS.find((i) => !used.includes(i.name))?.name;
}

// Words in the service name -> icon. Same list and order as service_icon_from_name() in 15_service_icons_delete.sql.
const NAME_WORDS: [string, RegExp][] = [
  ["footsteps-outline", /shoe|sneaker|slipper|sandal|boot/],
  ["bed-outline", /comforter|blanket|bed|sheet|duvet|pillow|quilt|linen|towel/],
  ["briefcase-outline", /bag|backpack|luggage|purse/],
  ["color-wand-outline", /stain|spot/],
  ["flower-outline", /curtain|gown|delicate|silk|lace|barong|wedding|dress/],
  ["diamond-outline", /premium|vip|luxury/],
  ["sparkles-outline", /dry ?-?clean/],
  ["flame-outline", /iron|press|steam/],
  ["flash-outline", /express|rush|same ?-?day|quick/],
  ["snow-outline", /cold/],
  ["leaf-outline", /eco|organic|green/],
  ["color-palette-outline", /colou?r|dye/],
  ["basket-outline", /load|bulk|basket|kilo/],
  ["shirt-outline", /wash|fold|uniform|shirt|cloth/],
  ["water-outline", /soak|rinse|water/],
  ["star-outline", /special/],
];

/** Icon matching words in the name, if no other service uses it. */
export function iconFromName(name: string, used: (string | undefined)[]): string | undefined {
  const n = name.toLowerCase();
  return NAME_WORDS.find(([icon, re]) => re.test(n) && !used.includes(icon))?.[0];
}

/**
 * The icon the database will give this service (shown as a preview in the form):
 * new -> from the name, else the next free one; renamed -> from the new name if free, else unchanged.
 */
export function autoIcon(name: string, used: (string | undefined)[], current?: { icon?: string; name: string }): string | undefined {
  if (!current) return iconFromName(name, used) ?? nextFreeIcon(used);
  const others = used.filter((u) => u !== current.icon);
  if (name.trim().toLowerCase() !== current.name.trim().toLowerCase()) return iconFromName(name, others) ?? current.icon;
  return current.icon;
}