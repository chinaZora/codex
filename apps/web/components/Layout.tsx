import Link from 'next/link';
import { ReactNode } from 'react';

const links = [
  ['Dashboard', '/'],
  ['Agents', '/agents'],
  ['Knowledge', '/knowledge'],
  ['Sessions', '/sessions'],
  ['Audit', '/audit'],
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>HR Agent Platform</h2>
        <p>MVP 管理台</p>
        <nav>
          {links.map(([label, href]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
