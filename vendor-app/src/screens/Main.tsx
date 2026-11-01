// After logging in: four tabs. Orders is where new orders arrive; the others are the shop's
// products and stock, its sales, and its settings.

import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store';
import { color } from '../theme';
import { BannerView, Icon, LiveBadge, Pill, TopBar, type IconName } from '../ui';
import OrdersScreen from './OrdersScreen';
import ProductsScreen from './ProductsScreen';
import SalesScreen from './SalesScreen';
import ShopScreen from './ShopScreen';

type Tab = 'orders' | 'products' | 'sales' | 'shop';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'orders', label: 'Orders', icon: 'clipboard-text-outline' },
  { key: 'products', label: 'Products', icon: 'package-variant-closed' },
  { key: 'sales', label: 'Sales', icon: 'chart-box-outline' },
  { key: 'shop', label: 'Shop', icon: 'storefront-outline' },
];

export default function Main() {
  const { shop, orders, reachable } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('orders');
  const waiting = orders.filter((o) => o.status === 'placed').length;

  // Android's back button goes back to Orders before it leaves the app.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'orders') return false;
      setTab('orders');
      return true;
    });
    return () => subscription.remove();
  }, [tab]);

  const title = TABS.find((t) => t.key === tab)!.label;
  const status =
    reachable === false ? (
      <Pill tone="onDeep" dot="#FF8A8A" text="No connection" />
    ) : shop?.paused ? (
      <Pill tone="onDeep" dot="#A7B0BE" text="Paused" />
    ) : (
      <Pill tone="onDeep" dot="#4ADE80" text="Open" />
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
        {tab === 'orders' ? <OrdersScreen /> : tab === 'products' ? <ProductsScreen /> : tab === 'sales' ? <SalesScreen /> : <ShopScreen />}
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
              accessibilityLabel={t.key === 'orders' && waiting > 0 ? `${t.label}, ${waiting} waiting` : t.label}
              style={st.tab}
            >
              <View style={[st.tabIcon, on && st.tabIconOn]}>
                <Icon name={t.icon} size={24} tint={on ? color.teal : color.faint} />
                {t.key === 'orders' && waiting > 0 ? (
                  <View style={st.badge}>
                    <Text style={st.badgeText}>{waiting > 9 ? '9+' : String(waiting)}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[st.tabLabel, on && st.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* Tapping a new-order banner opens the Orders tab. */}
      <BannerView onOpen={(b) => (b.tone === 'new' ? setTab('orders') : undefined)} />
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
  badge: {
    position: 'absolute',
    top: -3,
    right: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: color.gold,
    borderWidth: 2,
    borderColor: color.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: color.deep },
});
