import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Shell from '@/components/Shell';
import './globals.css';

// Both typefaces are open-licence (SIL OFL) and ship with the project, so the site
// looks the same offline and never waits on a font server.
const display = localFont({
  src: './fonts/BricolageGrotesque.ttf',
  variable: '--font-display',
  weight: '200 800',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '75% 100%' }],
});
const body = localFont({
  src: './fonts/Figtree.ttf',
  variable: '--font-body',
  weight: '300 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LocalRush: your neighbourhood shops, delivered in minutes',
  description:
    'Order groceries, medicines, stationery and gadgets from shops within 5 km of you. LocalRush picks the best nearby shop for every order.',
};

export const viewport: Viewport = {
  themeColor: '#0B7A75',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
