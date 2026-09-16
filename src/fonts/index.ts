/**
 * Font loading — Inter (structural) + JetBrains Mono (monetary values).
 *
 * DESIGN.md §2: Inter for all structural text, JetBrains Mono for monetary
 * values only. Do not follow Stitch's Public Sans drift on the currency
 * tokens (accepted drift — see AGENTS.md / DESIGN.md §1).
 *
 * Import each weight from its own subpath: the package root re-exports every
 * weight (all ~40 .ttf files), while these deep imports bundle only the five
 * faces the type scale actually uses.
 */
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';

export const appFonts = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} as const;
