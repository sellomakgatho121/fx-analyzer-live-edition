import { Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import AnimatedBackground from '../components/AnimatedBackground';
import { Toaster } from 'react-hot-toast';
import HydrationSanitizer from '../components/HydrationSanitizer';

const outfit = Outfit({
  variable: '--font-display',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport = {
  themeColor: '#020202',
};

export const metadata = {
  title: 'FX Analyzer Pro | Acid-Luxe Trading Terminal',
  description: 'Pro-grade algorithmic FX analysis with next-gen AI signals.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased min-h-screen relative overflow-x-hidden selection:bg-lime-400 selection:text-black" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){document.querySelectorAll('*').forEach(function(e){[].filter.call(e.attributes,function(a){return a.name==='bis_skin_checked'||a.name==='bis_register'||a.name.indexOf('__processed_')===0}).forEach(function(a){e.removeAttribute(a.name)})})})();
        `}} />
        <HydrationSanitizer />
        <Toaster position="top-right" toastOptions={{
          style: {
            background: '#333',
            color: '#fff',
            border: '1px solid #ffffff20',
          },
        }} />
        <AnimatedBackground />
        <main className="relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}
