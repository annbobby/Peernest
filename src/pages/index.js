import Head from 'next/head';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // 1. Inject Tailwind CDN dynamically
    if (!document.getElementById('tailwind-script')) {
      const tw = document.createElement('script');
      tw.id = 'tailwind-script';
      tw.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(tw);
    }

    // 2. Inject Lucide Icons dynamically
    if (!document.getElementById('lucide-script')) {
      const luc = document.createElement('script');
      luc.id = 'lucide-script';
      luc.src = 'https://unpkg.com/lucide@latest';
      document.head.appendChild(luc);
    }

    // 3. Inject PeerNest Application Logic
    if (!document.getElementById('peernest-app-script')) {
      const script = document.createElement('script');
      script.id = 'peernest-app-script';
      script.src = '/app.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <>
      <Head>
        <title>PeerNest | VIT Vellore Campus Convenience Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📦</text></svg>" />
      </Head>

      <div className="bg-slate-50 text-slate-900 min-h-screen flex flex-col antialiased selection:bg-emerald-500 selection:text-white">
        {/* Toast Notification Container */}
        <div id="toast-container" className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"></div>

        {/* Global Navigation Bar */}
        <header id="app-navbar" className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 transition-all"></header>

        {/* Main Dynamic View Container */}
        <main id="app-content" className="flex-1 flex flex-col"></main>

        {/* Global Modal Container */}
        <div id="modal-container" className="fixed inset-0 z-50 hidden bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"></div>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 py-8 mt-auto text-slate-500 text-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">PN</div>
              <span className="font-semibold text-slate-800">PeerNest</span>
              <span className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded-full border border-emerald-200">VIT Vellore Exclusive</span>
            </div>
            <p className="text-xs text-slate-400 text-center md:text-left">
              Designed strictly for verified students with <span className="font-mono text-slate-600">@vitstudent.ac.in</span> institutional emails. No external data sharing.
            </p>
            <div className="flex items-center gap-6 text-xs font-medium">
              <button onClick={() => window.app && window.app.navigate('terms')} className="hover:text-emerald-600 transition">Terms & Safety</button>
              <button onClick={() => window.app && window.app.navigate('privacy')} className="hover:text-emerald-600 transition">Privacy Policy</button>
              <button onClick={() => window.app && window.app.navigate('protection')} className="hover:text-emerald-600 transition">Protection Reserve</button>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
