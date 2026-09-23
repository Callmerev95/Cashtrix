/**
 * Tab navigator — 4 tabs rendered in the floating bar; the centre FAB is
 * part of `FloatingTabBar` and opens the Add Transaction modal route.
 *
 * The offline banner (D4) rides above the tab container in-flow, so it pushes
 * content down instead of overlaying headers.
 */
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FloatingTabBar } from '@/components/floating-tab-bar';
import { OfflineBanner } from '@/features/connectivity';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <OfflineBanner />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
        <Tabs.Screen name="budgets" options={{ title: 'Budgets' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
