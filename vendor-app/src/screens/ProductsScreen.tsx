// Stock and prices. Whatever is saved here is what customers see and can buy: the server checks
// stock again at the moment of ordering, so nothing can be oversold. The same list as the
// website's Stock and prices page.

import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATEGORIES, levelOf, stockAt } from '../catalog';
import { plural, rupee } from '../format';
import { useApp } from '../store';
import { color, radius, type } from '../theme';
import type { Product, Stock } from '../types';
import { Button, Card, Chip, Empty, Icon, Pill, Segmented } from '../ui';
import NewProductSheet from './NewProductSheet';
import ProductSheet from './ProductSheet';

/** The products the shop sells, or the rest of the LocalRush list it could add. */
type Showing = 'mine' | 'more';

export default function ProductsScreen() {
  const { catalog, user, loadCatalog } = useApp();
  const [view, setView] = useState<Showing>('mine');
  const [q, setQ] = useState('');
  /** "all", "low" (running low or out), or a category. */
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [pulling, setPulling] = useState(false);
  const storeId = user?.storeId ?? '';

  // Fresh numbers each time the tab is opened: sales and the website change stock too.
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  if (!catalog) {
    return (
      <View style={st.loading}>
        <Text style={st.loadingText}>Loading your products…</Text>
      </View>
    );
  }

  const mine: { p: Product; s: Stock }[] = [];
  const more: Product[] = [];
  for (const p of catalog.products) {
    const s = stockAt(catalog, storeId, p.id);
    if (s) mine.push({ p, s });
    else more.push(p);
  }
  const out = mine.filter((m) => levelOf(m.s) === 'out').length;
  const low = mine.filter((m) => levelOf(m.s) === 'low').length;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (p: Product) =>
    (filter === 'all' || filter === 'low' || p.cat === filter) && words.every((w) => `${p.name} ${p.keywords}`.toLowerCase().includes(w));
  const shownMine = mine
    .filter((m) => matches(m.p) && (filter !== 'low' || levelOf(m.s) !== 'ok'))
    .sort((a, b) => (filter === 'low' ? a.s.stock - b.s.stock : 0));
  const shownMore = more.filter(matches);
  const inView = view === 'mine' ? mine.map((m) => m.p) : more;
  const cats = CATEGORIES.filter((c) => inView.some((p) => p.cat === c.slug));
  const count = view === 'mine' ? shownMine.length : shownMore.length;

  const switchView = (v: Showing) => {
    setView(v);
    setFilter('all');
  };

  const pull = async () => {
    setPulling(true);
    await loadCatalog();
    setPulling(false);
  };

  return (
    <View style={st.screen}>
      <ScrollView
        contentContainerStyle={st.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} colors={[color.teal]} tintColor={color.teal} />}
      >
        <View style={st.head}>
          <View style={st.flex}>
            <Text style={st.title}>Stock and prices</Text>
            <Text style={st.sub}>
              {plural(mine.length, 'product')} on sale · {out} out of stock · {low} running low
            </Text>
          </View>
        </View>
        <Button title="Add a new product" icon="plus" kind="secondary" onPress={() => setAdding(true)} style={st.addButton} />

        <Segmented
          options={[
            { key: 'mine', label: `In my shop (${mine.length})` },
            { key: 'more', label: `Add more (${more.length})` },
          ]}
          value={view}
          onChange={switchView}
        />

        <View style={st.search}>
          <Icon name="magnify" size={22} tint={color.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Find a product"
            placeholderTextColor={color.faint}
            style={st.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Find a product"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={10}>
              <Icon name="close-circle" size={20} tint={color.faint} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips} keyboardShouldPersistTaps="handled">
          <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
          {view === 'mine' ? <Chip label={`Low or out (${out + low})`} on={filter === 'low'} onPress={() => setFilter('low')} /> : null}
          {cats.map((c) => (
            <Chip key={c.slug} label={`${c.emoji} ${c.short}`} on={filter === c.slug} onPress={() => setFilter(c.slug)} />
          ))}
        </ScrollView>

        {view === 'more' ? (
          <Text style={st.note}>Products in the LocalRush list that your shop does not sell yet. Tap one to set your price and stock.</Text>
        ) : null}

        {count === 0 ? (
          <Empty
            icon={view === 'mine' ? 'package-variant' : 'check-circle'}
            title={
              inView.length === 0
                ? view === 'mine'
                  ? 'No products yet'
                  : 'You sell everything in the list'
                : filter === 'low' && !words.length
                  ? 'Nothing is running low'
                  : 'Nothing matches'
            }
            body={inView.length === 0 && view === 'mine' ? 'Tap Add more to start selling products from the LocalRush list.' : undefined}
          />
        ) : (
          <Card style={st.list}>
            {view === 'mine'
              ? shownMine.map((m, i) => <Row key={m.p.id} p={m.p} s={m.s} first={i === 0} onPress={() => setEditing(m.p)} />)
              : shownMore.map((p, i) => <Row key={p.id} p={p} s={null} first={i === 0} onPress={() => setEditing(p)} />)}
          </Card>
        )}
      </ScrollView>
      <ProductSheet product={editing} onClose={() => setEditing(null)} />
      <NewProductSheet visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}

function Row({ p, s, first, onPress }: { p: Product; s: Stock | null; first: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={s ? `${p.name}, ${rupee(s.price)}, ${s.stock} in stock` : `Add ${p.name}`}
      style={({ pressed }) => [st.row, !first && st.rowLine, pressed && st.pressed]}
    >
      <View style={st.emojiTile}>
        <Text style={st.emoji}>{p.emoji}</Text>
      </View>
      <View style={st.flex}>
        <Text style={st.name} numberOfLines={2}>
          {p.name}
        </Text>
        <Text style={st.meta} numberOfLines={1}>
          {p.unit} · MRP {rupee(p.mrp)}
        </Text>
      </View>
      {s ? (
        <View style={st.right}>
          <Text style={st.price}>{rupee(s.price)}</Text>
          <StockText s={s} />
        </View>
      ) : (
        <Pill text="Add" icon="plus" tone="teal" />
      )}
    </Pressable>
  );
}

function StockText({ s }: { s: Stock }) {
  const level = levelOf(s);
  if (level === 'out') return <Pill text="Out of stock" tone="red" />;
  if (level === 'low') return <Pill text={`Only ${s.stock} left`} tone="gold" />;
  return <Text style={st.inStock}>{s.stock} in stock</Text>;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { padding: 16, paddingBottom: 28 },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: type.body, color: color.mute },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: type.title + 2, fontWeight: '800', color: color.ink },
  sub: { fontSize: 14, color: color.mute, marginTop: 2 },
  addButton: { marginBottom: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: color.line,
    backgroundColor: color.card,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 11, color: color.ink },
  chips: { gap: 8, paddingVertical: 12 },
  note: { fontSize: 13.5, color: color.mute, lineHeight: 19, marginBottom: 10 },
  list: { paddingVertical: 2, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.line },
  emojiTile: { width: 46, height: 46, borderRadius: 14, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 25 },
  name: { fontSize: 15.5, fontWeight: '800', color: color.ink },
  meta: { fontSize: 13, color: color.mute, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 17, fontWeight: '800', color: color.ink },
  inStock: { fontSize: 13, fontWeight: '700', color: color.green },
});
