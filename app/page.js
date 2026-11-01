'use client';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Redirect to the main static SPA application
    window.location.href = '/index.html';
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a' }}>Loading PeerNest...</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.5rem' }}>Exclusively for verified students of VIT Vellore</p>
      </div>
    </div>
  );
}
