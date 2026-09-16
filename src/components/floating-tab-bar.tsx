/**
 * Floating bottom navigation — 4 tabs + central FAB.
 *
 * DESIGN.md §3/§5: floating bar (not a docked tab bar), frosted
 * `surfaceCard` @75% + blur, 1px hairline, icons 24px `textSecondary`
 * inactive / `accent` active. The centre FAB is 56px, gradient gold with a
 * soft gold glow, and opens the Add Transaction modal.
 *
 * Layout maths (so the screen clearance in `Screen` is exact):
 *   gap 16 + bar 64 + FAB overhang 16 = 96 = layout.navClearance
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Fragment } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gradients, layout, radius, shadows, spacing } from '@/theme';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

const BAR_GAP = spacing.md; // 16
const FAB_OVERHANG = spacing.md; // 16

/** Icon per tab route, in tab order. */
const TAB_ICONS: Record<string, MaterialIconName> = {
  index: 'dashboard',
  analytics: 'insights',
  budgets: 'account-balance-wallet',
  profile: 'person',
};

function TabIcon({
  icon,
  focused,
}: {
  icon: MaterialIconName;
  focused: boolean;
}) {
  return (
    <MaterialIcons
      name={icon}
      size={24}
      color={focused ? colors.accent : colors.textSecondary}
    />
  );
}

function AddTransactionFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add Transaction"
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
    >
      <LinearGradient
        colors={[...gradients.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fabGradient}
      >
        <MaterialIcons name="add" size={28} color={colors.textOnAccent} />
      </LinearGradient>
    </Pressable>
  );
}

export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + BAR_GAP }]}
    >
      <View style={styles.bar}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 40 : 0}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Fragment key={route.key}>
              {index === 2 ? <View style={styles.fabSpacer} /> : null}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={
                  options.tabBarAccessibilityLabel ??
                  options.title ??
                  route.name
                }
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.tabItem}
              >
                <TabIcon
                  icon={TAB_ICONS[route.name] ?? 'circle'}
                  focused={focused}
                />
              </Pressable>
            </Fragment>
          );
        })}
      </View>
      <AddTransactionFab onPress={() => navigation.navigate('add-transaction')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: layout.screenMargin,
    right: layout.screenMargin,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    height: layout.navBarHeight,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceCardTranslucent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: shadows.heroAmbient,
  },
  tabItem: {
    flex: 1,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSpacer: {
    width: layout.fabSize,
  },
  fab: {
    position: 'absolute',
    top: -FAB_OVERHANG,
    width: layout.fabSize,
    height: layout.fabSize,
    borderRadius: radius.full,
    overflow: 'hidden',
    boxShadow: shadows.fab,
  },
  fabPressed: {
    transform: [{ scale: 0.99 }],
  },
  fabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
