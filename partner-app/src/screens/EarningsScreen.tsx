// What the partner has earned, worked out on the server from their completed deliveries,
// and the list of trips behind it.

import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { areaPart, km, plural, rupee, when } from '../format';
import { deliveredAt, PAY_BASE, PAY_PER_KM, payOf } from '../pay';
import { useApp } from '../store';
import { color, type } from '../theme';
import type { EarningsReport, Order, Period } from '../types';
import { Card, Empty, Icon, Pill, Segmented, SectionTitle } from '../ui';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'all', label: 'All time' },
];

/** How each period reads in a sentence. */
const IN_PERIOD: Record<Period, string> = { today: 'today', week: 'in the last 7 days', all: 'so far' };

export default function EarningsScreen() {
  const { api, orders } = useApp();
  const [period, setPeriod] = useState<Period>('today');
  const [report, setReport] = useState<EarningsReport | null>(null);
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState(false);
  // Read again whenever a delivery is completed or taken.
  const progress = orders.map((o) => o.id + o.status).join();

  const load = useCallback(async () => {
    try {
      setReport(await api.earnings(period));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, [api, period]);

  useEffect(() => {
    void load();
  }, [load, progress]);

  const pull = async () => {
    setPulling(true);
    await load();
    setPulling(false);
  };

  const current = report && report.period === period ? report : null;
  const totals = current?.totals[period];

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={st.scroll}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} colors={[color.teal]} tintColor={color.teal} />}
    >
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      {error ? (
        <Card style={st.problem}>
          <Icon name="alert-circle" tint={color.red} />
          <Text style={st.problemText}>{error}</Text>
        </Card>
      ) : null}

      <View style={st.hero}>
        <Text style={st.heroLabel}>Earned {IN_PERIOD[period]}</Text>
        <Text style={st.heroValue}>{totals ? rupee(totals.earned) : '…'}</Text>
        <View style={st.heroRow}>
          <View style={st.heroBit}>
            <Icon name="moped" size={18} tint={color.onDeep} />
            <Text style={st.heroBitText}>{totals ? plural(totals.deliveries, 'delivery', 'deliveries') : '…'}</Text>
          </View>
          <View style={st.heroBit}>
            <Icon name="map-marker-distance" size={18} tint={color.onDeep} />
            <Text style={st.heroBitText}>{totals ? `${km(totals.km)} ridden` : '…'}</Text>
          </View>
        </View>
      </View>

      <View style={st.pair}>
        <Card style={st.half}>
          <Text style={st.halfLabel}>On the way</Text>
          <Text style={[st.halfValue, current?.pending ? st.teal : null]}>{current ? rupee(current.pending) : '…'}</Text>
          <Text style={st.halfSub}>{current?.pending ? 'yours once delivered' : 'no delivery under way'}</Text>
        </Card>
        <Card style={st.half}>
          <Text style={st.halfLabel}>Cash to hand over</Text>
          <Text style={[st.halfValue, totals?.cash ? st.goldDeep : null]}>{totals ? rupee(totals.cash) : '…'}</Text>
          <Text style={st.halfSub}>collected at the door {IN_PERIOD[period]}</Text>
        </Card>
      </View>

      <SectionTitle title="Trips" right={current ? <Pill text={String(current.orders.length)} tone="teal" /> : null} />
      {!current ? (
        <Card>
          <Text style={st.loading}>Adding up your earnings…</Text>
        </Card>
      ) : current.orders.length === 0 ? (
        <Empty
          icon="history"
          title={period === 'all' ? 'No deliveries yet' : `No deliveries ${IN_PERIOD[period]}`}
          body="Each delivery you complete is listed here with what it paid."
        />
      ) : (
        <Card style={st.list}>
          {current.orders.map((o, i) => (
            <Trip key={o.id} order={o} first={i === 0} />
          ))}
        </Card>
      )}

      <View style={st.notes}>
        <View style={st.note}>
          <Icon name="wallet-outline" size={18} tint={color.mute} />
          <Text style={st.noteText}>
            Each delivery pays {rupee(PAY_BASE)} plus {rupee(PAY_PER_KM)} for every km you ride, to the shop and on to the customer. The
            amount is fixed when you take the delivery.
          </Text>
        </View>
        <View style={st.note}>
          <Icon name="cash" size={18} tint={color.mute} />
          <Text style={st.noteText}>
            Cash you collect at the door is the customer&apos;s payment for their order. Hand it over to LocalRush: it is not part of your
            earnings.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Trip({ order, first }: { order: Order; first: boolean }) {
  return (
    <View style={[st.trip, !first && st.tripLine]}>
      <View style={st.tripIcon}>
        <Icon name="check" size={18} tint={color.green} />
      </View>
      <View style={st.tripText}>
        <Text style={st.tripTitle} numberOfLines={1}>
          {order.storeName}
        </Text>
        <Text style={st.tripSub} numberOfLines={1}>
          to {areaPart(order.address)} · {km((order.pickupKm ?? 0) + order.distKm)}
        </Text>
        <Text style={st.tripWhen}>
          {when(deliveredAt(order))} · {order.id}
        </Text>
      </View>
      <Text style={st.tripPay}>{rupee(payOf(order))}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { padding: 16, paddingBottom: 28 },
  problem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: color.redTint, borderColor: '#F5C2C2' },
  problemText: { flex: 1, color: color.red, fontSize: 14, fontWeight: '600' },
  hero: { backgroundColor: color.deep, borderRadius: 22, padding: 20, marginTop: 14 },
  heroLabel: { color: color.onDeep, fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { color: color.gold, fontSize: 44, fontWeight: '800', marginTop: 2 },
  heroRow: { flexDirection: 'row', gap: 18, marginTop: 6, flexWrap: 'wrap' },
  heroBit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroBitText: { color: color.white, fontSize: 15, fontWeight: '700' },
  pair: { flexDirection: 'row', gap: 12, marginTop: 12 },
  half: { flex: 1, paddingVertical: 14 },
  halfLabel: { fontSize: 12.5, fontWeight: '800', color: color.faint, textTransform: 'uppercase', letterSpacing: 0.5 },
  halfValue: { fontSize: 24, fontWeight: '800', color: color.ink, marginTop: 4 },
  halfSub: { fontSize: 13, color: color.mute, marginTop: 2 },
  teal: { color: color.teal },
  goldDeep: { color: color.goldDeep },
  loading: { fontSize: type.body, color: color.mute, textAlign: 'center' },
  list: { paddingVertical: 4, paddingHorizontal: 14 },
  trip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  tripLine: { borderTopWidth: 1, borderTopColor: color.line },
  tripIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.greenTint, alignItems: 'center', justifyContent: 'center' },
  tripText: { flex: 1 },
  tripTitle: { fontSize: 15.5, fontWeight: '800', color: color.ink },
  tripSub: { fontSize: 13.5, color: color.mute, marginTop: 1 },
  tripWhen: { fontSize: 12.5, color: color.faint, marginTop: 1 },
  tripPay: { fontSize: 18, fontWeight: '800', color: color.teal },
  notes: { marginTop: 18, gap: 10 },
  note: { flexDirection: 'row', gap: 8 },
  noteText: { flex: 1, fontSize: 13, color: color.mute, lineHeight: 18 },
});
