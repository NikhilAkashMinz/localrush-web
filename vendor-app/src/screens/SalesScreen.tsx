// What the shop has sold through LocalRush, worked out on the server from its delivered orders,
// at the price each item sold for. The same numbers as the website's Sales page.

import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { plural, rupee, when } from '../format';
import { deliveredAt } from '../orders';
import { useApp } from '../store';
import { color, type } from '../theme';
import type { Period, ProductSales, SalesReport } from '../types';
import { Card, Empty, Icon, Pill, Segmented, SectionTitle } from '../ui';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'all', label: 'All time' },
];

/** How each period reads in a sentence. */
const IN_PERIOD: Record<Period, string> = { today: 'today', week: 'in the last 7 days', all: 'so far' };

const priceText = (p: ProductSales) => (p.low === p.high ? rupee(p.low) : `${rupee(p.low)} to ${rupee(p.high)}`);

export default function SalesScreen() {
  const { api, orders, catalog } = useApp();
  const [period, setPeriod] = useState<Period>('today');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState(false);
  // Read again whenever an order is delivered.
  const delivered = orders
    .filter((o) => o.status === 'delivered')
    .map((o) => o.id)
    .join();

  const load = useCallback(async () => {
    try {
      setReport(await api.sales(period));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, [api, period]);

  useEffect(() => {
    void load();
  }, [load, delivered]);

  const pull = async () => {
    setPulling(true);
    await load();
    setPulling(false);
  };

  const current = report && report.period === period ? report : null;
  const chosen = current?.totals[period];
  const others = PERIODS.filter((p) => p.key !== period);
  const emojiOf = (pid: string) => catalog?.products.find((p) => p.id === pid)?.emoji ?? '📦';

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
        <Text style={st.heroLabel}>Sold {IN_PERIOD[period]}</Text>
        <Text style={st.heroValue}>{chosen ? rupee(chosen.revenue) : '…'}</Text>
        <View style={st.heroRow}>
          <View style={st.heroBit}>
            <Icon name="receipt-text-outline" size={18} tint={color.onDeep} />
            <Text style={st.heroBitText}>{chosen ? plural(chosen.orders, 'order') : '…'}</Text>
          </View>
          <View style={st.heroBit}>
            <Icon name="package-variant-closed" size={18} tint={color.onDeep} />
            <Text style={st.heroBitText}>{chosen ? plural(chosen.items, 'item') : '…'}</Text>
          </View>
        </View>
      </View>

      <View style={st.pair}>
        {others.map((o) => {
          const t = report?.totals[o.key];
          return (
            <Card key={o.key} style={st.half}>
              <Text style={st.halfLabel}>{o.label}</Text>
              <Text style={st.halfValue}>{t ? rupee(t.revenue) : '…'}</Text>
              <Text style={st.halfSub}>{t ? plural(t.orders, 'order') : ' '}</Text>
            </Card>
          );
        })}
      </View>

      <SectionTitle title="What sold" right={current ? <Pill text={plural(current.products.length, 'product')} tone="teal" /> : null} />
      {!current ? (
        <Card>
          <Text style={st.loading}>Adding up your sales…</Text>
        </Card>
      ) : current.products.length === 0 ? (
        <Empty
          icon="chart-box-outline"
          title={period === 'all' ? 'Nothing sold yet' : `Nothing sold ${IN_PERIOD[period]}`}
          body="An order counts as sold the moment the delivery partner hands it over to the customer."
        />
      ) : (
        <Card style={st.list}>
          {current.products.map((p, i) => (
            <View key={p.pid} style={[st.row, i > 0 && st.rowLine]}>
              <View style={st.emojiTile}>
                <Text style={st.emoji}>{emojiOf(p.pid)}</Text>
              </View>
              <View style={st.flex}>
                <Text style={st.name} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={st.meta}>
                  {p.qty} sold · {priceText(p)} each{p.unit ? ` · ${p.unit}` : ''}
                </Text>
              </View>
              <Text style={st.amount}>{rupee(p.revenue)}</Text>
            </View>
          ))}
        </Card>
      )}

      {current && current.orders.length > 0 ? (
        <>
          <SectionTitle title="Orders delivered" right={<Pill text={String(chosen?.orders ?? current.orders.length)} />} />
          <Card style={st.list}>
            {current.orders.map((o, i) => (
              <View key={o.id} style={[st.row, i > 0 && st.rowLine]}>
                <View style={st.doneIcon}>
                  <Icon name="check" size={18} tint={color.green} />
                </View>
                <View style={st.flex}>
                  <Text style={st.name} numberOfLines={1}>
                    {o.id} · {o.customerName}
                  </Text>
                  <Text style={st.meta} numberOfLines={1}>
                    {when(deliveredAt(o))} · {plural(o.lines.reduce((a, l) => a + l.qty, 0), 'item')}
                  </Text>
                </View>
                <Text style={st.amount}>{rupee(o.subtotal)}</Text>
              </View>
            ))}
          </Card>
          {chosen && chosen.orders > current.orders.length ? (
            <Text style={st.note}>
              Showing the latest {current.orders.length} of {chosen.orders} orders. The totals count all of them.
            </Text>
          ) : null}
        </>
      ) : null}

      <View style={st.notes}>
        <Icon name="information-outline" size={18} tint={color.mute} />
        <Text style={st.noteText}>
          An order counts once it is delivered. The amounts are what customers paid for the items, without the delivery fee.
        </Text>
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { padding: 16, paddingBottom: 28 },
  flex: { flex: 1 },
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
  halfValue: { fontSize: 22, fontWeight: '800', color: color.ink, marginTop: 4 },
  halfSub: { fontSize: 13, color: color.mute, marginTop: 2 },
  loading: { fontSize: type.body, color: color.mute, textAlign: 'center' },
  list: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.line },
  emojiTile: { width: 42, height: 42, borderRadius: 13, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  doneIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.greenTint, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: color.ink },
  meta: { fontSize: 13, color: color.mute, marginTop: 2 },
  amount: { fontSize: 16.5, fontWeight: '800', color: color.teal },
  note: { fontSize: 13, color: color.mute, marginTop: 8, textAlign: 'center' },
  notes: { flexDirection: 'row', gap: 8, marginTop: 18 },
  noteText: { flex: 1, fontSize: 13, color: color.mute, lineHeight: 18 },
});
