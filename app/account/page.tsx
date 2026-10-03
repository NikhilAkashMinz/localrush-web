'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { errorText } from '@/lib/api';
import { actions, useStore } from '@/lib/state';

export default function AccountPage() {
  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? '');
  const leaving = useRef(false);

  useEffect(() => {
    if (!user && !leaving.current) router.replace('/login?next=/account');
  }, [user, router]);

  if (!user) return <div className="boot" />;
  const addresses = user.addresses;
  const say = (text: string) => () => actions.toast(text);
  const complain = (e: unknown) => actions.toast(errorText(e));

  return (
    <div className="page page-form">
      <h1 className="title">Your account</h1>

      <form
        className="box"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 2) return;
          actions.rename(name.trim()).then(say('Name saved'), complain);
        }}
      >
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <p className="box-row">
          <span>
            Mobile number <b>{user.phone}</b>
          </span>
        </p>
        <button type="submit" className="btn" disabled={name.trim() === user.name || name.trim().length < 2}>
          Save name
        </button>
      </form>

      <section className="box">
        <h2>Saved addresses</h2>
        {addresses.length === 0 ? (
          <p className="quiet">The address from your first order is saved here.</p>
        ) : (
          <ul className="rows">
            {addresses.map((a) => (
              <li key={a.id}>
                <span>
                  <b>{a.tag}</b>
                  <small>
                    {a.line}, {a.place.label}
                  </small>
                </span>
                <button type="button" className="link" onClick={() => actions.deleteAddress(a.id).catch(complain)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {user.role !== 'customer' && (
        <section className="box">
          <h2>{user.role === 'shop' ? 'Your shop' : 'Deliveries'}</h2>
          <p className="box-row">
            <span>{user.role === 'shop' ? 'Orders and stock are on your shop dashboard.' : 'Jobs near you are on your delivery screen.'}</span>
            <Link href={user.role === 'shop' ? '/dashboard' : '/partner'} className="link">
              Open it
            </Link>
          </p>
        </section>
      )}

      <section className="box">
        <h2>Orders</h2>
        <p className="box-row">
          <span>{orders.length === 0 ? 'No orders yet' : `${orders.length} ${orders.length === 1 ? 'order' : 'orders'} so far`}</span>
          <Link href="/orders" className="link">
            See your orders
          </Link>
        </p>
      </section>

      <button
        type="button"
        className="btn btn-line"
        onClick={() => {
          leaving.current = true;
          void actions.logout().then(() => {
            actions.toast('Logged out');
            router.push('/');
          });
        }}
      >
        Log out
      </button>
    </div>
  );
}
