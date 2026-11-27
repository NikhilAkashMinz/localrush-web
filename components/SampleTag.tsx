// The "Sample" label for made-up shops on the live service (Store.sample), so nobody mistakes
// one for a real shop. Shown next to the shop's name wherever it appears.

export default function SampleTag({ store }: { store: { sample?: boolean } }) {
  if (!store.sample) return null;
  return (
    <em className="sample-tag" title="A sample shop, for trying LocalRush. It is not a real shop.">
      Sample
    </em>
  );
}
