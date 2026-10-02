import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page">
      <div className="empty empty-page">
        <h1>This page does not exist</h1>
        <p className="quiet">The link may be old, or the address may have a typo.</p>
        <Link href="/" className="btn">
          Back to the home page
        </Link>
      </div>
    </div>
  );
}
