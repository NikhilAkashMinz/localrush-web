// Change one product's price and stock, or start selling a product from the LocalRush list.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { categoryOf, stockAt } from '../catalog';
import { rupee, whole } from '../format';
import { useApp } from '../store';
import { color, type } from '../theme';
import type { Product } from '../types';
import { Button, Chip, ErrorLine, Field, Sheet, Stepper } from '../ui';

const QUICK = [5, 10, 25];

export default function ProductSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { catalog, user, saveStock, notify } = useApp();
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [busy, setBusy] = useState<'save' | 'out' | null>(null);
  const [error, setError] = useState('');
  // The product the boxes were filled in for, and the one to keep showing while the sheet slides away.
  const [openedFor, setOpenedFor] = useState<Product | null>(null);
  const [last, setLast] = useState<Product | null>(null);
  const p = product ?? last;
  const current = p && user?.storeId ? stockAt(catalog, user.storeId, p.id) : null;

  // Fill in the saved numbers each time the sheet opens.
  if (product && product !== openedFor) {
    const saved = user?.storeId ? stockAt(catalog, user.storeId, product.id) : null;
    setOpenedFor(product);
    setLast(product);
    setPrice(String(saved?.price ?? product.mrp));
    setStock(saved ? String(saved.stock) : '');
    setError('');
    setBusy(null);
  }
  if (!product && openedFor) setOpenedFor(null);

  const save = async (forceStock?: number) => {
    if (!p) return;
    const priceN = whole(price);
    const stockN = forceStock ?? whole(stock);
    if (priceN === null || priceN < 1) return setError('Enter your price in whole rupees.');
    if (priceN > p.mrp) return setError(`Your price cannot be more than the MRP of ${rupee(p.mrp)}.`);
    if (stockN === null || stockN > 9999) return setError('Enter how many you have, from 0 to 9999.');
    setBusy(forceStock === 0 ? 'out' : 'save');
    setError('');
    try {
      await saveStock(p.id, priceN, stockN);
      notify({
        tone: 'good',
        title: current ? `${p.name} saved` : `${p.name} is now on sale`,
        body: `${rupee(priceN)} · ${stockN === 0 ? 'out of stock' : `${stockN} in stock`}`,
      });
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };

  const cat = p ? categoryOf(p.cat) : undefined;

  return (
    <Sheet visible={!!product} title={current ? 'Stock and price' : 'Sell this in your shop'} onClose={onClose}>
      {p ? (
        <>
          <View style={st.head}>
            <View style={st.emojiTile}>
              <Text style={st.emoji}>{p.emoji}</Text>
            </View>
            <View style={st.flex}>
              <Text style={st.name}>{p.name}</Text>
              <Text style={st.meta}>
                {p.unit} · MRP {rupee(p.mrp)}
                {cat ? ` · ${cat.short}` : ''}
              </Text>
            </View>
          </View>

          <Field
            label="Your price (₹)"
            value={price}
            onChangeText={(t) => {
              setPrice(t.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            keyboardType="number-pad"
            hint={`MRP ${rupee(p.mrp)}. You can sell for less than the MRP, never for more.`}
          />

          <Text style={st.label}>In stock</Text>
          <Stepper
            value={stock}
            onChange={(v) => {
              setStock(v);
              setError('');
            }}
            label={`${p.name} in stock`}
          />
          <View style={st.quick}>
            {QUICK.map((n) => (
              <Chip key={n} label={`+ ${n}`} on={false} onPress={() => setStock(String(Math.min(9999, (whole(stock) ?? 0) + n)))} />
            ))}
            <Text style={st.quickHint}>New stock in?</Text>
          </View>

          {error ? <ErrorLine text={error} /> : null}
          <Button
            title={current ? 'Save' : 'Add to my shop'}
            icon={current ? 'check' : 'plus'}
            onPress={() => void save()}
            busy={busy === 'save'}
            disabled={busy !== null}
          />
          {current && current.stock > 0 ? (
            <Button
              title="Mark out of stock"
              kind="danger"
              icon="close-circle-outline"
              compact
              onPress={() => void save(0)}
              busy={busy === 'out'}
              disabled={busy !== null}
              style={st.out}
            />
          ) : null}
          <Text style={st.footnote}>
            {current
              ? 'Customers see the change straight away. Stock also goes down by itself as customers order.'
              : 'It goes on sale in your shop as soon as you add it.'}
          </Text>
        </>
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  emojiTile: { width: 56, height: 56, borderRadius: 16, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
  name: { fontSize: type.heading + 1, fontWeight: '800', color: color.ink },
  meta: { fontSize: 14, color: color.mute, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: color.mute, marginBottom: 6 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 16, flexWrap: 'wrap' },
  quickHint: { fontSize: 13, color: color.mute },
  out: { marginTop: 10 },
  footnote: { fontSize: 13, color: color.mute, lineHeight: 18, marginTop: 14, marginBottom: 6, textAlign: 'center' },
});
