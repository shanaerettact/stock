import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '股票交易統計系統',
  description: '專業的股票交易記錄與績效分析平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-gray-50">
        {children}
      </body>
    </html>
  );
}

