import './globals.css';
import { Layout } from '../components/Layout';

export const metadata = {
  title: 'HR Agent Platform',
  description: 'HR Agent Platform MVP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
