// The home screen: go online or offline, see where you are, and take a delivery from the packed
// orders at shops near you. New ones appear by themselves and make the phone buzz.

import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { ago, areaPart, itemCount, km, plural, rupee } from '../format';
import { useNow } from '../hooks';
import { deliveredAt, packedAt, PAY_BASE, PAY_PER_KM, payOf } from '../pay';
import { useApp } from '../store';
import { color, type } from '../theme';
import type { Job, Order } from '../types';
import { Button, Card, Empty, Icon, Pill, SectionTitle } from '../ui';
import { AreaSheet, gpsProblem, LocationCard } from './LocationParts';

const startOfToday = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function today(orders: Order[], now: number) {
  const from = startOfToday(now);
  const done = orders.filter((o) => o.status === 'delivered' && deliveredAt(o) >= from);
  return { count: done.length, earned: done.reduce((a, o) => a + payOf(o), 0) };
}

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export default function JobsScreen() {
  const { user, jobs, orders, setOnline, refresh, notify, reachable, problem, gpsWanted, gps } = useApp();
  const [toggling, setToggling] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const now = useNow(30_000);
  if (!user) return null;
  const online = !!user.online;
  const sum = today(orders, now);
  // If GPS is wanted but not working, say so at the top; otherwise the jobs come first.
  const locationFirst = gpsProblem(gpsWanted, user.online, gps);

  const toggle = async () => {
    setToggling(true);
    try {
      await setOnline(!online);
      notify({ tone: online ? 'info' : 'good', title: online ? 'You are offline' : 'You are online', body: online ? undefined : 'New deliveries near you will buzz your phone.' });
    } catch (e) {
      notify({ tone: 'bad', title: errorText(e) });
    }
    setToggling(false);
  };

  const pull = async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  };

  return (
    <View style={st.screen}>
      <ScrollView
        contentContainerStyle={st.scroll}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} colors={[color.teal]} tintColor={color.white} />}
      >
        <View style={st.hero}>
          <Text style={st.hello}>Hello, {firstName(user.name)}</Text>

          <Pressable
            onPress={toggle}
            disabled={toggling}
            accessibilityRole="switch"
            accessibilityState={{ checked: online, busy: toggling }}
            accessibilityLabel={online ? 'Online. Tap to go offline' : 'Offline. Tap to go online'}
            style={({ pressed }) => [st.toggle, online ? st.toggleOn : st.toggleOff, pressed && st.pressed]}
          >
            <View style={[st.knob, online ? st.knobOn : st.knobOff]}>
              {toggling ? <ActivityIndicator color={online ? color.white : color.deep} /> : <Icon name="power" size={24} tint={online ? color.white : color.deep} />}
            </View>
            <View style={st.toggleText}>
              <Text style={[st.toggleTitle, { color: online ? color.white : color.deep }]}>{online ? 'You are online' : 'Go online'}</Text>
              <Text style={[st.toggleSub, { color: online ? color.onDeep : 'rgba(7,63,61,0.75)' }]}>
                {online ? 'Tap to go offline' : 'Start getting delivery requests'}
              </Text>
            </View>
            {online ? <View style={st.liveDot} /> : <Icon name="chevron-right" size={26} tint={color.deep} />}
          </Pressable>

          <View style={st.stats}>
            <View style={st.stat}>
              <Text style={st.statLabel}>Earned today</Text>
              <Text style={[st.statValue, st.gold]}>{rupee(sum.earned)}</Text>
            </View>
            <View style={st.statDivider} />
            <View style={st.stat}>
              <Text style={st.statLabel}>Deliveries today</Text>
              <Text style={st.statValue}>{sum.count}</Text>
            </View>
          </View>
        </View>

        <View style={st.body}>
          {reachable === false ? (
            <Card style={st.problem}>
              <Icon name="lan-disconnect" tint={color.red} />
              <Text style={st.problemText}>{problem ?? 'Cannot reach the LocalRush server.'} Trying again…</Text>
            </Card>
          ) : null}

          {locationFirst ? <LocationCard onChange={() => setAreaOpen(true)} /> : null}

          {online ? (
            <>
              <SectionTitle title="Deliveries near you" right={<Pill text={String(jobs.length)} tone={jobs.length ? 'gold' : 'neutral'} />} />
              {jobs.length === 0 ? (
                <Empty
                  icon="bell-ring-outline"
                  title="Waiting for orders"
                  body="Packed orders at shops within 6 km of you appear here by themselves. Your phone buzzes when one arrives."
                />
              ) : (
                jobs.map((j) => <JobCard key={j.id} job={j} now={now} />)
              )}
            </>
          ) : (
            <>
              <SectionTitle title="Deliveries near you" />
              <Empty icon="moped" title="You are offline" body="Go online to see packed orders at shops near you, and take one.">
                <Button title="Go online" icon="power" onPress={toggle} busy={toggling} style={st.emptyButton} />
              </Empty>
            </>
          )}

          {locationFirst ? null : (
            <View style={st.after}>
              <LocationCard onChange={() => setAreaOpen(true)} />
            </View>
          )}

          <Text style={st.footnote}>
            Each delivery pays {rupee(PAY_BASE)} plus {rupee(PAY_PER_KM)} for every km you ride, to the shop and on to the customer. The
            amount is fixed when you take the delivery.
          </Text>
        </View>
      </ScrollView>
      <AreaSheet visible={areaOpen} onClose={() => setAreaOpen(false)} />
    </View>
  );
}

function JobCard({ job, now }: { job: Job; now: number }) {
  const { act, notify, refresh, active, shops } = useApp();
  const [busy, setBusy] = useState(false);
  const area = shops[job.storeId]?.area;

  const take = async () => {
    setBusy(true);
    try {
      await act(job.id, 'claim');
      notify({ tone: 'good', title: `${job.id} is yours`, body: `Head to ${job.storeName} to collect it.` });
    } catch (e) {
      notify({ tone: 'bad', title: errorText(e) });
      setBusy(false);
      void refresh();
    }
  };

  return (
    <Card style={st.job}>
      <View style={st.jobHead}>
        <View style={st.shopIcon}>
          <Icon name="storefront-outline" tint={color.teal} />
        </View>
        <View style={st.flex}>
          <Text style={st.jobShop} numberOfLines={2}>
            {job.storeName}
          </Text>
          <Text style={st.jobMeta}>
            {area ? `${area} · ` : ''}packed {ago(packedAt(job), now)}
          </Text>
        </View>
        <View style={st.payBox}>
          <Text style={st.payLabel}>You earn</Text>
          <Text style={st.pay}>{rupee(payOf(job))}</Text>
        </View>
      </View>

      <View style={st.route}>
        <View style={st.stop}>
          <View style={[st.stopDot, { backgroundColor: color.gold }]} />
          <Text style={st.stopLabel}>You to the shop</Text>
          <Text style={st.stopValue}>{km(job.pickupKm)}</Text>
        </View>
        <View style={st.stopLine} />
        <View style={st.stop}>
          <View style={[st.stopDot, { backgroundColor: color.teal }]} />
          <Text style={st.stopLabel} numberOfLines={1}>
            On to {areaPart(job.address)}
          </Text>
          <Text style={st.stopValue}>{km(job.distKm)}</Text>
        </View>
      </View>

      <View style={st.tags}>
        <Pill icon="package-variant-closed" text={plural(itemCount(job.lines), 'item')} />
        {job.payment === 'cod' ? (
          <Pill tone="gold" icon="cash" text={`Collect ${rupee(job.total)}`} />
        ) : (
          <Pill tone="green" icon="check-circle" text="Paid online" />
        )}
      </View>

      <Button title="Take this delivery" icon="check" onPress={take} busy={busy} disabled={!!active} />
    </Card>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { paddingBottom: 28 },
  flex: { flex: 1 },
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
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
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
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)' },
  statLabel: { color: color.onDeep, fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: color.white, fontSize: 22, fontWeight: '800', marginTop: 2 },
  gold: { color: color.gold },
  body: { paddingHorizontal: 16, paddingTop: 16 },
  problem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, backgroundColor: color.redTint, borderColor: '#F5C2C2' },
  problemText: { flex: 1, color: color.red, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  emptyButton: { alignSelf: 'stretch', marginTop: 10 },
  job: { marginBottom: 12, gap: 14 },
  jobHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  shopIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: color.tealTint, alignItems: 'center', justifyContent: 'center' },
  jobShop: { fontSize: type.heading, fontWeight: '800', color: color.ink },
  jobMeta: { fontSize: 13.5, color: color.mute, marginTop: 2 },
  payBox: { alignItems: 'flex-end' },
  payLabel: { fontSize: 11.5, fontWeight: '800', color: color.faint, textTransform: 'uppercase', letterSpacing: 0.5 },
  pay: { fontSize: 24, fontWeight: '800', color: color.teal },
  route: { backgroundColor: color.paper, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopDot: { width: 12, height: 12, borderRadius: 6 },
  stopLine: { width: 2, height: 14, backgroundColor: color.line, marginLeft: 5, marginVertical: 3 },
  stopLabel: { flex: 1, fontSize: 14.5, color: color.mute },
  stopValue: { fontSize: 15.5, fontWeight: '800', color: color.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  after: { marginTop: 22 },
  footnote: { fontSize: 13, color: color.mute, lineHeight: 18, marginTop: 18, textAlign: 'center' },
});
