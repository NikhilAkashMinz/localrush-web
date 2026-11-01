// The home screen: the shop's orders as they come in. New ones buzz the phone; the owner accepts
// each one, packs it and marks it ready, and every step shows up straight away on the customer's
// tracking page and on the delivery partners' phones. The same board as the website's dashboard.

import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { hoursText, startOfDayIST, withinHours } from '../catalog';
import { areaPart, itemCount, plural, rupee, timer } from '../format';
import { useNow } from '../hooks';
import { deliveredAt, isDone, LATE_MS, lineName, since } from '../orders';
import { FRESH_MS, useApp } from '../store';
import { color, radius, type } from '../theme';
import type { Order, Status } from '../types';
import { Button, Card, Empty, Icon, Pill, SectionTitle } from '../ui';

const SECTIONS: { key: string; title: string; statuses: Status[] }[] = [
  { key: 'new', title: 'New orders', statuses: ['placed'] },
  { key: 'packing', title: 'Packing', statuses: ['accepted'] },
  { key: 'ready', title: 'Waiting for pickup', statuses: ['packed', 'assigned'] },
  { key: 'out', title: 'Out for delivery', statuses: ['picked'] },
];

const firstWord = (name: string) => name.split(/\s+/)[0] ?? name;

export default function OrdersScreen() {
  const { user, shop, orders, refresh, setPaused, notify, reachable, problem } = useApp();
  const now = useNow(1000);
  const [pulling, setPulling] = useState(false);
  const [pausing, setPausing] = useState(false);
  if (!user) return null;

  const dayStart = startOfDayIST(now);
  const waiting = orders.filter((o) => o.status === 'placed');
  const today = orders.filter((o) => o.createdAt >= dayStart && o.status !== 'cancelled' && o.status !== 'rejected');
  // Delivered today, counted by when it was handed over: the same rule as the Sales tab.
  const delivered = orders.filter((o) => o.status === 'delivered' && deliveredAt(o) >= dayStart);
  const sold = delivered.reduce((a, o) => a + o.subtotal, 0);
  const finished = orders
    .filter((o) => isDone(o.status) && (o.status === 'delivered' ? deliveredAt(o) : o.updatedAt) >= dayStart)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const paused = !!shop?.paused;
  /** Orders accepted and not yet delivered. */
  const working = orders.filter((o) => !isDone(o.status) && o.status !== 'placed').length;
  const closedNow = !!shop && !withinHours(shop, now);

  const togglePause = async () => {
    setPausing(true);
    try {
      await setPaused(!paused);
      notify(
        paused
          ? { tone: 'good', title: 'You are taking orders again', body: 'Customers nearby can order from you.' }
          : { tone: 'info', title: 'Shop paused', body: 'Customers cannot order from you until you switch it back on.' },
      );
    } catch (e) {
      notify({ tone: 'bad', title: errorText(e) });
    }
    setPausing(false);
  };

  const pull = async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  };

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={st.scroll}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} colors={[color.teal]} tintColor={color.white} />}
    >
      <View style={st.hero}>
        <Text style={st.hello} numberOfLines={2}>
          {shop?.name ?? user.name}
        </Text>
        <Text style={st.heroSub}>{shop ? `${shop.area} · ${hoursText(shop)}` : 'Loading your shop…'}</Text>

        <Pressable
          onPress={togglePause}
          disabled={pausing || !shop}
          accessibilityRole="switch"
          accessibilityState={{ checked: !paused, busy: pausing }}
          accessibilityLabel={paused ? 'Paused. Tap to take orders again' : 'Taking orders. Tap to pause'}
          style={({ pressed }) => [st.toggle, paused ? st.toggleOff : st.toggleOn, pressed && st.pressed]}
        >
          <View style={[st.knob, paused ? st.knobOff : st.knobOn]}>
            {pausing ? <ActivityIndicator color={paused ? color.deep : color.white} /> : <Icon name={paused ? 'pause' : 'storefront'} size={24} tint={paused ? color.deep : color.white} />}
          </View>
          <View style={st.toggleText}>
            <Text style={[st.toggleTitle, { color: paused ? color.deep : color.white }]}>{paused ? 'Paused' : 'Taking orders'}</Text>
            <Text style={[st.toggleSub, { color: paused ? 'rgba(7,63,61,0.75)' : color.onDeep }]}>
              {paused ? 'Tap to take orders again' : 'Tap to pause new orders'}
            </Text>
          </View>
          {paused ? <Icon name="chevron-right" size={26} tint={color.deep} /> : <View style={st.liveDot} />}
        </Pressable>

        <View style={st.stats}>
          <Stat label="Waiting" value={String(waiting.length)} hot={waiting.length > 0} />
          <View style={st.statDivider} />
          <Stat label="Orders today" value={String(today.length)} />
          <View style={st.statDivider} />
          <Stat label="Sold today" value={rupee(sold)} gold />
        </View>
      </View>

      <View style={st.body}>
        {reachable === false ? (
          <Card style={[st.notice, st.noticeBad]}>
            <Icon name="lan-disconnect" tint={color.red} />
            <Text style={[st.noticeText, { color: color.red }]}>{problem ?? 'Cannot reach the LocalRush server.'} Trying again…</Text>
          </Card>
        ) : null}
        {paused ? (
          <Card style={[st.notice, st.noticeGold]}>
            <Icon name="pause-circle-outline" tint={color.goldDeep} />
            <Text style={[st.noticeText, { color: color.goldDeep }]}>
              Your shop is paused, so customers cannot order from you. Orders you already have are below.
            </Text>
          </Card>
        ) : closedNow && shop ? (
          <Card style={[st.notice, st.noticeGold]}>
            <Icon name="clock-outline" tint={color.goldDeep} />
            <Text style={[st.noticeText, { color: color.goldDeep }]}>
              Closed at this hour (open {hoursText(shop)}), so customers do not see your shop right now.
            </Text>
          </Card>
        ) : null}

        {SECTIONS.map((section) => {
          const list = orders.filter((o) => section.statuses.includes(o.status)).sort((a, b) => a.createdAt - b.createdAt);
          if (list.length === 0 && section.key !== 'new') return null;
          return (
            <View key={section.key}>
              <SectionTitle title={section.title} right={<Pill text={String(list.length)} tone={list.length && section.key === 'new' ? 'gold' : 'neutral'} />} />
              {list.length === 0 && working > 0 ? (
                // Other orders are under way: a short line, so they stay near the top.
                <Card style={st.quiet}>
                  <Icon name="bell-ring-outline" size={20} tint={color.teal} />
                  <Text style={st.quietText}>No new orders right now. New ones appear here and buzz the phone.</Text>
                </Card>
              ) : list.length === 0 ? (
                <Empty
                  icon="bell-ring-outline"
                  title="No new orders"
                  body={
                    paused
                      ? 'Your shop is paused. Switch it back on to get orders.'
                      : 'Orders from customers near your shop appear here by themselves, and your phone buzzes.'
                  }
                />
              ) : (
                list.map((o) => <OrderCard key={o.id} order={o} now={now} />)
              )}
            </View>
          );
        })}

        {finished.length > 0 ? (
          <>
            <SectionTitle title="Finished today" right={<Pill text={String(finished.length)} />} />
            <Card style={st.doneList}>
              {finished.map((o, i) => (
                <DoneRow key={o.id} order={o} first={i === 0} />
              ))}
            </Card>
          </>
        ) : null}

        <Text style={st.footnote}>Running low on something? Change your stock on the Products tab and customers see it straight away.</Text>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, hot, gold }: { label: string; value: string; hot?: boolean; gold?: boolean }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={[st.statValue, gold && st.gold, hot && st.hot]}>{value}</Text>
    </View>
  );
}

function OrderCard({ order, now }: { order: Order; now: number }) {
  const { act, notify, fresh } = useApp();
  const [busy, setBusy] = useState<'accept' | 'reject' | 'pack' | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const waited = now - since(order);
  const late = order.status === 'placed' && waited > LATE_MS;
  const isFresh = fresh[order.id] !== undefined && now - fresh[order.id] < FRESH_MS;
  const count = itemCount(order.lines);
  const packing = order.status === 'accepted';
  const ticks = order.lines.filter((l) => ticked[l.pid]).length;

  const run = async (action: 'accept' | 'reject' | 'pack') => {
    setBusy(action);
    try {
      const done = await act(order.id, action);
      if (action === 'accept') notify({ tone: 'good', title: `${order.id} accepted`, body: 'Pack it, then tap Packed and ready.' });
      else if (action === 'pack') notify({ tone: 'good', title: `${order.id} is ready for pickup`, body: 'Delivery partners nearby have been told.' });
      else {
        notify({
          tone: 'info',
          title: `${order.id} turned down`,
          body: done.storeId !== order.storeId ? `It has gone to ${done.storeName} instead.` : 'No other shop nearby could take it, so the customer has been told.',
        });
      }
    } catch (e) {
      notify({ tone: 'bad', title: errorText(e) });
    }
    setBusy(null);
  };

  const turnDown = () =>
    Alert.alert('Turn down this order?', `LocalRush will offer ${order.id} to another shop near ${order.customerName}. Turn it down only if you cannot pack it.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Turn down', style: 'destructive', onPress: () => void run('reject') },
    ]);

  const call = async () => {
    try {
      await Linking.openURL(`tel:+91${order.customerPhone}`);
    } catch {
      notify({ tone: 'bad', title: 'Could not start a call.' });
    }
  };

  return (
    <Card style={[st.card, isFresh && st.cardFresh, late && st.cardLate]}>
      <View style={st.cardHead}>
        <View style={st.flex}>
          <Text style={st.orderId}>{order.id}</Text>
          <Text style={st.customer}>
            {order.customerName} · {plural(count, 'item')} · {rupee(order.subtotal)}
          </Text>
        </View>
        <View style={[st.timer, late && st.timerLate]} accessibilityLabel={`In this step for ${timer(waited)}`}>
          <Icon name="timer-outline" size={16} tint={late ? color.red : color.mute} />
          <Text style={[st.timerText, late && st.timerTextLate]}>{timer(waited)}</Text>
        </View>
      </View>
      {late ? <Text style={st.lateText}>Waiting over 2 minutes. Accept it or turn it down.</Text> : null}

      <View style={st.lines}>
        {packing ? <Text style={st.packHint}>Tick each item as you pack it · {ticks} of {order.lines.length}</Text> : null}
        {order.lines.map((l) => {
          const on = !!ticked[l.pid];
          const content = (
            <>
              {packing ? <Icon name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={24} tint={on ? color.green : color.faint} /> : null}
              <Text style={[st.qty, on && st.lineDone]}>{l.qty} ×</Text>
              <Text style={[st.lineName, on && st.lineDone]}>
                {lineName(l)}
                {l.unit ? <Text style={st.unit}>  {l.unit}</Text> : null}
              </Text>
              <Text style={[st.linePrice, on && st.lineDone]}>{rupee(l.qty * l.price)}</Text>
            </>
          );
          return packing ? (
            <Pressable
              key={l.pid}
              onPress={() => setTicked((t) => ({ ...t, [l.pid]: !on }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [st.line, pressed && st.pressed]}
            >
              {content}
            </Pressable>
          ) : (
            <View key={l.pid} style={st.line}>
              {content}
            </View>
          );
        })}
      </View>

      <View style={st.tags}>
        {order.payment === 'cod' ? (
          <Pill tone="gold" icon="cash" text={`Cash on delivery · ${rupee(order.total)}`} />
        ) : (
          <Pill tone="green" icon="check-circle" text="Paid online" />
        )}
        <Pill icon="map-marker-outline" text={`To ${areaPart(order.address)}`} />
      </View>

      {order.status === 'placed' ? (
        <>
          <View style={st.row}>
            <Button title="Accept" icon="check" onPress={() => void run('accept')} busy={busy === 'accept'} disabled={busy !== null} style={st.flex} />
            <Button title="Turn down" kind="danger" onPress={turnDown} busy={busy === 'reject'} disabled={busy !== null} style={st.flex} />
          </View>
          {order.customerPhone ? (
            <Pressable onPress={call} accessibilityRole="button" style={st.callLink} hitSlop={8}>
              <Icon name="phone" size={16} tint={color.teal} />
              <Text style={st.callText}>Call {firstWord(order.customerName)} about this order</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      {packing ? (
        <Button title="Packed and ready" kind="gold" icon="package-variant-closed" onPress={() => void run('pack')} busy={busy === 'pack'} />
      ) : null}
      {order.status === 'packed' ? (
        <View style={st.wait}>
          <ActivityIndicator color={color.teal} />
          <Text style={st.waitText}>Looking for a delivery partner nearby…</Text>
        </View>
      ) : null}
      {order.status === 'assigned' ? (
        <View style={[st.wait, st.waitOn]}>
          <Icon name="moped" size={22} tint={color.tealDark} />
          <Text style={st.waitText}>
            <Text style={st.bold}>{order.partnerName ?? 'A delivery partner'}</Text> is coming to collect it. Hand over the bag when they arrive.
          </Text>
        </View>
      ) : null}
      {order.status === 'picked' ? (
        <View style={[st.wait, st.waitOn]}>
          <Icon name="moped" size={22} tint={color.tealDark} />
          <Text style={st.waitText}>
            <Text style={st.bold}>{order.partnerName ?? 'The delivery partner'}</Text> is taking it to {firstWord(order.customerName)}.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function DoneRow({ order, first }: { order: Order; first: boolean }) {
  const ok = order.status === 'delivered';
  const outcome = ok ? `Delivered by ${order.partnerName ?? 'partner'}` : order.status === 'cancelled' ? 'Cancelled by the customer' : 'Turned down';
  return (
    <View style={[st.done, !first && st.doneLine]}>
      <View style={[st.doneIcon, { backgroundColor: ok ? color.greenTint : color.paper }]}>
        <Icon name={ok ? 'check' : 'close'} size={18} tint={ok ? color.green : color.faint} />
      </View>
      <View style={st.flex}>
        <Text style={st.doneTitle} numberOfLines={1}>
          {order.id} · {order.customerName}
        </Text>
        <Text style={[st.doneSub, ok && { color: color.green }]} numberOfLines={1}>
          {outcome}
        </Text>
      </View>
      <Text style={[st.doneAmount, !ok && st.struck]}>{rupee(order.subtotal)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { paddingBottom: 28 },
  flex: { flex: 1 },
  bold: { fontWeight: '800' },
  pressed: { opacity: 0.85 },
  hero: {
    backgroundColor: color.deep,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  hello: { color: color.white, fontSize: type.hero, fontWeight: '800' },
  heroSub: { color: color.onDeep, fontSize: 14, marginTop: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 20 },
  toggleOff: { backgroundColor: color.gold },
  toggleOn: { backgroundColor: 'rgba(74,222,128,0.16)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.55)' },
  knob: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  knobOff: { backgroundColor: 'rgba(255,255,255,0.55)' },
  knobOn: { backgroundColor: color.green },
  toggleText: { flex: 1 },
  toggleTitle: { fontSize: 19, fontWeight: '800' },
  toggleSub: { fontSize: 13.5, marginTop: 1 },
  liveDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#4ADE80', marginRight: 6 },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: color.onDeepFaint, borderRadius: 16, paddingVertical: 10 },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)' },
  statLabel: { color: color.onDeep, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: color.white, fontSize: 21, fontWeight: '800', marginTop: 2 },
  gold: { color: color.gold },
  hot: { color: color.gold },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  noticeBad: { backgroundColor: color.redTint, borderColor: '#F5C2C2' },
  noticeGold: { backgroundColor: color.goldTint, borderColor: '#F4DDA6' },
  noticeText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  quietText: { flex: 1, fontSize: 14, color: color.mute, lineHeight: 19 },
  card: { marginBottom: 12, gap: 12 },
  cardFresh: { borderColor: color.gold, borderWidth: 2.5, backgroundColor: '#FFFBF0' },
  cardLate: { borderColor: color.red, borderWidth: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderId: { fontSize: type.heading, fontWeight: '800', color: color.ink, letterSpacing: 0.3 },
  customer: { fontSize: 14, color: color.mute, marginTop: 2 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: color.paper },
  timerLate: { backgroundColor: color.redTint },
  timerText: { fontSize: 14, fontWeight: '800', color: color.mute },
  timerTextLate: { color: color.red },
  lateText: { fontSize: 13.5, fontWeight: '700', color: color.red, marginTop: -6 },
  lines: { borderTopWidth: 1, borderTopColor: color.line },
  packHint: { fontSize: 13, fontWeight: '700', color: color.teal, marginTop: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: color.line },
  qty: { fontSize: 16, fontWeight: '800', color: color.ink, minWidth: 32 },
  lineName: { flex: 1, fontSize: 15.5, color: color.ink },
  unit: { fontSize: 13, color: color.mute },
  linePrice: { fontSize: 15, fontWeight: '700', color: color.ink },
  lineDone: { color: color.faint },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  callLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -2 },
  callText: { color: color.teal, fontWeight: '700', fontSize: 14 },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: color.paper },
  waitOn: { backgroundColor: color.tealTint },
  waitText: { flex: 1, fontSize: 14.5, color: color.ink, lineHeight: 20 },
  doneList: { paddingVertical: 4, paddingHorizontal: 14 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  doneLine: { borderTopWidth: 1, borderTopColor: color.line },
  doneIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 15, fontWeight: '800', color: color.ink },
  doneSub: { fontSize: 13, color: color.mute, marginTop: 1 },
  doneAmount: { fontSize: 16, fontWeight: '800', color: color.ink },
  struck: { color: color.faint, textDecorationLine: 'line-through' },
  footnote: { fontSize: 13, color: color.mute, lineHeight: 18, marginTop: 18, textAlign: 'center' },
});
