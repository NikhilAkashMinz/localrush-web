'use client';

// The admin page: how real shops and delivery partners join LocalRush. An admin adds a shop
// with its owner's mobile number; the owner then logs in on the shop dashboard with an SMS code
// and sets their own stock and prices. Partners are added the same way. Admins are the numbers
// in the server's ADMIN_PHONES setting, and only on the live service (server/admin.ts).

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { KIND_LABEL, type Store, type StoreKind } from '@/lib/data';
import { hourLabel } from '@/lib/format';
import { actions, useStore } from '@/lib/state';

type Person = { id: string; name: string; phone: string; createdAt: number };
type AdminShop = Store & { owner: Person | null };
type Overview = { shops: AdminShop[]; partners: (Person & { online: boolean })[] };

const KINDS = Object.keys(KIND_LABEL) as StoreKind[];
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hourName = (h: number) => (h === 24 ? 'Midnight' : h === 0 ? 'Midnight (start of day)' : hourLabel(h));

/** "12.9345, 77.5345" as copied from Google Maps (right-click on the map, then the numbers). */
function parseSpot(text: string): { lat: number; lng: number } | null {
  const m = /(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function ShopForm({ shop, onSaved, onCancel }: { shop?: AdminShop; onSaved: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(shop?.name ?? '');
  const [kind, setKind] = useState<StoreKind>(shop?.kind ?? 'kirana');
  const [area, setArea] = useState(shop?.area ?? '');
  const [spot, setSpot] = useState(shop ? `${shop.lat}, ${shop.lng}` : '');
  const [open, setOpen] = useState(shop?.open[0] ?? 7);
  const [close, setClose] = useState(shop?.open[1] ?? 22);
  const [paused, setPaused] = useState(shop?.paused === true);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const here = () => {
    if (!navigator.geolocation) return setError('This browser cannot share its location. Paste the numbers from Google Maps instead.');
    navigator.geolocation.getCurrentPosition(
      (p) => setSpot(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`),
      () => setError('Location access was blocked. Paste the numbers from Google Maps instead.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const at = parseSpot(spot);
    if (!at) return setError('Set the location: stand in the shop and press "Use my location", or paste "latitude, longitude" from Google Maps.');
    setError('');
    setBusy(true);
    const fields = { name: name.trim(), kind, area: area.trim(), lat: at.lat, lng: at.lng, open, close, paused };
    try {
      if (shop) {
        await api('PUT', `admin/shops/${encodeURIComponent(shop.id)}`, fields);
        actions.toast(`${fields.name} saved`);
      } else {
        await api('POST', 'admin/shops', { ...fields, ownerName: ownerName.trim(), ownerPhone });
        actions.toast(`${fields.name} added. The owner can log in on the shop dashboard with ${ownerPhone}.`);
      }
      await actions.refreshCatalog();
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  return (
    <form className="ad-form" onSubmit={save} noValidate>
      <div className="ad-grid">
        <label className="field">
          <span>Shop name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sri Lakshmi Provision Store" />
        </label>
        <label className="field">
          <span>Kind of shop</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as StoreKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Area</span>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Banashankari 3rd Stage" />
        </label>
        <label className="field">
          <span>Location (latitude, longitude)</span>
          <input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="12.9372, 77.5392" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Opens at</span>
          <select value={open} onChange={(e) => setOpen(Number(e.target.value))}>
            {HOURS.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {hourName(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Closes at</span>
          <select value={close} onChange={(e) => setClose(Number(e.target.value))}>
            {HOURS.slice(1).map((h) => (
              <option key={h} value={h}>
                {hourName(h)}
              </option>
            ))}
          </select>
        </label>
        {!shop && (
          <>
            <label className="field">
              <span>Owner&apos;s name</span>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span>Owner&apos;s mobile number (they log in with it)</span>
              <input
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="10 digits"
              />
            </label>
          </>
        )}
      </div>
      <p className="quiet small">
        Standing in the shop?{' '}
        <button type="button" className="link" onClick={here}>
          Use my location
        </button>
        . Otherwise, in Google Maps right-click the shop and click the numbers at the top to copy them, then paste them
        above.
      </p>
      {shop && (
        <label className="check">
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
          <span>Paused: customers cannot order from this shop</span>
        </label>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <div className="ad-acts">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving…' : shop ? 'Save changes' : 'Add the shop'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-line" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function PartnerForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('POST', 'admin/partners', { name: name.trim(), phone });
      actions.toast(`${name.trim()} added. They can log in on the delivery partner screen with ${phone}.`);
      setName('');
      setPhone('');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  return (
    <form className="ad-form" onSubmit={save} noValidate>
      <div className="ad-grid">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Mobile number (they log in with it)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="10 digits"
          />
        </label>
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <div className="ad-acts">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Adding…' : 'Add the partner'}
        </button>
      </div>
    </form>
  );
}

export default function AdminPage() {
  const user = useStore((s) => s.user);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<Overview>('GET', 'admin').then(
      (d) => {
        setData(d);
        setError('');
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, []);

  useEffect(() => {
    if (user?.admin) load();
  }, [user?.admin, load]);

  if (!user || !user.admin) {
    return (
      <div className="page page-narrow">
        <h1 className="title">LocalRush admin</h1>
        <div className="empty empty-page">
          <h2>{user ? 'This page is for LocalRush admins' : 'Log in with your admin number'}</h2>
          <p className="quiet">
            Admins add the shops and delivery partners. An admin is someone whose mobile number is in the server&apos;s
            ADMIN_PHONES setting, on the live service.
          </p>
          {!user && (
            <Link href="/login?next=/admin" className="btn">
              Log in
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page page-narrow ad">
      <h1 className="title">LocalRush admin</h1>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      <section className="box">
        <div className="ad-head">
          <h2>Shops {data && <span>{data.shops.length}</span>}</h2>
          {!adding && (
            <button type="button" className="btn btn-small" onClick={() => setAdding(true)}>
              Add a shop
            </button>
          )}
        </div>
        {adding && (
          <ShopForm
            onSaved={() => {
              setAdding(false);
              load();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {!data ? (
          <p className="quiet">Loading…</p>
        ) : data.shops.length === 0 ? (
          <p className="quiet">No shops yet. Add the first one: its owner then logs in on the shop dashboard and adds their stock.</p>
        ) : (
          <ul className="rows">
            {data.shops.map((s) => (
              <li key={s.id} className={editing === s.id ? 'ad-editing' : ''}>
                {editing === s.id ? (
                  <ShopForm
                    shop={s}
                    onSaved={() => {
                      setEditing(null);
                      load();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <span>
                      <b>
                        {s.name}
                        {s.paused && <em className="ad-tag">Paused</em>}
                      </b>
                      <small>
                        {KIND_LABEL[s.kind]} in {s.area} · {hourLabel(s.open[0])} to {s.open[1] === 24 ? 'midnight' : hourLabel(s.open[1])}
                      </small>
                      <small>{s.owner ? `Owner: ${s.owner.name}, ${s.owner.phone}` : 'No owner account'}</small>
                    </span>
                    <button type="button" className="link" onClick={() => setEditing(s.id)}>
                      Edit
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="box">
        <div className="ad-head">
          <h2>Delivery partners {data && <span>{data.partners.length}</span>}</h2>
        </div>
        {data && data.partners.length > 0 && (
          <ul className="rows">
            {data.partners.map((p) => (
              <li key={p.id}>
                <span>
                  <b>{p.name}</b>
                  <small>{p.phone}</small>
                </span>
                <small className={p.online ? 'ad-on' : 'quiet'}>{p.online ? 'Online' : 'Offline'}</small>
              </li>
            ))}
          </ul>
        )}
        <PartnerForm onSaved={load} />
      </section>

      <p className="quiet small">
        Shop owners log in at <b>/dashboard</b> and delivery partners at <b>/partner</b> on this site, with the number you
        give them here. Each number can have one account, so a number someone already orders with cannot become a shop
        owner or partner.
      </p>
    </div>
  );
}
