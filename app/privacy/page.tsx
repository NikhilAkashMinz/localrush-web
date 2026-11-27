// Terms and privacy, in plain words. Read on the server each time, so the contact details come
// from the SUPPORT_CONTACT setting of the server that is running (server/config.ts).
// This is a starting draft for a small service; have it checked before relying on it.

import Link from 'next/link';
import { supportContact } from '@/server/config';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Terms and privacy · LocalRush' };

export default function PrivacyPage() {
  const contact = supportContact();
  return (
    <div className="page page-narrow legal">
      <h1 className="title">Terms and privacy</h1>
      <p className="quiet">Last updated 27 November 2026.</p>

      <p>
        LocalRush connects you with shops within 5 km of you and with delivery partners who bring your order to your
        door. This page explains what we keep about you, why, who sees it, and the basic rules of using LocalRush.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>Your name and email address, to log you in and to know whose orders are yours.</li>
        <li>The mobile number you give at checkout, so the delivery partner can call you.</li>
        <li>The delivery addresses you save, and the location you choose or share with &quot;Use my location&quot;.</li>
        <li>Your orders: what you bought, from which shop, the price, and how it was delivered.</li>
        <li>
          For delivery partners: their phone&apos;s location while they are online and on a delivery, so the customer
          can follow it.
        </li>
        <li>For shops: the shop&apos;s details, stock and prices, and the orders it receives.</li>
      </ul>

      <h2>Who sees what</h2>
      <ul>
        <li>The shop that packs your order sees your name, the items and your delivery address.</li>
        <li>The partner who delivers it sees your name, address and mobile number, only for that delivery.</li>
        <li>The 4-digit door code for an order is shown only to you.</li>
        <li>We do not sell your details or use them for advertising.</li>
      </ul>

      <h2>Services we use</h2>
      <ul>
        <li>Google Firebase checks your login (your Google account, or your email and password) and so receives your email address.</li>
        <li>MongoDB Atlas stores LocalRush&apos;s data, and Render runs the website.</li>
        <li>
          OpenStreetMap provides the map and the list of other shops nearby; only the rough area (about 1 km) is sent to
          it, never your exact location.
        </li>
      </ul>

      <h2>Your choices</h2>
      <p>
        You can change your name and delete saved addresses on your Account page. You can ask us to show you, correct or
        delete what we keep about you, or to close your account, using the contact below. We keep order records as
        long as your account is open, so that your history and the shops&apos; sales stay correct.
      </p>

      <h2>Using LocalRush</h2>
      <ul>
        <li>Prices and stock are set by each shop. The shop is responsible for the items it sells.</li>
        <li>You can cancel an order until the shop accepts it.</li>
        <li>Give the delivery partner your order&apos;s door code only when you have your order.</li>
        <li>Do not use LocalRush to order anything a shop may not legally sell to you.</li>
      </ul>

      <h2>Contact</h2>
      <p>{contact ? <>For anything on this page, contact {contact}.</> : <>For anything on this page, contact the LocalRush team.</>}</p>

      <p>
        <Link href="/" className="link">
          Back to LocalRush
        </Link>
      </p>
    </div>
  );
}
