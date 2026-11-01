// Add a product that is not in the LocalRush list yet. It goes on sale in the shop straight away.

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorText } from '../api';
import { CATEGORIES, categoryOf } from '../catalog';
import { rupee, whole } from '../format';
import { useApp } from '../store';
import { color, type } from '../theme';
import { Button, Chip, ErrorLine, Field, Sheet, Stepper } from '../ui';

export default function NewProductSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addProduct, notify } = useApp();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [cat, setCat] = useState(CATEGORIES[0].slug);
  const [emoji, setEmoji] = useState('');
  const [mrp, setMrp] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A fresh form each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(visible);
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) {
      setName('');
      setUnit('');
      setCat(CATEGORIES[0].slug);
      setEmoji('');
      setMrp('');
      setPrice('');
      setStock('10');
      setError('');
      setBusy(false);
    }
  }

  const digits = (set: (v: string) => void) => (t: string) => {
    set(t.replace(/\D/g, '').slice(0, 6));
    setError('');
  };
  const text = (set: (v: string) => void) => (t: string) => {
    set(t);
    setError('');
  };

  const submit = async () => {
    const mrpN = whole(mrp);
    const priceN = price.trim() === '' ? mrpN : whole(price);
    const stockN = whole(stock);
    if (name.trim().length < 2) return setError('Enter the product name.');
    if (unit.trim().length < 1) return setError('Enter the pack size, for example "500 g" or "1 pc".');
    if (mrpN === null || mrpN < 1) return setError('Enter the MRP in whole rupees.');
    if (priceN === null || priceN < 1 || priceN > mrpN) return setError(`Your price must be a whole number no higher than the MRP of ${rupee(mrpN)}.`);
    if (stockN === null || stockN > 9999) return setError('Enter how many you have, from 0 to 9999.');
    setBusy(true);
    setError('');
    try {
      const made = await addProduct({ name: name.trim(), unit: unit.trim(), cat, mrp: mrpN, price: priceN, stock: stockN, emoji: emoji.trim() });
      notify({ tone: 'good', title: `${made.name} is now on sale`, body: `In your shop at ${rupee(priceN)}, ${stockN} in stock.` });
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const category = categoryOf(cat);

  return (
    <Sheet visible={visible} title="Add a new product" onClose={onClose}>
      <Text style={st.p}>For something that is not in the LocalRush list yet. Customers can buy it from your shop as soon as you add it.</Text>
      <Field label="Product name" value={name} onChangeText={text(setName)} placeholder="Nandini curd" maxLength={60} autoCapitalize="words" />
      <Field label="Pack size" value={unit} onChangeText={text(setUnit)} placeholder="500 g" maxLength={40} />

      <Text style={st.label}>Category</Text>
      <View style={st.cats}>
        {CATEGORIES.map((c) => (
          <Chip key={c.slug} label={`${c.emoji} ${c.short}`} on={cat === c.slug} onPress={() => setCat(c.slug)} />
        ))}
      </View>

      <Field
        label="Picture (one emoji, optional)"
        value={emoji}
        onChangeText={(t) => setEmoji(t.slice(0, 8))}
        placeholder={category?.emoji ?? '📦'}
        hint="Leave it empty to use the category's picture."
      />
      <View style={st.pair}>
        <Field label="MRP (₹)" value={mrp} onChangeText={digits(setMrp)} keyboardType="number-pad" placeholder="35" style={st.flex} />
        <Field label="Your price (₹)" value={price} onChangeText={digits(setPrice)} keyboardType="number-pad" placeholder="Same as MRP" style={st.flex} />
      </View>

      <Text style={st.label}>In stock</Text>
      <Stepper
        value={stock}
        onChange={(v) => {
          setStock(v);
          setError('');
        }}
        label="How many you have"
      />

      <View style={st.space} />
      {error ? <ErrorLine text={error} /> : null}
      <Button title="Add product" icon="plus" onPress={() => void submit()} busy={busy} />
      <View style={st.space} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  p: { fontSize: type.body, color: color.mute, lineHeight: 21, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: color.mute, marginBottom: 8 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pair: { flexDirection: 'row', gap: 10 },
  space: { height: 16 },
});
