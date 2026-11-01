// After logging in: three tabs. Deliveries shows the jobs nearby, or the delivery under way.

import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store';
import { color } from '../theme';
import { BannerView, Icon, LiveBadge, Pill, TopBar, type IconName } from '../ui';
import AccountScreen from './AccountScreen';
import DeliveryScreen from './DeliveryScreen';
import EarningsScreen from './EarningsScreen';
import JobsScreen from './JobsScreen';

type Tab = 'jobs' | 'earnings' | 'account';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'jobs', label: 'Deliveries', icon: 'moped' },
  { key: 'earnings', label: 'Earnings', icon: 'wallet-outline' },
  { key: 'account', label: 'Account', icon: 'account-circle-outline' },
];

export default function Main() {
  const { user, active, reachable } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('jobs');

  // Android's back button goes back to Deliveries before it leaves the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'jobs') return false;
      setTab('jobs');
      return true;
    });
    return () => subscription.remove();
  }, [tab]);

  // Taking a delivery brings the partner to it, whichever tab they were on.
  const activeId = active?.id;
  useEffect(() => {
    if (activeId) setTab('jobs');
  }, [activeId]);

  const title = tab === 'jobs' ? (active ? 'Your delivery' : 'Deliveries') : tab === 'earnings' ? 'Earnings' : 'Account';
  const status =
    reachable === false ? (
      <Pill tone="onDeep" dot="#FF8A8A" text="No connection" />
    ) : (
      <Pill tone="onDeep" dot={user?.online ? '#4ADE80' : '#A7B0BE'} text={user?.online ? 'Online' : 'Offline'} />
    );

  return (
    <View style={st.screen}>
      <TopBar
        title={title}
        right={
          <View style={st.right}>
            <LiveBadge />
            {status}
          </View>
        }
      />
      <View style={st.body}>
        {tab === 'jobs' ? active ? <DeliveryScreen order={active} /> : <JobsScreen /> : tab === 'earnings' ? <EarningsScreen /> : <AccountScreen />}
      </View>
      <View style={[st.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              style={st.tab}
            >
              <View style={[st.tabIcon, on && st.tabIconOn]}>
                <Icon name={t.icon} size={24} tint={on ? color.teal : color.faint} />
                {t.key === 'jobs' && active ? <View style={st.badge} /> : null}
              </View>
              <Text style={[st.tabLabel, on && st.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <BannerView />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  body: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: color.card,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  tabIcon: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tabIconOn: { backgroundColor: color.tealTint },
  tabLabel: { fontSize: 12.5, fontWeight: '700', color: color.faint },
  tabLabelOn: { color: color.teal },
  badge: { position: 'absolute', top: 2, right: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: color.gold, borderWidth: 2, borderColor: color.card },
});
