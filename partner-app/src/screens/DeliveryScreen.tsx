// The delivery under way, in two steps: collect it at the shop, then hand it to the customer,
// who gives a 4-digit code. Directions open in Google Maps.

import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { errorText } from '../api';
import { itemCount, km, phoneText, plural, rupee } from '../format';
import { directionsUrl, roadKm } from '../geo';
import { payOf } from '../pay';
import { useApp } from '../store';
import { color, radius, type } from '../theme';
import type { Order } from '../types';
import { Button, Card, Icon, Line } from '../ui';

export default function DeliveryScreen({ order }: { order: Order }) {
  const { shops, fix, gps, act, notify } = useApp();
  const shop = shops[order.storeId];
  const toShop = order.status === 'assigned';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const here = gps === 'on' && fix ? fix : null;
  // While delivering, the customer's order page shows where the partner is, from this phone's GPS.
  const sharing = gps === 'on' || gps === 'starting';

  const open = async (url: string, failure: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      notify({ tone: 'bad', title: failure });
    }
  };

  const pickup = async () => {
    setBusy(true);
    setError('');
    try {
      await act(order.id, 'pickup');
      notify({ tone: 'good', title: 'Picked up. Ride safe.', body: `Now take it to ${order.customerName}.` });
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };

  const deliver = async () => {
    if (!/^\d{4}$/.test(code)) return setError('Ask the customer for their 4-digit code and enter it here.');
    setBusy(true);
    setError('');
    try {
      const done = await act(order.id, 'deliver', code);
      Vibration.vibrate(150);
      notify({ tone: 'good', title: `Delivered. You earned ${rupee(payOf(done))}`, body: `${done.id} is complete. Well done!` }, 7000);
      // This screen closes by itself now: the delivery is no longer under way.
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const shopAway = here && shop ? ` · ${km(roadKm(here.lat, here.lng, shop.lat, shop.lng))} from you` : '';
  const customerAway = here ? ` · ${km(roadKm(here.lat, here.lng, order.lat, order.lng))} from you` : '';
  const ticks = order.lines.filter((l) => ticked[l.pid]).length;

  return (
    <KeyboardAvoidingView behavior="padding" style={st.screen}>
      {/* A new ScrollView for each step, so step 2 starts at the top. */}
      <ScrollView key={order.status} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
        <View style={st.hero}>
          <Text style={st.kicker}>
            {toShop ? 'Step 1 of 2' : 'Step 2 of 2'} · Order {order.id}
          </Text>
          <Text style={st.heroTitle}>{toShop ? 'Collect the order' : 'Deliver the order'}</Text>
          <Text style={st.heroSub}>{toShop ? `at ${order.storeName}` : `to ${order.customerName}`}</Text>

          <View style={st.steps}>
            <Step n={1} label="Pick up" state={toShop ? 'now' : 'done'} />
            <View style={[st.stepBar, !toShop && st.stepBarDone]} />
            <Step n={2} label="Deliver" state={toShop ? 'todo' : 'now'} />
          </View>

          <View style={st.earn}>
            <Icon name="wallet-outline" size={20} tint={color.gold} />
            <Text style={st.earnText}>
              You earn <Text style={st.earnAmount}>{rupee(payOf(order))}</Text> once it is delivered
            </Text>
          </View>

          <View style={st.share}>
            <Icon name={sharing ? 'crosshairs-gps' : 'crosshairs-off'} size={18} tint={sharing ? color.green : color.onDeep} />
            <Text style={st.shareText}>
              {sharing
                ? `${order.customerName} can see where you are on a live map until you hand it over.`
                : `Your GPS is off, so ${order.customerName} cannot see where you are.`}
            </Text>
          </View>
        </View>

        <View style={st.body}>
          {toShop ? (
            <>
              <Card style={st.card}>
                <Line icon="storefront-outline" label="Collect from" value={order.storeName} sub={`${shop?.area ?? 'Shop'}${shopAway}`} />
                <Button
                  title="Directions to the shop"
                  icon="navigation-variant"
                  kind="secondary"
                  disabled={!shop}
                  onPress={() => shop && open(directionsUrl(shop.lat, shop.lng), 'Could not open Google Maps.')}
                />
              </Card>

              <Card style={st.card}>
                <View style={st.cardHead}>
                  <Text style={st.cardTitle}>Check the items</Text>
                  <Text style={st.cardCount}>
                    {ticks} of {order.lines.length}
                  </Text>
                </View>
                <Text style={st.cardSub}>Tick each one as the shop hands it over: {plural(itemCount(order.lines), 'item')} in all.</Text>
                {order.lines.map((l) => {
                  const on = !!ticked[l.pid];
                  return (
                    <Pressable
                      key={l.pid}
                      onPress={() => setTicked((t) => ({ ...t, [l.pid]: !on }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={({ pressed }) => [st.item, pressed && st.pressed]}
                    >
                      <Icon name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={26} tint={on ? color.green : color.faint} />
                      <Text style={[st.itemQty, on && st.itemDone]}>{l.qty} ×</Text>
                      <Text style={[st.itemName, on && st.itemDone]}>
                        {l.name ?? l.pid}
                        {l.unit ? <Text style={st.itemUnit}>  {l.unit}</Text> : null}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>

              <Payment order={order} />
              {error ? <ErrorLine text={error} /> : null}
              <Button title="I have picked it up" icon="package-variant-closed" onPress={pickup} busy={busy} style={st.main} />
            </>
          ) : (
            <>
              <Card style={st.card}>
                <Line icon="home-map-marker" label="Deliver to" value={order.customerName} sub={`${order.address}${customerAway}`} />
                <View style={st.row}>
                  <Button
                    title="Directions"
                    icon="navigation-variant"
                    kind="secondary"
                    onPress={() => open(directionsUrl(order.lat, order.lng), 'Could not open Google Maps.')}
                    style={st.flex}
                  />
                  {order.customerPhone ? (
                    <Button
                      title="Call"
                      icon="phone"
                      kind="secondary"
                      onPress={() => open(`tel:+91${order.customerPhone}`, 'Could not start a call.')}
                      style={st.flex}
                    />
                  ) : null}
                </View>
                {order.customerPhone ? <Text style={st.phone}>{phoneText(order.customerPhone)}</Text> : null}
              </Card>

              <Payment order={order} />

              <Card style={st.card}>
                <Text style={st.cardTitle}>Customer&apos;s code</Text>
                <Text style={st.cardSub}>
                  Ask the customer for the 4-digit code on their LocalRush order page. The delivery is complete only with the right code.
                </Text>
                <TextInput
                  value={code}
                  onChangeText={(t) => {
                    setCode(t.replace(/\D/g, '').slice(0, 4));
                    setError('');
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="0000"
                  placeholderTextColor="#C9CCD6"
                  style={st.code}
                  accessibilityLabel="Customer's 4-digit code"
                  onSubmitEditing={deliver}
                />
                {error ? <ErrorLine text={error} /> : null}
                <Button title="Complete delivery" icon="check-circle" onPress={deliver} busy={busy} disabled={code.length !== 4} />
              </Card>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ n, label, state }: { n: number; label: string; state: 'done' | 'now' | 'todo' }) {
  return (
    <View style={st.step}>
      <View style={[st.stepDot, state === 'done' && st.stepDotDone, state === 'now' && st.stepDotNow]}>
        {state === 'done' ? (
          <Icon name="check" size={16} tint={color.white} />
        ) : (
          <Text style={[st.stepNum, state === 'now' && st.stepNumNow]}>{n}</Text>
        )}
      </View>
      <Text style={[st.stepLabel, state !== 'todo' && st.stepLabelOn]}>{label}</Text>
    </View>
  );
}

function Payment({ order }: { order: Order }) {
  if (order.payment === 'online') {
    return (
      <Card style={[st.card, st.payOnline]}>
        <View style={st.payRow}>
          <Icon name="check-circle" size={26} tint={color.green} />
          <View style={st.flex}>
            <Text style={[st.payTitle, { color: color.green }]}>Paid online</Text>
            <Text style={st.paySub}>Nothing to collect at the door.</Text>
          </View>
        </View>
      </Card>
    );
  }
  return (
    <Card style={[st.card, st.payCash]}>
      <View style={st.payRow}>
        <Icon name="cash" size={28} tint={color.goldDeep} />
        <View style={st.flex}>
          <Text style={[st.payTitle, { color: color.goldDeep }]}>Collect {rupee(order.total)}</Text>
          <Text style={st.paySub}>
            In cash or by UPI at the door: items {rupee(order.subtotal)}
            {order.fee ? ` + delivery ${rupee(order.fee)}` : ', free delivery'}.
          </Text>
        </View>
      </View>
    </Card>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <View style={st.error} accessibilityRole="alert">
      <Icon name="alert-circle" size={18} tint={color.red} />
      <Text style={st.errorText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { paddingBottom: 28 },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  hero: {
    backgroundColor: color.deep,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  kicker: { color: color.gold, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroTitle: { color: color.white, fontSize: type.hero, fontWeight: '800', marginTop: 4 },
  heroSub: { color: color.onDeep, fontSize: type.heading, marginTop: 2 },
  steps: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: color.green, borderColor: color.green },
  stepDotNow: { backgroundColor: color.gold, borderColor: color.gold },
  stepNum: { color: color.onDeep, fontWeight: '800', fontSize: 14 },
  stepNumNow: { color: color.deep },
  stepLabel: { color: color.onDeep, fontWeight: '700', fontSize: 14 },
  stepLabelOn: { color: color.white },
  stepBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', marginHorizontal: 10 },
  stepBarDone: { backgroundColor: color.green },
  earn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: color.onDeepFaint,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  earnText: { color: color.white, fontSize: 14.5, flex: 1 },
  earnAmount: { color: color.gold, fontWeight: '800', fontSize: 16 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 2 },
  shareText: { color: color.onDeep, fontSize: 13.5, lineHeight: 18, flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16 },
  card: { marginBottom: 12, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: type.heading, fontWeight: '800', color: color.ink },
  cardCount: { fontSize: 14, fontWeight: '800', color: color.teal },
  cardSub: { fontSize: 14, color: color.mute, lineHeight: 19, marginTop: -6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  itemQty: { fontSize: 16, fontWeight: '800', color: color.ink, minWidth: 34 },
  itemName: { flex: 1, fontSize: 16, color: color.ink },
  itemUnit: { fontSize: 13.5, color: color.mute },
  itemDone: { color: color.faint },
  row: { flexDirection: 'row', gap: 10 },
  phone: { fontSize: 13.5, color: color.mute, textAlign: 'center', marginTop: -4 },
  payCash: { backgroundColor: color.goldTint, borderColor: '#F4DDA6' },
  payOnline: { backgroundColor: color.greenTint, borderColor: '#BFE5CD' },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payTitle: { fontSize: 20, fontWeight: '800' },
  paySub: { fontSize: 14, color: color.mute, marginTop: 2, lineHeight: 19 },
  code: {
    borderWidth: 2,
    borderColor: color.teal,
    borderRadius: radius.button,
    paddingVertical: 12,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 18,
    textAlign: 'center',
    color: color.ink,
    backgroundColor: color.paper,
  },
  error: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: color.redTint, marginBottom: 10 },
  errorText: { flex: 1, color: color.red, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  main: { marginTop: 4 },
});
