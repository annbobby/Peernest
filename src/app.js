// ============================================================================
// PEERNEST - Full-Stack Client Application & State Router
// ============================================================================

(function () {
  'use strict';

  // State Management
  const state = {
    token: localStorage.getItem('pn_token') || null,
    user: JSON.parse(localStorage.getItem('pn_user') || 'null'),
    profile: JSON.parse(localStorage.getItem('pn_profile') || 'null'),
    currentView: 'landing', // landing, activities, parcels_available, parcel_create, marketplace, rental_create, requester_dash, partner_dash, lender_dash, borrower_dash, chat, notifications, admin, profile
    activeConversationId: null,
    campusLocations: [],
    hostelLocations: [],
    categories: [],
    unreadNotifCount: 0,
    sseSource: null
  };

  // Toast Notification System
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-600 text-white border-emerald-700',
      error: 'bg-rose-600 text-white border-rose-700',
      info: 'bg-slate-900 text-white border-slate-800',
      warning: 'bg-amber-500 text-white border-amber-600'
    };

    toast.className = `p-4 rounded-xl shadow-xl text-sm font-medium border flex items-center gap-3 transition-all transform translate-y-2 opacity-0 pointer-events-auto ${colors[type] || colors.info}`;
    toast.innerHTML = `
      <div class="flex-1">${message}</div>
      <button onclick="this.parentElement.remove()" class="opacity-75 hover:opacity-100">&times;</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // API Client Helper
  const API_BASE = (window.location.protocol === 'file:' || !window.location.port)
    ? 'http://localhost:3000'
    : '';

  async function api(endpoint, method = 'GET', body = null) {
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
      const res = await fetch(fullUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Server error occurred.');
      }
      return data;
    } catch (err) {
      if (err.name === 'TypeError' && (err.message.includes('fetch') || err.message.includes('Network') || err.message.includes('Failed'))) {
        showToast('⚠️ Cannot connect to backend server! Please ensure the server is running via start.bat', 'error');
      } else {
        showToast(err.message, 'error');
      }
      throw err;
    }
  }

  // SSE Real-time Updates Listener
  function initSSE() {
    if (!state.token || state.sseSource) return;

    try {
      const sseUrl = `/api/chat/stream?token=${encodeURIComponent(state.token)}`;
      state.sseSource = new EventSource(sseUrl);

      state.sseSource.addEventListener('new_message', (e) => {
        const msg = JSON.parse(e.data);
        showToast(`💬 New message from ${msg.sender_name}: "${msg.content.slice(0, 35)}..."`, 'info');
        
        // If chat view is open and conversation matches, refresh
        if (state.currentView === 'chat' && state.activeConversationId === msg.conversation_id) {
          loadConversationMessages(msg.conversation_id);
        }
        updateUnreadBadges();
      });

      state.sseSource.onerror = () => {
        if (state.sseSource) {
          state.sseSource.close();
          state.sseSource = null;
        }
      };
    } catch (e) {
      console.warn('SSE connection error:', e);
    }
  }

  // Session Helper
  function updateNavbar() {
    renderNavbar();
  }

  function setSession(token, user, profile) {
    state.token = token;
    state.user = user;
    state.profile = profile;
    localStorage.setItem('pn_token', token);
    localStorage.setItem('pn_user', JSON.stringify(user));
    localStorage.setItem('pn_profile', JSON.stringify(profile));
    initSSE();
    renderNavbar();
    updateUnreadBadges();
  }

  function clearSession() {
    state.token = null;
    state.user = null;
    state.profile = null;
    if (state.sseSource) {
      state.sseSource.close();
      state.sseSource = null;
    }
    localStorage.removeItem('pn_token');
    localStorage.removeItem('pn_user');
    localStorage.removeItem('pn_profile');
    navigate('landing');
    showToast('You have been logged out.', 'info');
  }

  // Fetch Static Metadata (Locations & Categories)
  async function loadInitialData() {
    try {
      const [locData, hostelData, catData] = await Promise.all([
        api('/api/gps/locations'),
        api('/api/gps/hostels'),
        api('/api/rentals/categories')
      ]);
      state.campusLocations = locData.locations || [];
      state.hostelLocations = hostelData.hostels || [];
      state.categories = catData.categories || [];
    } catch (e) {
      console.warn('Initial data load warning:', e);
    }
  }

  async function updateUnreadBadges() {
    if (!state.token) return;
    try {
      const res = await api('/api/notifications');
      state.unreadNotifCount = res.unreadCount || 0;
      const badge = document.getElementById('notif-badge');
      if (badge) {
        badge.innerText = state.unreadNotifCount;
        badge.style.display = state.unreadNotifCount > 0 ? 'inline-flex' : 'none';
      }
    } catch (e) {}
  }

  // Navigation Controller
  function navigate(viewName, params = {}) {
    state.currentView = viewName;

    // View protection
    if (!state.token && viewName !== 'landing') {
      return renderLoginModal();
    }

    renderNavbar();
    const content = document.getElementById('app-content');

    switch (viewName) {
      case 'landing':
        renderLanding(content);
        break;
      case 'activities':
        renderActivitySelector(content, params);
        break;
      case 'my_activities':
        renderActivitySelector(content, { tab: 'my', ...params });
        break;
      case 'parcels_available':
        renderAvailableParcels(content);
        break;
      case 'parcel_create':
        renderParcelRequestForm(content);
        break;
      case 'marketplace':
        renderMarketplace(content, params);
        break;
      case 'rental_create':
        renderRentalListingForm(content);
        break;
      case 'requester_dash':
        renderRequesterDashboard(content);
        break;
      case 'partner_dash':
        renderPartnerDashboard(content);
        break;
      case 'lender_dash':
        renderLenderDashboard(content);
        break;
      case 'borrower_dash':
        renderBorrowerDashboard(content);
        break;
      case 'chat':
        renderChatView(content, params.conversationId);
        break;
      case 'notifications':
        renderNotificationsView(content);
        break;
      case 'admin':
        renderAdminDashboard(content);
        break;
      case 'profile':
        renderProfileView(content);
        break;
      case 'protection':
        renderProtectionReserveView(content);
        break;
      case 'terms':
        renderTermsView(content);
        break;
      case 'privacy':
        renderPrivacyView(content);
        break;
      default:
        renderActivitySelector(content);
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Modal Controls
  function openModal(htmlContent) {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
        <button onclick="window.app.closeModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition">&times;</button>
        ${htmlContent}
      </div>
    `;
    modalContainer.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.classList.add('hidden');
    modalContainer.innerHTML = '';
  }

  // --------------------------------------------------------------------------
  // NAVBAR COMPONENT
  // --------------------------------------------------------------------------
  function renderNavbar() {
    const header = document.getElementById('app-navbar');
    if (!header) return;

    if (!state.token) {
      header.innerHTML = `
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div class="flex items-center gap-3 cursor-pointer" onclick="window.app.navigate('landing')">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-extrabold text-xl shadow-md shadow-emerald-500/20">
              PN
            </div>
            <div>
              <span class="text-xl font-extrabold tracking-tight text-slate-900">Peer<span class="text-emerald-600">Nest</span></span>
              <span class="hidden sm:inline-block ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">VIT Vellore</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="window.app.openLoginModal()" class="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-emerald-600 transition">Sign In</button>
            <button onclick="window.app.openRegisterModal()" class="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm shadow-emerald-600/30 transition">VIT Student Sign Up</button>
          </div>
        </div>
      `;
      return;
    }

    // Logged In Navbar
    const isAdmin = state.profile && (state.profile.is_admin || state.profile.isAdmin);
    const studentName = state.profile ? (state.profile.full_name || state.profile.fullName || 'Student') : 'Student';
    const initial = studentName.charAt(0).toUpperCase();
    header.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <!-- Logo & Activity Hub Switcher -->
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 cursor-pointer" onclick="window.app.navigate('activities')">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-extrabold text-base shadow-md">
              PN
            </div>
            <span class="text-lg font-bold text-slate-900 hidden md:inline">Peer<span class="text-emerald-600">Nest</span></span>
          </div>

          <button onclick="window.app.navigate('activities')" class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 transition flex items-center gap-1.5">
            <i data-lucide="grid" class="w-3.5 h-3.5"></i>
            <span>Activities</span>
          </button>
          <button onclick="window.app.navigate('my_activities')" class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition flex items-center gap-1.5">
            <i data-lucide="clipboard-list" class="w-3.5 h-3.5"></i>
            <span>My Activities</span>
          </button>
        </div>

        <!-- Service Tabs -->
        <nav class="hidden lg:flex items-center gap-1 text-sm font-semibold text-slate-600">
          <button onclick="window.app.navigate('parcels_available')" class="px-3 py-2 rounded-lg hover:text-emerald-600 hover:bg-slate-50 transition flex items-center gap-1.5 ${state.currentView === 'parcels_available' ? 'text-emerald-600 bg-emerald-50' : ''}">
            <i data-lucide="package" class="w-4 h-4"></i>
            <span>Deliver Parcels</span>
          </button>
          <button onclick="window.app.navigate('parcel_create')" class="px-3 py-2 rounded-lg hover:text-emerald-600 hover:bg-slate-50 transition flex items-center gap-1.5 ${state.currentView === 'parcel_create' ? 'text-emerald-600 bg-emerald-50' : ''}">
            <i data-lucide="send" class="w-4 h-4"></i>
            <span>Request Parcel</span>
          </button>
          <button onclick="window.app.navigate('marketplace')" class="px-3 py-2 rounded-lg hover:text-emerald-600 hover:bg-slate-50 transition flex items-center gap-1.5 ${state.currentView === 'marketplace' ? 'text-emerald-600 bg-emerald-50' : ''}">
            <i data-lucide="shopping-bag" class="w-4 h-4"></i>
            <span>Rentals</span>
          </button>
          <button onclick="window.app.navigate('rental_create')" class="px-3 py-2 rounded-lg hover:text-emerald-600 hover:bg-slate-50 transition flex items-center gap-1.5 ${state.currentView === 'rental_create' ? 'text-emerald-600 bg-emerald-50' : ''}">
            <i data-lucide="tag" class="w-4 h-4"></i>
            <span>Lend Items</span>
          </button>
        </nav>

        <!-- Right Action Items -->
        <div class="flex items-center gap-2">
          <!-- Chat Button -->
          <button onclick="window.app.navigate('chat')" title="Messages" class="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition relative">
            <i data-lucide="message-square" class="w-5 h-5"></i>
          </button>

          <!-- Notifications Button -->
          <button onclick="window.app.navigate('notifications')" title="Notifications" class="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition relative">
            <i data-lucide="bell" class="w-5 h-5"></i>
            <span id="notif-badge" class="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center ${state.unreadNotifCount > 0 ? '' : 'hidden'}">${state.unreadNotifCount}</span>
          </button>

          <!-- Admin Panel Button (if admin) -->
          ${isAdmin ? `
            <button onclick="window.app.navigate('admin')" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition flex items-center gap-1.5">
              <i data-lucide="shield" class="w-3.5 h-3.5"></i>
              <span>Admin</span>
            </button>
          ` : ''}

          <!-- User Profile Dropdown -->
          <div class="relative">
            <button onclick="window.app.navigate('profile')" class="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
              <div class="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                ${initial}
              </div>
              <span class="text-xs font-semibold text-slate-800 max-w-[100px] truncate hidden sm:inline">${studentName}</span>
              <i data-lucide="badge-check" class="w-3.5 h-3.5 text-emerald-600"></i>
            </button>
          </div>

          <button onclick="window.app.clearSession()" title="Sign Out" class="p-2 text-slate-400 hover:text-rose-600 transition">
            <i data-lucide="log-out" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  // --------------------------------------------------------------------------
  // LANDING PAGE (Marketing & Discovery)
  // --------------------------------------------------------------------------
  function renderLanding(container) {
    container.innerHTML = `
      <!-- Hero Section -->
      <section class="relative overflow-hidden bg-gradient-to-b from-emerald-50/60 to-white py-16 sm:py-24 border-b border-slate-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/80 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-6">
            <i data-lucide="shield-check" class="w-4 h-4"></i>
            Exclusive to VIT Vellore Campus
          </div>
          <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl mx-auto leading-tight">
            Campus Convenience by Students, <span class="text-emerald-600">for Students.</span>
          </h1>
          <p class="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Skip the long queue at the Campus Central Parcel Centre, get deliveries right to your hostel block, or earn money by renting and borrowing academic items.
          </p>
          <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onclick="window.app.openRegisterModal()" class="w-full sm:w-auto px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5">
              Register with VIT Email
            </button>
            <button onclick="window.app.openLoginModal()" class="w-full sm:w-auto px-8 py-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold text-base shadow-sm transition">
              Sign In to Your Account
            </button>
          </div>
          <div class="mt-12 flex flex-wrap items-center justify-center gap-8 text-xs font-semibold text-slate-500">
            <div class="flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i> @vitstudent.ac.in Verified Only</div>
            <div class="flex items-center gap-2"><i data-lucide="map-pin" class="w-4 h-4 text-emerald-600"></i> GPS Route-Based Fare Engine</div>
            <div class="flex items-center gap-2"><i data-lucide="lock" class="w-4 h-4 text-emerald-600"></i> Two-Stage Delivery OTP Security</div>
            <div class="flex items-center gap-2"><i data-lucide="dollar-sign" class="w-4 h-4 text-emerald-600"></i> Refundable Security Deposits</div>
          </div>
        </div>
      </section>

      <!-- Two Core Services Overview -->
      <section class="py-20 bg-slate-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-3xl mx-auto mb-16">
            <h2 class="text-3xl font-extrabold text-slate-900">Two Seamless Campus Services in One Platform</h2>
            <p class="mt-4 text-slate-600 text-base">Built specifically for VIT Vellore hostelers, day scholars, and student entrepreneurs.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Service 1: Parcel Delivery -->
            <div class="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-sm hover:shadow-md transition">
              <div class="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-6">
                <i data-lucide="package-search" class="w-7 h-7"></i>
              </div>
              <h3 class="text-2xl font-bold text-slate-900">Campus Parcel Pickup & Delivery</h3>
              <p class="mt-4 text-slate-600 leading-relaxed text-sm">
                Got a package at the Campus Post Office near Gate 2 or SJT courier counter? Submit a pickup request with your carrier tracking ID. A peer student collects and delivers it directly to your Men's or Ladies' Hostel lobby.
              </p>
              <ul class="mt-6 space-y-3 text-sm text-slate-600 font-medium">
                <li class="flex items-center gap-2"><i data-lucide="check" class="w-4 h-4 text-emerald-600"></i> Fare starts at just ₹8 base + ₹5/km route distance</li>
                <li class="flex items-center gap-2"><i data-lucide="check" class="w-4 h-4 text-emerald-600"></i> Real-time 6-digit delivery OTP verification</li>
                <li class="flex items-center gap-2"><i data-lucide="check" class="w-4 h-4 text-emerald-600"></i> PeerNest Protection Reserve covers transit</li>
              </ul>
              <div class="mt-8 flex gap-3">
                <button onclick="window.app.navigate('parcel_create')" class="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs">Request Pickup</button>
                <button onclick="window.app.navigate('parcels_available')" class="px-5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs">Deliver & Earn</button>
              </div>
            </div>

            <!-- Service 2: Rental Marketplace -->
            <div class="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-sm hover:shadow-md transition">
              <div class="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-6">
                <i data-lucide="repeat" class="w-7 h-7"></i>
              </div>
              <h3 class="text-2xl font-bold text-slate-900">Student-to-Student Rental Marketplace</h3>
              <p class="mt-4 text-slate-600 leading-relaxed text-sm">
                Need a scientific calculator (Casio 991EX) for tomorrow's CAT exam? A lab coat for physics lab? Or sports gear for the weekend? Rent from fellow VITians without buying expensive items you only need temporarily.
              </p>
              <ul class="mt-6 space-y-3 text-sm text-slate-600 font-medium">
                <li class="flex items-center gap-2"><i data-lucide="check" class="w-4 h-4 text-emerald-600"></i> Transparent daily rates & refundable security deposits</li>
                <li class="flex items-center gap-2"><i data-lucide="check" class="w-4 h-4 text-emerald-600"></i> Handover photo inspection & condition verification</li>
                <li class="flex items-center gap-2"><i data-lucide="check" class="w-4 h-4 text-emerald-600"></i> Strict anti-self rental & double-booking prevention</li>
              </ul>
              <div class="mt-8 flex gap-3">
                <button onclick="window.app.navigate('marketplace')" class="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs">Browse Items</button>
                <button onclick="window.app.navigate('rental_create')" class="px-5 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs">List Your Item</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

    // --------------------------------------------------------------------------
  // ACTIVITY SELECTION DASHBOARD ("What would you like to do today?")
  // & DEDICATED "MY REQUESTS & PERFORMED ACTIVITIES" PAGE WITH UNIQUE TRACKING
  // --------------------------------------------------------------------------
  let myActivitiesCache = null;
  let currentActivityFilter = 'all';

  function renderActivitySelector(container, options = {}) {
    const defaultTab = (options && options.tab === 'my') ? 'my' : 'explore';

    container.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <!-- Top Title & Navigation Sub-Tabs -->
        <div class="text-center max-w-2xl mx-auto mb-8">
          <span class="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">Campus Activity Hub</span>
          <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-3">What would you like to do today?</h1>
          <p class="mt-2 text-slate-600 text-sm">Participate in all campus services simultaneously, or track every request and delivery you have performed.</p>

          <!-- Interactive Sub-Page Switcher Pills -->
          <div class="inline-flex items-center p-1.5 bg-slate-200/80 rounded-2xl mt-6 shadow-inner gap-1">
            <button id="tab-btn-explore" onclick="window.app.switchActivityTab('explore')" class="px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${defaultTab === 'explore' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
              <i data-lucide="compass" class="w-4 h-4"></i>
              <span>Explore Services</span>
            </button>
            <button id="tab-btn-my" onclick="window.app.switchActivityTab('my')" class="px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${defaultTab === 'my' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
              <i data-lucide="clipboard-list" class="w-4 h-4"></i>
              <span>My Requests & Performed Activities</span>
              <span id="tab-my-badge" class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold">...</span>
            </button>
          </div>
        </div>

        <!-- VIEW 1: Explore 4 Services Cards -->
        <div id="activity-explore-view" class="${defaultTab === 'explore' ? '' : 'hidden'}">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Card 1: Deliver Parcels -->
            <div onclick="window.app.navigate('parcels_available')" class="cursor-pointer group p-8 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/5 transition-all">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-amber-50 group-hover:bg-amber-100 text-amber-600 flex items-center justify-center transition">
                  <i data-lucide="bike" class="w-7 h-7"></i>
                </div>
                <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">Earn ₹12 - ₹30 / delivery</span>
              </div>
              <h3 class="text-xl font-bold text-slate-900 group-hover:text-emerald-700 transition">1. Deliver Parcels</h3>
              <p class="mt-2 text-slate-600 text-sm leading-relaxed">
                Accept available parcel requests from students, pick up packages from the Campus Parcel Centre, and deliver them to designated hostel blocks for immediate earnings.
              </p>
              <div class="mt-6 flex items-center justify-between text-xs font-semibold text-emerald-600">
                <span class="flex items-center gap-1">Open Delivery Board <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
                <button onclick="event.stopPropagation(); window.app.switchActivityTab('my', 'parcel_delivery')" class="text-slate-400 hover:text-slate-700">My Deliveries</button>
              </div>
            </div>

            <!-- Card 2: Request Parcel Pickup -->
            <div onclick="window.app.navigate('parcel_create')" class="cursor-pointer group p-8 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/5 transition-all">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-blue-50 group-hover:bg-blue-100 text-blue-600 flex items-center justify-center transition">
                  <i data-lucide="package-plus" class="w-7 h-7"></i>
                </div>
                <span class="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">From ₹10</span>
              </div>
              <h3 class="text-xl font-bold text-slate-900 group-hover:text-emerald-700 transition">2. Request Parcel Pickup</h3>
              <p class="mt-2 text-slate-600 text-sm leading-relaxed">
                Don't have time to walk across campus? Have a fellow student collect your parcel and bring it to your hostel lobby with two-stage OTP security verification.
              </p>
              <div class="mt-6 flex items-center justify-between text-xs font-semibold text-emerald-600">
                <span class="flex items-center gap-1">Create Parcel Request <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
                <button onclick="event.stopPropagation(); window.app.switchActivityTab('my', 'parcel_request')" class="text-slate-400 hover:text-slate-700">My Requests</button>
              </div>
            </div>

            <!-- Card 3: Lend Items -->
            <div onclick="window.app.navigate('rental_create')" class="cursor-pointer group p-8 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/5 transition-all">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-purple-50 group-hover:bg-purple-100 text-purple-600 flex items-center justify-center transition">
                  <i data-lucide="store" class="w-7 h-7"></i>
                </div>
                <span class="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">Earn Daily Rent</span>
              </div>
              <h3 class="text-xl font-bold text-slate-900 group-hover:text-emerald-700 transition">3. Lend Items</h3>
              <p class="mt-2 text-slate-600 text-sm leading-relaxed">
                List textbooks, Casio scientific calculators, lab coats, hardware kits or sports gear. Earn daily rental income with separate refundable security deposit protection.
              </p>
              <div class="mt-6 flex items-center justify-between text-xs font-semibold text-emerald-600">
                <span class="flex items-center gap-1">Create Item Listing <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
                <button onclick="event.stopPropagation(); window.app.switchActivityTab('my', 'lent_item')" class="text-slate-400 hover:text-slate-700">My Lent Gear</button>
              </div>
            </div>

            <!-- Card 4: Borrow Items -->
            <div onclick="window.app.navigate('marketplace')" class="cursor-pointer group p-8 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/5 transition-all">
              <div class="flex items-center justify-between mb-4">
                <div class="w-14 h-14 rounded-2xl bg-emerald-50 group-hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition">
                  <i data-lucide="search" class="w-7 h-7"></i>
                </div>
                <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">Marketplace</span>
              </div>
              <h3 class="text-xl font-bold text-slate-900 group-hover:text-emerald-700 transition">4. Borrow Items</h3>
              <p class="mt-2 text-slate-600 text-sm leading-relaxed">
                Explore listings from students in your hostel or campus. Rent items for exams, laboratory practicals, projects, or sports sessions with convenient campus handovers.
              </p>
              <div class="mt-6 flex items-center justify-between text-xs font-semibold text-emerald-600">
                <span class="flex items-center gap-1">Browse Catalog <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></span>
                <button onclick="event.stopPropagation(); window.app.switchActivityTab('my', 'borrowed_item')" class="text-slate-400 hover:text-slate-700">My Borrowed Gear</button>
              </div>
            </div>
          </div>
        </div>

        <!-- VIEW 2: DEDICATED SEPARATE PAGE: My Requests & Performed Activities -->
        <div id="activity-my-view" class="${defaultTab === 'my' ? '' : 'hidden'} space-y-6">
          <!-- Universal Search & Track Down Bar -->
          <div class="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-lg shadow-emerald-700/10">
            <div class="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h2 class="text-xl font-bold flex items-center gap-2">
                  <i data-lucide="search" class="w-5 h-5"></i>
                  Track Down Request by Unique Code
                </h2>
                <p class="text-xs text-emerald-100 mt-1">
                  Enter any Parcel Code (<span class="font-mono bg-white/20 px-1 rounded">PN-PAR-...</span>), Rental Code (<span class="font-mono bg-white/20 px-1 rounded">RNTL-...</span>), or Courier Reference.
                </p>
              </div>

              <div class="w-full md:w-auto flex items-center gap-2">
                <div class="relative flex-1 md:w-80">
                  <input id="activity-search-code-input" type="text" placeholder="e.g. PN-PAR-202611-B4C1E2" 
                    onkeyup="window.app.handleActivitySearchKey(event)"
                    class="w-full px-4 py-2.5 rounded-xl bg-white/10 placeholder-emerald-200 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white text-sm font-mono" />
                </div>
                <button onclick="window.app.searchOrTrackActivity()" class="px-5 py-2.5 bg-white text-emerald-800 font-bold text-xs rounded-xl hover:bg-emerald-50 transition shadow-sm flex items-center gap-1.5 whitespace-nowrap">
                  <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
                  <span>Track Down</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Quick Metrics Bar -->
          <div id="my-activities-metrics" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="p-4 rounded-2xl bg-white border border-slate-200">
              <span class="text-xs font-semibold text-slate-500">Parcel Requests</span>
              <div id="metric-parcels" class="text-2xl font-bold text-blue-600 mt-1">0</div>
            </div>
            <div class="p-4 rounded-2xl bg-white border border-slate-200">
              <span class="text-xs font-semibold text-slate-500">Deliveries Done</span>
              <div id="metric-deliveries" class="text-2xl font-bold text-amber-600 mt-1">0</div>
            </div>
            <div class="p-4 rounded-2xl bg-white border border-slate-200">
              <span class="text-xs font-semibold text-slate-500">Lent Gear</span>
              <div id="metric-lent" class="text-2xl font-bold text-purple-600 mt-1">0</div>
            </div>
            <div class="p-4 rounded-2xl bg-white border border-slate-200">
              <span class="text-xs font-semibold text-slate-500">Borrowed Gear</span>
              <div id="metric-borrowed" class="text-2xl font-bold text-emerald-600 mt-1">0</div>
            </div>
          </div>

          <!-- Filter Sub-Tabs -->
          <div class="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 text-xs font-semibold text-slate-600">
            <button onclick="window.app.filterMyActivities('all')" id="subtab-all" class="px-4 py-2 rounded-xl bg-slate-900 text-white transition whitespace-nowrap">All Activities</button>
            <button onclick="window.app.filterMyActivities('parcel_request')" id="subtab-parcel_request" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition whitespace-nowrap flex items-center gap-1.5"><i data-lucide="package-plus" class="w-3.5 h-3.5 text-blue-600"></i> My Parcel Requests</button>
            <button onclick="window.app.filterMyActivities('parcel_delivery')" id="subtab-parcel_delivery" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition whitespace-nowrap flex items-center gap-1.5"><i data-lucide="bike" class="w-3.5 h-3.5 text-amber-600"></i> My Deliveries</button>
            <button onclick="window.app.filterMyActivities('lent_item')" id="subtab-lent_item" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition whitespace-nowrap flex items-center gap-1.5"><i data-lucide="store" class="w-3.5 h-3.5 text-purple-600"></i> My Lent Gear</button>
            <button onclick="window.app.filterMyActivities('borrowed_item')" id="subtab-borrowed_item" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition whitespace-nowrap flex items-center gap-1.5"><i data-lucide="shopping-bag" class="w-3.5 h-3.5 text-emerald-600"></i> My Borrowed Gear</button>
          </div>

          <!-- Activities Feed List Container -->
          <div id="my-activities-list" class="space-y-4">
            <div class="py-12 text-center text-slate-400">
              <i data-lucide="loader" class="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-600"></i>
              <p class="text-sm">Loading your activity records...</p>
            </div>
          </div>
        </div>
      </div>
    `;

    loadAndRenderMyActivities(options.filter || 'all');
  }

  async function loadAndRenderMyActivities(filter = 'all') {
    try {
      const res = await api('/api/activities/my-all');
      if (!res) return;
      myActivitiesCache = res;

      // Update badge count
      const badge = document.getElementById('tab-my-badge');
      if (badge && res.summary) {
        badge.innerText = res.summary.totalActivities;
      }

      // Update metrics
      const mParcels = document.getElementById('metric-parcels');
      const mDeliv = document.getElementById('metric-deliveries');
      const mLent = document.getElementById('metric-lent');
      const mBorw = document.getElementById('metric-borrowed');
      if (mParcels && res.summary) mParcels.innerText = res.summary.totalParcelRequests;
      if (mDeliv && res.summary) mDeliv.innerText = res.summary.totalParcelDeliveries;
      if (mLent && res.summary) mLent.innerText = res.summary.totalLentItems + res.summary.totalLentBookings;
      if (mBorw && res.summary) mBorw.innerText = res.summary.totalBorrowedItems;

      renderFilteredActivitiesList(filter);
    } catch (e) {
      console.error('Failed to load my activities:', e);
      const listEl = document.getElementById('my-activities-list');
      if (listEl) {
        listEl.innerHTML = `<div class="p-8 text-center text-rose-500 bg-rose-50 rounded-2xl border border-rose-200 text-sm">Failed to load activity records. Please try again.</div>`;
      }
    }
  }

  function renderFilteredActivitiesList(filter = 'all', searchQuery = '') {
    currentActivityFilter = filter;
    const listEl = document.getElementById('my-activities-list');
    if (!listEl || !myActivitiesCache) return;

    // Update subtab active styling
    ['all', 'parcel_request', 'parcel_delivery', 'lent_item', 'borrowed_item'].forEach(t => {
      const btn = document.getElementById('subtab-' + t);
      if (!btn) return;
      if (t === filter) {
        btn.className = 'px-4 py-2 rounded-xl bg-slate-900 text-white transition whitespace-nowrap flex items-center gap-1.5';
      } else {
        btn.className = 'px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition whitespace-nowrap flex items-center gap-1.5';
      }
    });

    // Assemble combined items
    let items = [];
    if (filter === 'all' || filter === 'parcel_request') {
      items = items.concat(myActivitiesCache.parcelRequests || []);
    }
    if (filter === 'all' || filter === 'parcel_delivery') {
      items = items.concat(myActivitiesCache.parcelDeliveries || []);
    }
    if (filter === 'all' || filter === 'lent_item') {
      items = items.concat(myActivitiesCache.lentListings || []);
      items = items.concat(myActivitiesCache.lentBookings || []);
    }
    if (filter === 'all' || filter === 'borrowed_item') {
      items = items.concat(myActivitiesCache.borrowedItems || []);
    }

    // Apply text/code search query if present
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(it => 
        (it.trackingCode && it.trackingCode.toLowerCase().includes(q)) ||
        (it.title && it.title.toLowerCase().includes(q)) ||
        (it.reference && it.reference.toLowerCase().includes(q)) ||
        (it.status && it.status.toLowerCase().includes(q)) ||
        (it.destination && it.destination.toLowerCase().includes(q)) ||
        (it.counterparty && it.counterparty.toLowerCase().includes(q))
      );
    }

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 p-8">
          <div class="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <i data-lucide="inbox" class="w-8 h-8"></i>
          </div>
          <h3 class="text-base font-bold text-slate-800">No requests or activities found</h3>
          <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            ${searchQuery ? `No records match tracking code or query "${searchQuery}".` : 'You have not performed any activities in this category yet.'}
          </p>
          <div class="mt-4">
            <button onclick="window.app.switchActivityTab('explore')" class="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs shadow-sm hover:bg-emerald-700 transition">
              Explore Available Services
            </button>
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    listEl.innerHTML = items.map(item => {
      const isParcel = item.activityType === 'parcel_request' || item.activityType === 'parcel_delivery';
      const statusBadge = getStatusBadge(item.status);

      return `
        <div class="p-6 rounded-3xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition space-y-4">
          <!-- Top Row: Tracking Code & Status -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="font-mono font-extrabold text-xs bg-slate-900 text-emerald-400 px-3 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5 shadow-sm">
                <i data-lucide="hash" class="w-3.5 h-3.5 text-emerald-400"></i>
                ${item.trackingCode}
              </span>
              <button onclick="window.app.copyToClipboard('${item.trackingCode}')" title="Copy tracking code" class="p-1 rounded text-slate-400 hover:text-emerald-600 transition">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
              <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${item.activityType === 'parcel_request' ? 'bg-blue-50 text-blue-700 border border-blue-200' : item.activityType === 'parcel_delivery' ? 'bg-amber-50 text-amber-700 border border-amber-200' : item.activityType === 'lent_item' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                ${item.categoryLabel}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs font-bold px-3 py-1 rounded-full ${statusBadge}">
                ${(item.status || 'Active').replace(/_/g, ' ').toUpperCase()}
              </span>
              <span class="text-xs text-slate-400">
                ${new Date(item.updatedAt || item.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <!-- Middle Row: Details -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div>
              <h4 class="font-bold text-slate-900 text-base flex items-center gap-2">
                ${item.title}
                ${item.reference ? `<span class="text-xs font-normal text-slate-500 font-mono">(Ref: ${item.reference})</span>` : ''}
              </h4>
              <p class="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                ${item.destination ? `<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i> ${item.destination}</span>` : ''}
                ${item.handoverLocation ? `<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-400"></i> Handover: ${item.handoverLocation}</span>` : ''}
                ${item.counterparty ? `<span class="flex items-center gap-1"><i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i> ${item.counterparty}</span>` : ''}
                ${item.dateRange ? `<span class="flex items-center gap-1"><i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i> ${item.dateRange}</span>` : ''}
              </p>
            </div>

            <div class="text-right whitespace-nowrap">
              ${item.fee !== undefined ? `<div class="text-sm font-extrabold text-slate-900">₹${item.fee} <span class="text-[10px] font-normal text-slate-500">delivery fee</span></div>` : ''}
              ${item.earnings !== undefined ? `<div class="text-sm font-extrabold text-emerald-700">+₹${item.earnings} <span class="text-[10px] font-normal text-slate-500">payout</span></div>` : ''}
              ${item.dailyPrice !== undefined ? `<div class="text-sm font-extrabold text-purple-700">₹${item.dailyPrice}/day <span class="text-[10px] font-normal text-slate-500">deposit ₹${item.securityDeposit}</span></div>` : ''}
              ${item.totalPayable !== undefined ? `<div class="text-sm font-extrabold text-slate-900">₹${item.totalPayable} <span class="text-[10px] font-normal text-slate-500">total (with deposit)</span></div>` : ''}
            </div>
          </div>

          <!-- Bottom Row: OTP Notice & Action Buttons -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div>
              ${item.otp ? `
                <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                  <i data-lucide="shield-check" class="w-4 h-4 text-emerald-600"></i>
                  <span>Your Delivery Verification OTP:</span>
                  <span class="font-mono font-extrabold text-sm bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-900 tracking-widest">${item.otp}</span>
                </div>
              ` : ''}
              ${item.activityType === 'parcel_delivery' && (item.status === 'out_for_delivery' || item.status === 'collected') ? `
                <span class="text-xs text-amber-700 font-medium flex items-center gap-1">
                  <i data-lucide="info" class="w-3.5 h-3.5"></i>
                  Collect the 6-digit OTP from recipient upon handover.
                </span>
              ` : ''}
            </div>

            <div class="flex items-center gap-2">
              <button onclick="window.app.trackByCode('${item.trackingCode}')" class="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm">
                <i data-lucide="crosshair" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>Track Live</span>
              </button>

              ${isParcel ? `
                <button onclick="window.app.navigate('requester_dash')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition">
                  Details
                </button>
              ` : `
                <button onclick="window.app.navigate('marketplace')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition">
                  Market
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  // --------------------------------------------------------------------------
  // PARCEL CREATION FORM (Request Parcel Pickup)
  // --------------------------------------------------------------------------
  function renderParcelRequestForm(container) {
    container.innerHTML = `
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <i data-lucide="send" class="w-5 h-5"></i>
            </div>
            <div>
              <h1 class="text-2xl font-bold text-slate-900">Request Campus Parcel Pickup</h1>
              <p class="text-xs text-slate-500">A verified student will collect your parcel from the centre and deliver it to your block.</p>
            </div>
          </div>

          <form id="parcel-request-form" onsubmit="window.app.handleParcelSubmit(event)" class="space-y-6">
            <!-- Parcel Reference -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Courier / Tracking Reference *</label>
              <input type="text" name="parcelReference" required placeholder="e.g. Amazon BlueDart AWB #948291038 or SpeedPost slip #104" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
              <span class="text-[11px] text-slate-400 mt-1 block">Found on your SMS or courier delivery notification.</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Collection Centre -->
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Campus Parcel Collection Centre *</label>
                <select name="collectionCentreId" id="sel-parcel-centre" onchange="window.app.updateFareQuote()" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white">
                  ${state.campusLocations.filter(l => l.type === 'parcel_centre').map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
                </select>
              </div>

              <!-- Destination Hostel -->
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Destination Hostel Block *</label>
                <select name="destinationHostelId" id="sel-parcel-hostel" onchange="window.app.updateFareQuote()" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white">
                  ${state.hostelLocations.map(h => `<option value="${h.id}">${h.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Designated Location -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Exact Drop-Off Location in Permitted Campus Area *</label>
              <input type="text" name="designatedLocation" required placeholder="e.g. MH-D Block Ground Floor Lobby / Security Desk" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
              <span class="text-[11px] text-slate-400 mt-1 block">Deliveries are strictly restricted to authorized hostel lobbies or academic gazebos.</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Declared Value -->
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Declared Parcel Value (₹) *</label>
                <input type="number" name="declaredValue" value="500" min="50" max="10000" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
                <span class="text-[11px] text-slate-400 mt-1 block">Maximum campus transit cap: ₹10,000</span>
              </div>

              <!-- Preferred Time -->
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Preferred Delivery Time</label>
                <input type="text" name="preferredPickupTime" placeholder="e.g. Today before 6:00 PM" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
              </div>
            </div>

            <!-- Delivery Instructions -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Special Delivery Instructions</label>
              <textarea name="instructions" rows="2" placeholder="e.g. Fragile glassware inside. Call via in-app chat when entering hostel gate." class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"></textarea>
            </div>

            <!-- Transparent Fare Summary Box -->
            <div id="fare-summary-box" class="p-6 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-emerald-950">
              <div class="flex items-center justify-between mb-3">
                <span class="font-bold text-sm flex items-center gap-2">
                  <i data-lucide="calculator" class="w-4 h-4 text-emerald-700"></i>
                  GPS-Estimated Campus Route Fare
                </span>
                <span id="fare-total" class="text-2xl font-extrabold text-emerald-800">₹15</span>
              </div>
              <div class="text-xs text-slate-600 space-y-1.5 border-t border-emerald-200/60 pt-3">
                <div class="flex justify-between">
                  <span>Base campus dispatch fee:</span>
                  <span id="fare-base">₹8.00</span>
                </div>
                <div class="flex justify-between">
                  <span>Route distance fee (<span id="fare-km">1.4 km</span> × ₹5/km):</span>
                  <span id="fare-km-charge">₹7.00</span>
                </div>
                <div class="flex justify-between text-emerald-800 font-semibold pt-1">
                  <span>Delivery Partner Earnings (Peer):</span>
                  <span id="fare-partner-earn">₹12.00</span>
                </div>
                <div class="flex justify-between text-slate-500 text-[11px]">
                  <span>PeerNest Platform Service & Protection Cut:</span>
                  <span id="fare-commission">₹3.00</span>
                </div>
              </div>
            </div>

            <button type="submit" class="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/20 transition">
              Confirm & Post Parcel Request
            </button>
          </form>
        </div>
      </div>
    `;
    setTimeout(() => window.app.updateFareQuote(), 50);
  }

  // --------------------------------------------------------------------------
  // PARCEL ACCEPTANCE & AVAILABLE REQUESTS (Deliver & Earn)
  // --------------------------------------------------------------------------
  async function renderAvailableParcels(container) {
    container.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900">Available Campus Deliveries</h1>
            <p class="text-sm text-slate-500 mt-1">Accept requests, collect packages from the parcel centre, and earn cash upon verified delivery.</p>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="window.app.navigate('partner_dash')" class="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition flex items-center gap-1.5 shadow-sm">
              <i data-lucide="list-checks" class="w-4 h-4"></i> My Active Deliveries
            </button>
          </div>
        </div>

        <div id="available-parcels-list" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="col-span-full py-16 text-center text-slate-400">Loading live parcel requests...</div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/parcels/available');
      const listEl = document.getElementById('available-parcels-list');
      if (!listEl) return;

      if (!data.parcels || data.parcels.length === 0) {
        listEl.innerHTML = `
          <div class="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-200">
            <div class="w-16 h-16 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-4">
              <i data-lucide="package" class="w-8 h-8"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-800">No Parcels Waiting Right Now</h3>
            <p class="text-sm text-slate-500 max-w-sm mx-auto mt-2">All student parcel requests have either been claimed or delivered. Check back soon or request a parcel pickup yourself!</p>
            <button onclick="window.app.navigate('parcel_create')" class="mt-6 px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition">Request a Parcel</button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      listEl.innerHTML = data.parcels.map(p => `
        <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-4">
              <span class="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">${p.parcel_code}</span>
              <div class="text-right">
                <span class="text-xl font-extrabold text-emerald-700">₹${p.partner_earnings}</span>
                <span class="block text-[10px] text-slate-400 font-medium">Your net earnings</span>
              </div>
            </div>

            <div class="space-y-3 mb-6">
              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                  <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
                </div>
                <div>
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Collect At:</span>
                  <span class="text-sm font-bold text-slate-800">${p.collection_centre_name}</span>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
                </div>
                <div>
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Deliver To:</span>
                  <span class="text-sm font-bold text-slate-800">${p.destination_hostel_name}</span>
                  <span class="text-xs text-slate-500 block">${p.designated_location}</span>
                </div>
              </div>
            </div>

            <div class="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 mb-6 flex items-center justify-between">
              <span>Estimated Route Distance:</span>
              <span class="font-bold text-slate-800">${p.distance_km} km</span>
            </div>

            ${p.instructions ? `
              <div class="text-xs text-slate-500 bg-amber-50/60 p-3 rounded-xl border border-amber-100 mb-6">
                <span class="font-bold text-amber-900 block mb-0.5">Requester Note:</span>
                ${p.instructions}
              </div>
            ` : ''}
          </div>

          <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div class="text-xs">
              <span class="text-slate-400">Requester:</span>
              <span class="font-semibold text-slate-700 ml-1">${p.requester_name}</span>
            </div>
            <button onclick="window.app.acceptParcel('${p.id}')" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition">
              Accept Delivery
            </button>
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------------------------------------------------------------
  // RENTAL MARKETPLACE (Borrow Items)
  // --------------------------------------------------------------------------
  async function renderMarketplace(container, filters = {}) {
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900">Student Rental Marketplace</h1>
            <p class="text-sm text-slate-500 mt-1">Rent academic books, Casio calculators, lab equipment, and sports gear from fellow students.</p>
          </div>
          <button onclick="window.app.navigate('rental_create')" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-2 self-start sm:self-auto">
            <i data-lucide="plus" class="w-4 h-4"></i> Lend Your Item
          </button>
        </div>

        <!-- Category Filter Pills -->
        <div class="flex items-center gap-2 overflow-x-auto pb-4 custom-scrollbar mb-6">
          <button onclick="window.app.filterCategory('')" class="px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition ${!filters.category ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}">
            All Categories
          </button>
          ${state.categories.map(c => `
            <button onclick="window.app.filterCategory('${c.slug}')" class="px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition ${filters.category === c.slug ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}">
              ${c.name}
            </button>
          `).join('')}
        </div>

        <!-- Search & Sorting Bar -->
        <div class="bg-white rounded-2xl border border-slate-200 p-4 mb-8 flex flex-col md:flex-row items-center gap-4">
          <div class="flex-1 w-full relative">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-4 top-3.5"></i>
            <input type="text" id="mkt-search" value="${filters.search || ''}" onkeydown="if(event.key==='Enter') window.app.applyMarketSearch()" placeholder="Search by item name, book title, Casio calculator model..." class="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          </div>
          <div class="flex items-center gap-3 w-full md:w-auto">
            <select id="mkt-sort" onchange="window.app.applyMarketSearch()" class="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:outline-none">
              <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>Newest First</option>
              <option value="price_asc" ${filters.sort === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
              <option value="price_desc" ${filters.sort === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
              <option value="popular" ${filters.sort === 'popular' ? 'selected' : ''}>Most Popular</option>
            </select>
            <button onclick="window.app.applyMarketSearch()" class="px-5 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition">Filter</button>
          </div>
        </div>

        <!-- Listings Grid -->
        <div id="marketplace-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="col-span-full py-16 text-center text-slate-400">Loading marketplace items...</div>
        </div>
      </div>
    `;

    try {
      const qs = new URLSearchParams();
      if (filters.category) qs.set('category', filters.category);
      if (filters.search) qs.set('search', filters.search);
      if (filters.sort) qs.set('sort', filters.sort);

      const res = await api(`/api/rentals/listings?${qs.toString()}`);
      const grid = document.getElementById('marketplace-grid');
      if (!grid) return;

      if (!res.listings || res.listings.length === 0) {
        grid.innerHTML = `
          <div class="col-span-full bg-white rounded-3xl p-12 text-center border border-slate-200">
            <div class="w-16 h-16 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-4">
              <i data-lucide="tag" class="w-8 h-8"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-800">No Items Found</h3>
            <p class="text-sm text-slate-500 max-w-sm mx-auto mt-2">No student has listed an item matching your filter. Be the first to list one!</p>
            <button onclick="window.app.navigate('rental_create')" class="mt-6 px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition">Lend an Item</button>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      grid.innerHTML = res.listings.map(item => `
        <div onclick="window.app.openListingDetails('${item.id}')" class="cursor-pointer group bg-white rounded-3xl border border-slate-200 hover:border-emerald-500 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all flex flex-col justify-between">
          <div>
            <div class="h-48 bg-slate-100 overflow-hidden relative">
              <img src="${item.photos[0] || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600'}" alt="${item.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
              <div class="absolute top-3 left-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-700 uppercase">
                ${item.category_name}
              </div>
              <div class="absolute top-3 right-3 bg-slate-900/80 backdrop-blur text-white px-2.5 py-1 rounded-lg text-xs font-bold">
                ₹${item.daily_price}<span class="text-[10px] font-normal text-slate-300">/day</span>
              </div>
            </div>

            <div class="p-6">
              <h3 class="font-bold text-base text-slate-900 group-hover:text-emerald-700 transition line-clamp-1">${item.title}</h3>
              <p class="mt-2 text-slate-500 text-xs line-clamp-2 leading-relaxed">${item.description}</p>

              <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Refundable Deposit:</span>
                <span class="font-bold text-slate-800">₹${item.security_deposit}</span>
              </div>
              <div class="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>Declared Item Value:</span>
                <span class="font-bold text-slate-800">₹${item.declared_value}</span>
              </div>
            </div>
          </div>

          <div class="px-6 pb-6 pt-2 flex items-center justify-between border-t border-slate-50">
            <div class="flex items-center gap-1.5 text-xs text-slate-700">
              <div class="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">
                ${item.owner_name.charAt(0)}
              </div>
              <span class="font-medium truncate max-w-[120px]">${item.owner_name}</span>
              <i data-lucide="badge-check" class="w-3.5 h-3.5 text-emerald-600"></i>
            </div>
            <span class="text-xs font-bold text-emerald-600 group-hover:translate-x-0.5 transition">Rent Now &rarr;</span>
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------------------------------------------------------------
  // LEND AN ITEM FORM (Listing Creation)
  // --------------------------------------------------------------------------
  function renderRentalListingForm(container) {
    container.innerHTML = `
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <i data-lucide="tag" class="w-5 h-5"></i>
            </div>
            <div>
              <h1 class="text-2xl font-bold text-slate-900">List an Item for Student Rental</h1>
              <p class="text-xs text-slate-500">Earn money by renting your belongings to fellow VIT students.</p>
            </div>
          </div>

          <form onsubmit="window.app.handleListingSubmit(event)" class="space-y-6">
            <!-- Title -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Item Title *</label>
              <input type="text" name="title" required placeholder="e.g. Casio fx-991EX Scientific Calculator / CLRS Algorithms 3rd Ed." class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Category -->
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Category *</label>
                <select name="categoryId" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white">
                  ${state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
              </div>

              <!-- Condition -->
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Current Condition *</label>
                <select name="condition" required class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white">
                  <option value="like_new">Like New (Mint Condition)</option>
                  <option value="brand_new">Brand New</option>
                  <option value="good" selected>Good (Minor normal wear)</option>
                  <option value="fair">Fair (Fully functional with cosmetic marks)</option>
                </select>
              </div>
            </div>

            <!-- Distinct 3 Values: Daily Rate, Security Deposit, Declared Value -->
            <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-1">Pricing & Financial Safeguards</span>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">1. Daily Rental Price (₹) *</label>
                  <input type="number" name="dailyPrice" min="5" value="25" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900">
                  <span class="text-[10px] text-slate-400">Rent per day</span>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">2. Refundable Deposit (₹) *</label>
                  <input type="number" name="securityDeposit" min="0" value="500" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900">
                  <span class="text-[10px] text-slate-400">Returned upon safe return</span>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">3. Declared Value (₹) *</label>
                  <input type="number" name="declaredValue" min="50" value="1800" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900">
                  <span class="text-[10px] text-slate-400">Reference for damage appraisal</span>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Item Description *</label>
              <textarea name="description" rows="3" required placeholder="Describe condition, edition, battery health, or specific accessories included..." class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"></textarea>
            </div>

            <!-- Handover Location -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Preferred Handover Location *</label>
              <input type="text" name="handoverLocation" required placeholder="e.g. Foodys near Gate 2 / SJT Ground Floor Gazebo" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
            </div>

            <!-- Photo URL -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Photo Image URL</label>
              <input type="url" name="photoUrl" placeholder="https://images.unsplash.com/photo-..." class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm">
            </div>

            <button type="submit" class="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/20 transition">
              Publish Rental Listing
            </button>
          </form>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // USER DASHBOARDS (Requester, Partner, Lender, Borrower)
  // --------------------------------------------------------------------------
  async function renderRequesterDashboard(container) {
    container.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900">Parcel Requester Dashboard</h1>
            <p class="text-sm text-slate-500 mt-1">Track active deliveries, reveal your delivery OTP, and message your delivery partner.</p>
          </div>
          <button onclick="window.app.navigate('parcel_create')" class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition">New Parcel Request</button>
        </div>

        <div id="requester-requests-list" class="space-y-4">
          <div class="text-center py-12 text-slate-400">Loading your parcel requests...</div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/parcels/my-requests');
      const listEl = document.getElementById('requester-requests-list');
      if (!listEl) return;

      if (!data.requests || data.requests.length === 0) {
        listEl.innerHTML = `<div class="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-500">You haven't requested any parcel pickups yet.</div>`;
        return;
      }

      listEl.innerHTML = data.requests.map(r => `
        <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div class="space-y-2 flex-1">
            <div class="flex items-center gap-3">
              <span class="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">${r.parcel_code}</span>
              <span class="text-xs font-bold px-2.5 py-1 rounded-full ${getStatusBadge(r.status)}">${r.status.toUpperCase()}</span>
            </div>
            <h3 class="font-bold text-base text-slate-900">${r.parcel_reference}</h3>
            <div class="text-xs text-slate-500 flex flex-wrap gap-4">
              <span><strong>From:</strong> ${r.collection_centre_name}</span>
              <span><strong>To:</strong> ${r.destination_hostel_name} (${r.designated_location})</span>
              <span><strong>Fee:</strong> ₹${r.total_fee}</span>
            </div>
          </div>

          <!-- Actions & OTP -->
          <div class="flex items-center gap-3 w-full md:w-auto justify-end">
            ${r.delivery_otp && !r.otp_verified && r.status === 'out_for_delivery' ? `
              <div class="bg-emerald-50 border border-emerald-300 p-3 rounded-2xl text-center">
                <span class="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Your Delivery OTP:</span>
                <span class="text-lg font-mono font-extrabold text-emerald-700 tracking-widest">${r.delivery_otp}</span>
                <span class="text-[9px] text-slate-500 block">Give this to delivery partner upon handover</span>
              </div>
            ` : ''}

            ${r.conversation_id ? `
              <button onclick="window.app.navigate('chat', { conversationId: '${r.conversation_id}' })" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition">
                <i data-lucide="message-square" class="w-4 h-4"></i> Chat
              </button>
            ` : ''}

            <button onclick="window.app.openIssueModal('${r.id}')" class="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs transition">
              Report Issue
            </button>
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  async function renderPartnerDashboard(container) {
    container.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900">Delivery Partner Dashboard</h1>
            <p class="text-sm text-slate-500 mt-1">Manage accepted deliveries, confirm centre pickups, and verify completion OTPs.</p>
          </div>
          <button onclick="window.app.navigate('parcels_available')" class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition">Browse New Deliveries</button>
        </div>

        <div id="partner-summary" class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <!-- Summary Cards filled dynamically -->
        </div>

        <div id="partner-deliveries-list" class="space-y-4">
          <div class="text-center py-12 text-slate-400">Loading your deliveries...</div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/parcels/my-deliveries');
      const listEl = document.getElementById('partner-deliveries-list');
      const summaryEl = document.getElementById('partner-summary');
      if (!listEl) return;

      if (data.summary && summaryEl) {
        summaryEl.innerHTML = `
          <div class="bg-white p-5 rounded-2xl border border-slate-200">
            <span class="text-xs text-slate-500 font-medium">Total Deliveries</span>
            <span class="block text-2xl font-extrabold text-slate-900 mt-1">${data.summary.totalDeliveries}</span>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200">
            <span class="text-xs text-slate-500 font-medium">Active Transit</span>
            <span class="block text-2xl font-extrabold text-amber-600 mt-1">${data.summary.activeCount}</span>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200">
            <span class="text-xs text-slate-500 font-medium">Completed</span>
            <span class="block text-2xl font-extrabold text-emerald-600 mt-1">${data.summary.completedCount}</span>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200">
            <span class="text-xs text-slate-500 font-medium">Earned Balance</span>
            <span class="block text-2xl font-extrabold text-emerald-700 mt-1">₹${data.summary.totalEarned}</span>
          </div>
        `;
      }

      if (!data.deliveries || data.deliveries.length === 0) {
        listEl.innerHTML = `<div class="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-500">You have not claimed any deliveries yet.</div>`;
        return;
      }

      listEl.innerHTML = data.deliveries.map(d => `
        <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div class="space-y-2 flex-1">
            <div class="flex items-center gap-3">
              <span class="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">${d.parcel_code}</span>
              <span class="text-xs font-bold px-2.5 py-1 rounded-full ${getStatusBadge(d.status)}">${d.status.toUpperCase()}</span>
            </div>
            <h3 class="font-bold text-base text-slate-900">${d.parcel_reference}</h3>
            <div class="text-xs text-slate-500 flex flex-wrap gap-4">
              <span><strong>Collect:</strong> ${d.collection_centre_name}</span>
              <span><strong>Drop:</strong> ${d.destination_hostel_name} (${d.designated_location})</span>
              <span class="text-emerald-700 font-bold">Earnings: ₹${d.partner_earnings}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 w-full md:w-auto justify-end">
            ${d.status === 'accepted' ? `
              <button onclick="window.app.confirmCollection('${d.id}')" class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition">
                Confirm Parcel Collection
              </button>
            ` : ''}

            ${d.status === 'out_for_delivery' ? `
              <button onclick="window.app.openOtpModal('${d.id}')" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition">
                Enter Recipient OTP to Deliver
              </button>
            ` : ''}

            ${d.conversation_id ? `
              <button onclick="window.app.navigate('chat', { conversationId: '${d.conversation_id}' })" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition">
                <i data-lucide="message-square" class="w-4 h-4"></i> Chat
              </button>
            ` : ''}
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------------------------------------------------------------
  // LENDER DASHBOARD (Manage listings & incoming bookings)
  // --------------------------------------------------------------------------
  async function renderLenderDashboard(container) {
    container.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900">Lender Dashboard</h1>
            <p class="text-sm text-slate-500 mt-1">Review rental booking requests, manage active rentals, and inspect returned items.</p>
          </div>
          <button onclick="window.app.navigate('rental_create')" class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition">List Another Item</button>
        </div>

        <div id="lender-content" class="space-y-6">
          <div class="text-center py-12 text-slate-400">Loading lender dashboard...</div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/rentals/my-listings');
      const contentEl = document.getElementById('lender-content');
      if (!contentEl) return;

      contentEl.innerHTML = `
        <!-- Bookings Section -->
        <div>
          <h2 class="text-lg font-bold text-slate-900 mb-4">Incoming & Active Bookings</h2>
          ${!data.bookings || data.bookings.length === 0 ? `
            <div class="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-sm">No bookings requested yet.</div>
          ` : `
            <div class="space-y-4">
              ${data.bookings.map(b => `
                <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div class="space-y-2 flex-1">
                    <div class="flex items-center gap-3">
                      <span class="text-xs font-bold px-2.5 py-1 rounded-full ${getStatusBadge(b.status)}">${b.status.toUpperCase()}</span>
                      <span class="text-xs text-slate-400">${b.start_date} to ${b.end_date} (${b.billable_days} days)</span>
                    </div>
                    <h3 class="font-bold text-base text-slate-900">${b.item_title}</h3>
                    <div class="text-xs text-slate-600 flex flex-wrap gap-4">
                      <span><strong>Borrower:</strong> ${b.borrower_name} (${b.borrower_hostel})</span>
                      <span><strong>Total Rent:</strong> ₹${b.total_rental_charge}</span>
                      <span><strong>Deposit:</strong> ₹${b.security_deposit}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-3 w-full md:w-auto justify-end">
                    ${b.status === 'pending' ? `
                      <button onclick="window.app.respondBooking('${b.id}', 'accept')" class="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition">Accept</button>
                      <button onclick="window.app.respondBooking('${b.id}', 'reject')" class="px-4 py-2 bg-rose-50 text-rose-700 font-bold text-xs rounded-xl hover:bg-rose-100 transition">Decline</button>
                    ` : ''}

                    ${b.status === 'active' ? `
                      <button onclick="window.app.openReturnInspectionModal('${b.id}')" class="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition">Inspect Return & Release Deposit</button>
                    ` : ''}

                    ${b.conversation_id ? `
                      <button onclick="window.app.navigate('chat', { conversationId: '${b.conversation_id}' })" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5">
                        <i data-lucide="message-square" class="w-4 h-4"></i> Chat
                      </button>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- My Listings Section -->
        <div class="pt-6">
          <h2 class="text-lg font-bold text-slate-900 mb-4">My Published Listings (${data.listings.length})</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            ${data.listings.map(l => `
              <div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <span class="text-[10px] font-bold uppercase text-slate-400">${l.category_name}</span>
                  <h3 class="font-bold text-base text-slate-900 mt-1 line-clamp-1">${l.title}</h3>
                  <div class="mt-3 text-xs text-slate-500 space-y-1">
                    <div class="flex justify-between"><span>Daily Rent:</span> <strong class="text-slate-900">₹${l.daily_price}</strong></div>
                    <div class="flex justify-between"><span>Security Deposit:</span> <strong class="text-slate-900">₹${l.security_deposit}</strong></div>
                    <div class="flex justify-between"><span>Declared Value:</span> <strong class="text-slate-900">₹${l.declared_value}</strong></div>
                  </div>
                </div>
                <div class="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
                  <span class="text-slate-400">${l.views_count} views</span>
                  <span class="text-emerald-600 font-bold">Active Listing</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------------------------------------------------------------
  // BORROWER DASHBOARD (My Bookings & Rentals)
  // --------------------------------------------------------------------------
  async function renderBorrowerDashboard(container) {
    container.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-extrabold text-slate-900">Borrower Dashboard</h1>
            <p class="text-sm text-slate-500 mt-1">Track your rental bookings, complete gateway payments, and manage security deposits.</p>
          </div>
          <button onclick="window.app.navigate('marketplace')" class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition">Browse Marketplace</button>
        </div>

        <div id="borrower-bookings-list" class="space-y-4">
          <div class="text-center py-12 text-slate-400">Loading your rentals...</div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/rentals/my-bookings');
      const listEl = document.getElementById('borrower-bookings-list');
      if (!listEl) return;

      if (!data.bookings || data.bookings.length === 0) {
        listEl.innerHTML = `<div class="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-500">You haven't booked any items yet.</div>`;
        return;
      }

      listEl.innerHTML = data.bookings.map(b => `
        <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div class="space-y-2 flex-1">
            <div class="flex items-center gap-3">
              <span class="text-xs font-bold px-2.5 py-1 rounded-full ${getStatusBadge(b.status)}">${b.status.toUpperCase()}</span>
              <span class="text-xs text-slate-400">${b.start_date} to ${b.end_date} (${b.billable_days} days)</span>
            </div>
            <h3 class="font-bold text-base text-slate-900">${b.item_title}</h3>
            <div class="text-xs text-slate-600 flex flex-wrap gap-4">
              <span><strong>Owner:</strong> ${b.owner_name} (${b.owner_hostel})</span>
              <span><strong>Rental Fee:</strong> ₹${b.total_rental_charge}</span>
              <span><strong>Deposit:</strong> ₹${b.security_deposit}</span>
              <span><strong>Total Payable:</strong> ₹${b.total_payable}</span>
            </div>
          </div>

          <div class="flex items-center gap-3 w-full md:w-auto justify-end">
            ${b.status === 'accepted' ? `
              <button onclick="window.app.payForRental('${b.id}')" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5">
                <i data-lucide="credit-card" class="w-4 h-4"></i> Pay ₹${b.total_payable} (Razorpay)
              </button>
            ` : ''}

            ${b.status === 'active' ? `
              <button onclick="window.app.openHandoverReportModal('${b.id}')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">
                Condition Report
              </button>
            ` : ''}

            ${b.conversation_id ? `
              <button onclick="window.app.navigate('chat', { conversationId: '${b.conversation_id}' })" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5">
                <i data-lucide="message-square" class="w-4 h-4"></i> Chat
              </button>
            ` : ''}
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------------------------------------------------------------
  // PRIVATE TRANSACTION CHAT VIEW
  // --------------------------------------------------------------------------
  async function renderChatView(container, conversationId = null) {
    container.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col h-[calc(100vh-8rem)]">
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row flex-1 overflow-hidden">
          <!-- Conversation List -->
          <div class="w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
            <div class="p-4 border-b border-slate-200 font-bold text-sm text-slate-800 flex items-center gap-2">
              <i data-lucide="message-square" class="w-4 h-4 text-emerald-600"></i>
              Transaction Chats
            </div>
            <div id="chat-conv-list" class="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
              <div class="p-6 text-center text-slate-400 text-xs">Loading conversations...</div>
            </div>
          </div>

          <!-- Active Message Window -->
          <div id="chat-window" class="flex-1 flex flex-col bg-white">
            <div class="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-sm">
              Select a transaction chat from the left to view messages.
            </div>
          </div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/chat/conversations');
      const convListEl = document.getElementById('chat-conv-list');
      if (!convListEl) return;

      if (!data.conversations || data.conversations.length === 0) {
        convListEl.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">No active chats. Chats unlock automatically once a parcel or rental request is accepted.</div>`;
        return;
      }

      convListEl.innerHTML = data.conversations.map(c => `
        <div onclick="window.app.loadChatConversation('${c.id}')" class="p-4 cursor-pointer hover:bg-slate-100 transition ${c.id === conversationId ? 'bg-emerald-50/70 border-l-4 border-emerald-600' : ''}">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-xs text-slate-900 truncate max-w-[140px]">${c.counterpart.full_name}</span>
            <span class="text-[10px] text-slate-400">${c.last_message_time ? new Date(c.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
          <span class="text-[11px] font-semibold text-emerald-700 block truncate">${c.transactionTitle}</span>
          <p class="text-xs text-slate-500 truncate mt-0.5">${c.last_message_content || 'No messages yet.'}</p>
        </div>
      `).join('');

      if (conversationId) {
        loadChatConversation(conversationId);
      } else if (data.conversations.length > 0) {
        loadChatConversation(data.conversations[0].id);
      }
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  async function loadChatConversation(convId) {
    state.activeConversationId = convId;
    const chatWindow = document.getElementById('chat-window');
    if (!chatWindow) return;

    chatWindow.innerHTML = `
      <!-- Header -->
      <div id="chat-header" class="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">💬</div>
          <div>
            <h3 class="font-bold text-sm text-slate-900" id="chat-header-title">Transaction Chat</h3>
            <span class="text-[11px] text-slate-500" id="chat-header-sub">Authorized Transaction Room</span>
          </div>
        </div>
      </div>

      <!-- Messages Body -->
      <div id="chat-messages-container" class="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar bg-slate-50/30">
        <div class="text-center py-8 text-slate-400 text-xs">Loading messages...</div>
      </div>

      <!-- Input Footer -->
      <form onsubmit="window.app.handleSendMessage(event, '${convId}')" class="p-3 border-t border-slate-200 flex items-center gap-2 bg-white">
        <input type="text" id="chat-input" placeholder="Type a message (e.g. I have reached the parcel counter)..." required class="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <button type="submit" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm">Send</button>
      </form>
    `;

    loadConversationMessages(convId);
  }

  async function loadConversationMessages(convId) {
    try {
      const data = await api(`/api/chat/conversations/${convId}/messages`);
      const container = document.getElementById('chat-messages-container');
      if (!container) return;

      if (!data.messages || data.messages.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">No messages yet. Send your first message below.</div>`;
        return;
      }

      container.innerHTML = data.messages.map(m => {
        const isMe = m.sender_id === state.user.id;
        const isSystem = m.message_type === 'system';

        if (isSystem) {
          return `
            <div class="text-center my-3">
              <span class="inline-block bg-slate-200/80 text-slate-700 text-[11px] font-semibold px-3 py-1 rounded-full">${m.content}</span>
            </div>
          `;
        }

        return `
          <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
            <div class="max-w-[75%] p-3 rounded-2xl text-xs leading-relaxed ${isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'}">
              <div class="font-bold text-[10px] ${isMe ? 'text-emerald-200' : 'text-slate-500'} mb-1">${m.sender_name}</div>
              <div>${m.content}</div>
            </div>
            <span class="text-[9px] text-slate-400 mt-1 px-1">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        `;
      }).join('');

      container.scrollTop = container.scrollHeight;
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------------------------------------------------------------
  // ADMINISTRATOR DASHBOARD
  // --------------------------------------------------------------------------
  async function renderAdminDashboard(container) {
    if (!state.profile || !state.profile.is_admin) {
      showToast('Admin privilege required.', 'error');
      return navigate('activities');
    }

    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex items-center justify-between mb-8">
          <div>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-200 px-2.5 py-1 rounded-md">VIT Administration</span>
            <h1 class="text-3xl font-extrabold text-slate-900 mt-2">PeerNest Campus Master Console</h1>
          </div>
          <button onclick="window.app.navigate('activities')" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition">Exit Admin</button>
        </div>

        <!-- Admin Overview Metrics -->
        <div id="admin-overview-cards" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div class="bg-white p-5 rounded-2xl border border-slate-200 animate-pulse h-24"></div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 animate-pulse h-24"></div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 animate-pulse h-24"></div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 animate-pulse h-24"></div>
        </div>

        <!-- Admin Sub-Navigation Tabs -->
        <div class="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto custom-scrollbar">
          <button onclick="window.app.switchAdminTab('finances')" id="tab-btn-finances" class="px-4 py-2.5 text-xs font-bold border-b-2 border-emerald-600 text-emerald-600 transition shrink-0">Financials & Commission</button>
          <button onclick="window.app.switchAdminTab('users')" id="tab-btn-users" class="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition shrink-0">Student Users</button>
          <button onclick="window.app.switchAdminTab('parcels')" id="tab-btn-parcels" class="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition shrink-0">Parcel Operations</button>
          <button onclick="window.app.switchAdminTab('rentals')" id="tab-btn-rentals" class="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition shrink-0">Rentals Monitor</button>
          <button onclick="window.app.switchAdminTab('disputes')" id="tab-btn-disputes" class="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition shrink-0">Dispute Cases</button>
          <button onclick="window.app.switchAdminTab('settings')" id="tab-btn-settings" class="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition shrink-0">Platform Pricing Config</button>
        </div>

        <!-- Tab Content Area -->
        <div id="admin-tab-content" class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div class="py-12 text-center text-slate-400 text-xs">Loading admin records...</div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/admin/overview');
      const cardsEl = document.getElementById('admin-overview-cards');
      if (cardsEl) {
        cardsEl.innerHTML = `
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500 font-medium">Verified Students</span>
            <span class="block text-2xl font-extrabold text-slate-900 mt-1">${data.metrics.totalStudents}</span>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500 font-medium">Active Deliveries</span>
            <span class="block text-2xl font-extrabold text-amber-600 mt-1">${data.metrics.activeDeliveries}</span>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500 font-medium">Active Rentals</span>
            <span class="block text-2xl font-extrabold text-purple-600 mt-1">${data.metrics.activeRentals}</span>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <span class="text-xs text-slate-500 font-medium">Platform Protection Reserve</span>
            <span class="block text-2xl font-extrabold text-emerald-700 mt-1">₹${data.financials.protectionReserveBalance}</span>
          </div>
        `;
      }
      switchAdminTab('finances');
    } catch (e) {
      console.error(e);
    }
  }

  async function switchAdminTab(tabName) {
    const tabs = ['finances', 'users', 'parcels', 'rentals', 'disputes', 'settings'];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      if (btn) {
        if (t === tabName) {
          btn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 border-emerald-600 text-emerald-600 transition shrink-0';
        } else {
          btn.className = 'px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition shrink-0';
        }
      }
    });

    const content = document.getElementById('admin-tab-content');
    if (!content) return;

    if (tabName === 'finances') {
      const data = await api('/api/admin/overview');
      content.innerHTML = `
        <h2 class="text-lg font-bold text-slate-900 mb-6">Financial Ledger & Revenue Breakdown</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="p-6 rounded-2xl bg-emerald-50 border border-emerald-200">
            <span class="text-xs font-bold text-emerald-800 uppercase tracking-wider">Total Platform Revenue</span>
            <span class="block text-3xl font-extrabold text-emerald-900 mt-2">₹${data.financials.totalPlatformRevenue}</span>
            <span class="text-xs text-emerald-700 mt-1 block">Commissions from parcel deliveries + rental services</span>
          </div>
          <div class="p-6 rounded-2xl bg-blue-50 border border-blue-200">
            <span class="text-xs font-bold text-blue-800 uppercase tracking-wider">Student Delivery Earnings</span>
            <span class="block text-3xl font-extrabold text-blue-900 mt-2">₹${data.financials.studentPartnerEarnings}</span>
            <span class="text-xs text-blue-700 mt-1 block">Disbursed directly to student delivery partners</span>
          </div>
          <div class="p-6 rounded-2xl bg-purple-50 border border-purple-200">
            <span class="text-xs font-bold text-purple-800 uppercase tracking-wider">Student Lender Payouts</span>
            <span class="block text-3xl font-extrabold text-purple-900 mt-2">₹${data.financials.studentLenderEarnings}</span>
            <span class="text-xs text-purple-700 mt-1 block">Net rental income credited to item owners</span>
          </div>
        </div>
        <div class="p-4 bg-slate-50 rounded-2xl text-xs text-slate-600 flex justify-between items-center">
          <span>* Transparent accounting note: Refundable security deposits (₹${data.financials.totalRefundsProcessed} refunded) are kept strictly separate from platform revenue.</span>
        </div>
      `;
    } else if (tabName === 'users') {
      const data = await api('/api/admin/users');
      content.innerHTML = `
        <h2 class="text-lg font-bold text-slate-900 mb-6">Registered VIT Students (${data.users.length})</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-600">
            <thead class="bg-slate-100 text-slate-800 uppercase text-[10px] font-bold">
              <tr>
                <th class="p-3">Full Name</th>
                <th class="p-3">Reg No</th>
                <th class="p-3">Institutional Email</th>
                <th class="p-3">Hostel</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${data.users.map(u => `
                <tr class="hover:bg-slate-50">
                  <td class="p-3 font-bold text-slate-800">${u.full_name || 'Student'}</td>
                  <td class="p-3 font-mono">${u.registration_number || 'N/A'}</td>
                  <td class="p-3">${u.email}</td>
                  <td class="p-3">${u.hostel_block || 'Vellore'}</td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${u.is_suspended ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
                      ${u.is_suspended ? 'Suspended' : 'Active Verified'}
                    </span>
                  </td>
                  <td class="p-3 text-right">
                    <button onclick="window.app.toggleSuspendUser('${u.id}')" class="px-3 py-1 rounded-lg text-[10px] font-bold ${u.is_suspended ? 'bg-emerald-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'} transition">
                      ${u.is_suspended ? 'Reactivate' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (tabName === 'parcels') {
      const data = await api('/api/admin/parcels');
      content.innerHTML = `
        <h2 class="text-lg font-bold text-slate-900 mb-6">Campus Parcel Operations (${data.parcels.length})</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-600">
            <thead class="bg-slate-100 text-slate-800 uppercase text-[10px] font-bold">
              <tr>
                <th class="p-3">Parcel ID</th>
                <th class="p-3">Requester</th>
                <th class="p-3">Centre & Drop</th>
                <th class="p-3">Fee Split</th>
                <th class="p-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${data.parcels.map(p => `
                <tr class="hover:bg-slate-50">
                  <td class="p-3 font-mono font-bold text-slate-800">${p.parcel_code}</td>
                  <td class="p-3">${p.requester_name}</td>
                  <td class="p-3">${p.collection_centre_name} &rarr; ${p.destination_hostel_name}</td>
                  <td class="p-3">Total: ₹${p.total_fee} (Earn: ₹${p.partner_earnings}, Cut: ₹${p.platform_commission})</td>
                  <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(p.status)}">${p.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (tabName === 'disputes') {
      const data = await api('/api/admin/disputes');
      content.innerHTML = `
        <h2 class="text-lg font-bold text-slate-900 mb-6">Disputes & Protection Claims</h2>
        <div class="space-y-4">
          ${(!data.parcelDisputes || data.parcelDisputes.length === 0) && (!data.rentalDisputes || data.rentalDisputes.length === 0) ? `
            <div class="text-center py-8 text-slate-400 text-xs">No active dispute cases. All deliveries and rentals operating smoothly.</div>
          ` : ''}

          ${(data.parcelDisputes || []).map(d => `
            <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <span class="text-xs font-bold text-slate-900">Parcel #${d.parcel_code} - ${d.issue_type}</span>
                <p class="text-xs text-slate-600 mt-1">${d.description}</p>
                <span class="text-[10px] text-slate-400 mt-1 block">Reported by: ${d.reporter_name}</span>
              </div>
              <div class="flex gap-2">
                <button onclick="window.app.resolveParcelDispute('${d.id}', 'refund_requester')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold">Refund Fee</button>
                <button onclick="window.app.resolveParcelDispute('${d.id}', 'compensate_from_reserve', ${d.declared_value})" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold">Compensate (Reserve)</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tabName === 'settings') {
      const data = await api('/api/admin/settings');
      content.innerHTML = `
        <h2 class="text-lg font-bold text-slate-900 mb-6">Platform Pricing & Operational Parameters</h2>
        <form onsubmit="window.app.handleSaveSettings(event)" class="space-y-4 max-w-xl">
          ${data.settings.map(s => `
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">${s.key.replace(/_/g, ' ')}</label>
              <input type="text" name="${s.key}" value="${s.value}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
              <span class="text-[10px] text-slate-400 block mt-0.5">${s.description}</span>
            </div>
          `).join('')}
          <button type="submit" class="mt-4 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition">Save Configuration</button>
        </form>
      `;
    }
  }

  // --------------------------------------------------------------------------
  // USER PROFILE VIEW
  // --------------------------------------------------------------------------
  function renderProfileView(container) {
    const prof = state.profile || {};
    container.innerHTML = `
      <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div class="flex items-center gap-4 mb-8">
            <div class="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 font-extrabold text-2xl flex items-center justify-center">
              ${prof.full_name ? prof.full_name.charAt(0) : 'U'}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-2xl font-bold text-slate-900">${prof.full_name || 'Student'}</h1>
                <i data-lucide="badge-check" class="w-5 h-5 text-emerald-600"></i>
              </div>
              <span class="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 mt-1 inline-block">
                VIT Vellore Verified Student
              </span>
            </div>
          </div>

          <!-- Privacy Safeguards Notice -->
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-8 space-y-1">
            <div class="font-bold text-slate-800 flex items-center gap-1.5">
              <i data-lucide="lock" class="w-3.5 h-3.5 text-slate-500"></i> PeerNest Campus Privacy Guarantee
            </div>
            <p>Your VIT registration number (${prof.registration_number}), personal phone number, and exact room number remain encrypted and strictly private. They are never displayed on public listings or to peer students.</p>
          </div>

          <form onsubmit="window.app.handleProfileUpdate(event)" class="space-y-5">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Full Name</label>
              <input type="text" name="fullName" value="${prof.full_name || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Hostel Block</label>
                <input type="text" name="hostelBlock" value="${prof.hostel_block || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Room Number (Private)</label>
                <input type="text" name="roomNumber" value="${prof.room_number || ''}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Bio / Profile Description</label>
              <textarea name="bio" rows="2" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm">${prof.bio || ''}</textarea>
            </div>

            <div class="pt-4 flex items-center justify-between border-t border-slate-100">
              <button type="submit" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-sm">Save Profile</button>
              <button type="button" onclick="window.app.clearSession()" class="text-xs font-semibold text-rose-600 hover:text-rose-700">Sign Out</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  // --------------------------------------------------------------------------
  // NOTIFICATIONS VIEW
  // --------------------------------------------------------------------------
  async function renderNotificationsView(container) {
    container.innerHTML = `
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">Notifications</h1>
            <p class="text-xs text-slate-500 mt-1">Campus alerts, delivery updates, and rental due reminders.</p>
          </div>
          <button onclick="window.app.markAllNotifsRead()" class="text-xs font-bold text-emerald-600 hover:text-emerald-700">Mark all as read</button>
        </div>

        <div id="notifs-list" class="space-y-3">
          <div class="text-center py-12 text-slate-400 text-xs">Loading notifications...</div>
        </div>
      </div>
    `;

    try {
      const data = await api('/api/notifications');
      const listEl = document.getElementById('notifs-list');
      if (!listEl) return;

      if (!data.notifications || data.notifications.length === 0) {
        listEl.innerHTML = `<div class="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-500 text-sm">No notifications yet.</div>`;
        return;
      }

      listEl.innerHTML = data.notifications.map(n => `
        <div onclick="window.app.markNotifRead('${n.id}', '${n.action_url || ''}')" class="p-4 rounded-2xl border ${n.is_read ? 'bg-white border-slate-200' : 'bg-emerald-50/60 border-emerald-200'} cursor-pointer hover:shadow-sm transition flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
            <i data-lucide="bell" class="w-4 h-4"></i>
          </div>
          <div class="flex-1">
            <h4 class="font-bold text-xs text-slate-900">${n.title}</h4>
            <p class="text-xs text-slate-600 mt-0.5">${n.message}</p>
            <span class="text-[10px] text-slate-400 mt-1 block">${new Date(n.created_at).toLocaleString()}</span>
          </div>
        </div>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------------------------------------------------------------
  // MODALS & DIALOGS (Login, Register, OTP, Listing Detail, Razorpay)
  // --------------------------------------------------------------------------
  async function renderLoginModal() {
    let users = [];
    try {
      const data = await api('/api/auth/users-list');
      users = data.users || [];
    } catch (e) {
      users = [
        { email: 'aarav.sharma2023@vitstudent.ac.in', full_name: 'Aarav Sharma', hostel_block: "MH-D Block" },
        { email: 'priya.nair2022@vitstudent.ac.in', full_name: 'Priya Nair', hostel_block: "LH-B Block" },
        { email: 'rohit.verma2024@vitstudent.ac.in', full_name: 'Rohit Verma', hostel_block: "MH-L Block" },
        { email: 'admin.peernest@vitstudent.ac.in', full_name: 'Prof. Ramesh Kumar (Admin)', hostel_block: "Faculty Block" }
      ];
    }

    const defaultEmail = users[0] ? users[0].email : 'aarav.sharma2023@vitstudent.ac.in';

    openModal(`
      <div class="space-y-5">
        <div class="text-center">
          <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-3">
            <i data-lucide="lock" class="w-6 h-6"></i>
          </div>
          <h2 class="text-2xl font-bold text-slate-900">Sign in to PeerNest</h2>
          <p class="text-xs text-slate-500 mt-1">Exclusively accessible to verified VIT Vellore students.</p>
        </div>

        <form onsubmit="window.app.handleLogin(event)" class="space-y-4">
          <!-- Dynamic User Dropdown Selector -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Pick User Account</label>
            <select id="user-dropdown-select" onchange="window.app.onUserSelectChange(this)" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800">
              ${users.map(u => `
                <option value="${u.email}">
                  ${u.full_name || 'Student'} (${u.hostel_block || 'VIT'}) — ${u.email}
                </option>
              `).join('')}
              <option value="custom">✏️ Type another email address...</option>
            </select>
          </div>

          <!-- Email Input Field -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">VIT Institutional Email</label>
            <input type="email" id="login-email-input" name="email" required placeholder="name.reg2023@vitstudent.ac.in" value="${defaultEmail}" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          </div>

          <!-- Password Field -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-700">Password</label>
              <span class="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Default: campus123</span>
            </div>
            <input type="password" id="login-password-input" name="password" required value="campus123" placeholder="Enter password" class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          </div>

          <button type="submit" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition">
            Sign In
          </button>
        </form>

        <div class="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
          Don't have an account? <button onclick="window.app.openRegisterModal()" class="text-emerald-600 font-bold hover:underline">Register with VIT email</button>
        </div>
      </div>
    `);
  }

  function renderRegisterModal() {
    openModal(`
      <div class="space-y-5">
        <div class="text-center">
          <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-3">
            <i data-lucide="user-plus" class="w-6 h-6"></i>
          </div>
          <h2 class="text-2xl font-bold text-slate-900">VIT Student Registration</h2>
          <p class="text-xs text-slate-500 mt-1">Registration strictly restricted to @vitstudent.ac.in institutional emails.</p>
        </div>

        <form onsubmit="window.app.handleRegister(event)" class="space-y-3.5">
          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Full Name *</label>
            <input type="text" name="fullName" required placeholder="e.g. Ananya Sen" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">VIT Reg Number *</label>
              <input type="text" name="registrationNumber" required placeholder="e.g. 23BCE1042" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Phone Number *</label>
              <input type="tel" name="phoneNumber" required placeholder="+91 98765 43210" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">VIT Institutional Email *</label>
            <input type="email" name="email" required placeholder="name.reg2024@vitstudent.ac.in" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Hostel Block *</label>
              <select name="hostelBlock" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white">
                ${state.hostelLocations.map(h => `<option value="${h.name}">${h.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Room No (Private)</label>
              <input type="text" name="roomNumber" placeholder="e.g. D-412" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Password (min 8 characters) *</label>
            <input type="password" name="password" required minlength="8" placeholder="••••••••" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
          </div>

          <button type="submit" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition">
            Send Email Verification Code
          </button>
        </form>

        <div class="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
          Already verified? <button onclick="window.app.openLoginModal()" class="text-emerald-600 font-bold hover:underline">Sign In</button>
        </div>
      </div>
    `);
  }

  function renderOtpVerifyModal(email, demoOtp = null) {
    openModal(`
      <div class="space-y-5 text-center">
        <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
          <i data-lucide="mail-check" class="w-6 h-6"></i>
        </div>
        <h2 class="text-2xl font-bold text-slate-900">Verify Your Institutional Email</h2>
        <p class="text-xs text-slate-600">Enter the 6-digit verification code sent to <strong class="text-slate-900">${email}</strong></p>

        ${demoOtp ? `
          <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            <strong>Test Mode OTP:</strong> <span class="font-mono font-bold text-sm tracking-widest text-emerald-700 ml-1">${demoOtp}</span>
          </div>
        ` : ''}

        <form onsubmit="window.app.handleOtpVerify(event, '${email}')" class="space-y-4">
          <input type="text" id="otp-input-field" maxlength="6" value="${demoOtp || ''}" required placeholder="123456" class="w-48 mx-auto text-center font-mono text-2xl tracking-widest px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <button type="submit" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition">Verify & Login</button>
        </form>
      </div>
    `);
  }

  // --------------------------------------------------------------------------
  // EVENT HANDLERS & API WRAPPERS
  // --------------------------------------------------------------------------
  window.app = {
    navigate,
    openModal,
    closeModal,
    openLoginModal: renderLoginModal,
    openRegisterModal: renderRegisterModal,
    clearSession,

    onUserSelectChange: (selectEl) => {
      const emailInput = document.getElementById('login-email-input');
      const pwdInput = document.getElementById('login-password-input');
      if (!emailInput) return;

      if (selectEl.value === 'custom') {
        emailInput.value = '';
        emailInput.placeholder = 'your.reg@vitstudent.ac.in';
        emailInput.focus();
      } else {
        emailInput.value = selectEl.value;
        if (pwdInput && !pwdInput.value) {
          pwdInput.value = 'campus123';
        }
      }
    },

    fillAdminLogin: () => {
      openModal(`
        <div class="space-y-4 text-center">
          <h2 class="text-xl font-bold text-slate-900">Admin Login Portal</h2>
          <p class="text-xs text-slate-500">Demo administrator credentials preloaded:</p>
          <form onsubmit="window.app.handleLogin(event)" class="space-y-3">
            <input type="email" name="email" value="admin.peernest@vitstudent.ac.in" class="w-full px-3 py-2 rounded-xl border text-xs">
            <input type="password" name="password" value="campus123" class="w-full px-3 py-2 rounded-xl border text-xs">
            <button type="submit" class="w-full py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl">Login as Campus Admin</button>
          </form>
        </div>
      `);
    },

    handleLogin: async (e) => {
      e.preventDefault();
      const form = e.target;
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerText : 'Sign In';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Signing in...';
      }
      try {
        const email = (form.email ? form.email.value : '').trim();
        const password = form.password ? form.password.value : '';
        const res = await api('/api/auth/login', 'POST', { email, password });

        setSession(res.token, res.user, res.profile);
        closeModal();
        const studentName = res.profile ? (res.profile.full_name || res.profile.fullName || 'Student') : 'Student';
        showToast(`🎉 Welcome to PeerNest, ${studentName}!`, 'success');
        navigate('activities');
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = originalText;
        }
        showToast(err.message || 'Login failed. Please check credentials.', 'error');
      }
    },

    handleRegister: async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        const res = await api('/api/auth/register', 'POST', {
          fullName: form.fullName.value,
          registrationNumber: form.registrationNumber.value,
          phoneNumber: form.phoneNumber.value,
          email: form.email.value,
          hostelBlock: form.hostelBlock.value,
          roomNumber: form.roomNumber.value,
          password: form.password.value
        });
        showToast('Verification code sent!', 'success');
        renderOtpVerifyModal(res.email, res.demoVerificationOtp);
      } catch (err) {}
    },

    handleOtpVerify: async (e, email) => {
      e.preventDefault();
      const otp = document.getElementById('otp-input-field').value;
      try {
        const res = await api('/api/auth/verify-email', 'POST', { email, otp });
        setSession(res.token, res.user, res.profile);
        closeModal();
        showToast('Institutional email verified! Welcome to PeerNest VIT.', 'success');
        navigate('activities');
      } catch (err) {}
    },

    handleParcelSubmit: async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        const res = await api('/api/parcels/request', 'POST', {
          parcelReference: form.parcelReference.value,
          collectionCentreId: form.collectionCentreId.value,
          destinationHostelId: form.destinationHostelId.value,
          designatedLocation: form.designatedLocation.value,
          declaredValue: form.declaredValue.value,
          preferredPickupTime: form.preferredPickupTime.value,
          instructions: form.instructions.value
        });
        showToast(`Parcel request #${res.parcelCode} created!`, 'success');
        navigate('requester_dash');
      } catch (err) {}
    },

    updateFareQuote: async () => {
      const centreEl = document.getElementById('sel-parcel-centre');
      const hostelEl = document.getElementById('sel-parcel-hostel');
      if (!centreEl || !hostelEl) return;

      try {
        const res = await api('/api/gps/estimate', 'POST', {
          collectionCentreId: centreEl.value,
          destinationHostelId: hostelEl.value
        });

        document.getElementById('fare-total').innerText = `₹${res.totalFee}`;
        document.getElementById('fare-base').innerText = `₹${res.baseFee.toFixed(2)}`;
        document.getElementById('fare-km').innerText = `${res.distanceKm} km`;
        document.getElementById('fare-km-charge').innerText = `₹${res.kmFee.toFixed(2)}`;
        document.getElementById('fare-partner-earn').innerText = `₹${res.partnerEarnings}`;
        document.getElementById('fare-commission').innerText = `₹${res.platformCommission}`;
      } catch (e) {}
    },

    acceptParcel: async (parcelId) => {
      try {
        const res = await api(`/api/parcels/${parcelId}/accept`, 'POST', {});
        showToast('Parcel delivery accepted! Transaction chat unlocked.', 'success');
        navigate('partner_dash');
      } catch (e) {}
    },

    confirmCollection: async (parcelId) => {
      openModal(`
        <div class="space-y-4">
          <h2 class="text-xl font-bold text-slate-900">Confirm Parcel Collection</h2>
          <p class="text-xs text-slate-500">Confirm that you verified parcel details with the official Campus Parcel Centre staff and have the package in custody.</p>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Collection Photo URL (Optional)</label>
              <input type="url" id="collect-photo-url" placeholder="https://..." class="w-full px-3 py-2 rounded-xl border text-xs">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Package Condition Notes</label>
              <input type="text" id="collect-notes" value="Verified in good condition at campus desk." class="w-full px-3 py-2 rounded-xl border text-xs">
            </div>
            <button onclick="window.app.submitCollection('${parcelId}')" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl">Confirm & Generate Delivery OTP</button>
          </div>
        </div>
      `);
    },

    submitCollection: async (parcelId) => {
      const photoUrl = document.getElementById('collect-photo-url').value;
      const notes = document.getElementById('collect-notes').value;
      try {
        const res = await api(`/api/parcels/${parcelId}/collect`, 'POST', { collectionPhotoUrl: photoUrl, conditionNotes: notes });
        closeModal();
        showToast('Collection confirmed! Recipient has been sent the delivery OTP.', 'success');
        navigate('partner_dash');
      } catch (e) {}
    },

    openOtpModal: (parcelId) => {
      openModal(`
        <div class="space-y-4 text-center">
          <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
            <i data-lucide="key" class="w-6 h-6"></i>
          </div>
          <h2 class="text-xl font-bold text-slate-900">Enter Recipient Delivery OTP</h2>
          <p class="text-xs text-slate-500">Ask the student recipient for their 6-digit delivery OTP to complete handover.</p>
          <input type="text" id="delivery-otp-input" maxlength="6" placeholder="123456" class="w-48 mx-auto text-center font-mono text-2xl tracking-widest px-4 py-2.5 rounded-xl border">
          <button onclick="window.app.submitDeliveryOtp('${parcelId}')" class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl">Verify & Complete Delivery</button>
        </div>
      `);
    },

    submitDeliveryOtp: async (parcelId) => {
      const otp = document.getElementById('delivery-otp-input').value;
      try {
        const res = await api(`/api/parcels/${parcelId}/verify-delivery`, 'POST', { otp });
        closeModal();
        showToast(`Delivery verified! ₹${res.earnings} credited to your balance.`, 'success');
        navigate('partner_dash');
      } catch (e) {}
    },

    handleListingSubmit: async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        const res = await api('/api/rentals/listings', 'POST', {
          title: form.title.value,
          categoryId: form.categoryId.value,
          condition: form.condition.value,
          dailyPrice: form.dailyPrice.value,
          securityDeposit: form.securityDeposit.value,
          declaredValue: form.declaredValue.value,
          description: form.description.value,
          handoverLocation: form.handoverLocation.value,
          photos: form.photoUrl.value ? [form.photoUrl.value] : []
        });
        showToast('Item listed on campus marketplace!', 'success');
        navigate('lender_dash');
      } catch (e) {}
    },

    openListingDetails: async (listingId) => {
      try {
        const res = await api(`/api/rentals/listings/${listingId}`);
        const item = res.listing;

        openModal(`
          <div class="space-y-4">
            <div class="h-48 rounded-2xl overflow-hidden bg-slate-100">
              <img src="${item.photos[0] || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600'}" class="w-full h-full object-cover">
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400">${item.category_name}</span>
              <h2 class="text-xl font-bold text-slate-900">${item.title}</h2>
              <p class="text-xs text-slate-600 mt-2 leading-relaxed">${item.description}</p>
            </div>

            <!-- Distinct 3 Values -->
            <div class="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl text-center text-xs">
              <div>
                <span class="text-slate-400 block text-[10px]">Daily Rent</span>
                <strong class="text-emerald-700 text-sm">₹${item.daily_price}</strong>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">Security Deposit</span>
                <strong class="text-slate-800 text-sm">₹${item.security_deposit}</strong>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">Declared Value</span>
                <strong class="text-slate-800 text-sm">₹${item.declared_value}</strong>
              </div>
            </div>

            <!-- Booking Date Selector -->
            <div class="p-4 rounded-2xl border border-slate-200 space-y-3">
              <span class="text-xs font-bold text-slate-800 block">Select Rental Duration:</span>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] text-slate-500 mb-1">Start Date</label>
                  <input type="date" id="book-start-date" value="${new Date().toISOString().split('T')[0]}" class="w-full px-2.5 py-1.5 border rounded-lg text-xs">
                </div>
                <div>
                  <label class="block text-[10px] text-slate-500 mb-1">End Date</label>
                  <input type="date" id="book-end-date" value="${new Date(Date.now() + 3*86400000).toISOString().split('T')[0]}" class="w-full px-2.5 py-1.5 border rounded-lg text-xs">
                </div>
              </div>
            </div>

            <button onclick="window.app.submitBookingRequest('${item.id}')" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition">
              Request to Rent Item
            </button>
          </div>
        `);
      } catch (e) {}
    },

    submitBookingRequest: async (listingId) => {
      const startDate = document.getElementById('book-start-date').value;
      const endDate = document.getElementById('book-end-date').value;
      try {
        const res = await api('/api/rentals/book', 'POST', { listingId, startDate, endDate });
        closeModal();
        showToast('Booking request sent to owner! Unlocks chat upon approval.', 'success');
        navigate('borrower_dash');
      } catch (e) {}
    },

    respondBooking: async (bookingId, action) => {
      try {
        const res = await api(`/api/rentals/bookings/${bookingId}/respond`, 'POST', { action });
        showToast(`Booking ${action}ed!`, 'success');
        navigate('lender_dash');
      } catch (e) {}
    },

    payForRental: async (bookingId) => {
      openModal(`
        <div class="space-y-4 text-center">
          <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
            <i data-lucide="shield-check" class="w-6 h-6"></i>
          </div>
          <h2 class="text-xl font-bold text-slate-900">Razorpay Secure Checkout</h2>
          <p class="text-xs text-slate-500">Pay rental charge and refundable security deposit via UPI or Cards.</p>
          <div class="p-4 bg-slate-50 rounded-2xl text-left text-xs space-y-2">
            <div class="flex justify-between font-bold text-slate-800">
              <span>Payment Gateway:</span>
              <span>Razorpay India (Test/Live)</span>
            </div>
            <div class="flex justify-between">
              <span>Security Deposit (Refundable):</span>
              <span>Fully protected in campus escrow</span>
            </div>
          </div>
          <button onclick="window.app.executePayment('${bookingId}')" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
            Simulate UPI Authorization & Pay
          </button>
        </div>
      `);
    },

    executePayment: async (bookingId) => {
      try {
        const res = await api(`/api/rentals/bookings/${bookingId}/pay`, 'POST', { paymentMethod: 'upi_gpay' });
        closeModal();
        showToast('Payment verified successfully! Rental is now active.', 'success');
        navigate('borrower_dash');
      } catch (e) {}
    },

    openReturnInspectionModal: (bookingId) => {
      openModal(`
        <div class="space-y-4">
          <h2 class="text-xl font-bold text-slate-900">Return Inspection & Deposit Release</h2>
          <p class="text-xs text-slate-500">Check the returned item against pre-handover condition.</p>
          <div class="space-y-3">
            <label class="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" id="defect-check" onchange="document.getElementById('damage-box').classList.toggle('hidden')">
              Damage or missing parts detected
            </label>
            <div id="damage-box" class="hidden space-y-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <input type="text" id="damage-desc" placeholder="Describe damage (e.g. cracked display)" class="w-full px-2.5 py-1.5 border rounded-lg text-xs">
              <input type="number" id="repair-est" placeholder="Repair estimate (₹)" class="w-full px-2.5 py-1.5 border rounded-lg text-xs">
            </div>
            <button onclick="window.app.submitReturnInspection('${bookingId}')" class="w-full py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl">Confirm Inspection & Settle Deposit</button>
          </div>
        </div>
      `);
    },

    submitReturnInspection: async (bookingId) => {
      const defectsFound = document.getElementById('defect-check').checked;
      const damageDescription = defectsFound ? document.getElementById('damage-desc').value : null;
      const repairEstimate = defectsFound ? document.getElementById('repair-est').value : 0;

      try {
        const res = await api(`/api/rentals/bookings/${bookingId}/return`, 'POST', {
          defectsFound,
          damageDescription,
          repairEstimate
        });
        closeModal();
        showToast('Return inspection completed!', 'success');
        navigate('lender_dash');
      } catch (e) {}
    },

    handleSendMessage: async (e, convId) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const content = input.value;
      if (!content.trim()) return;

      try {
        await api(`/api/chat/conversations/${convId}/messages`, 'POST', { content });
        input.value = '';
        loadConversationMessages(convId);
      } catch (e) {}
    },

    markNotifRead: async (notifId, actionUrl) => {
      try {
        await api(`/api/notifications/${notifId}/read`, 'PUT');
        updateUnreadBadges();
        if (actionUrl) {
          navigate(actionUrl.replace('/', ''));
        }
      } catch (e) {}
    },

    markAllNotifsRead: async () => {
      try {
        await api('/api/notifications/read-all', 'PUT');
        updateUnreadBadges();
        renderNotificationsView(document.getElementById('app-content'));
      } catch (e) {}
    },

    switchAdminTab,
    toggleSuspendUser: async (userId) => {
      try {
        const res = await api(`/api/admin/users/${userId}/toggle-suspend`, 'PUT');
        showToast(res.message, 'info');
        switchAdminTab('users');
      } catch (e) {}
    },

    resolveParcelDispute: async (disputeId, resolution, compAmount = 0) => {
      try {
        const res = await api(`/api/admin/disputes/parcel/${disputeId}/resolve`, 'POST', {
          resolution,
          compensationAmount: compAmount,
          resolutionNotes: 'Dispute closed by administrator'
        });
        showToast('Dispute resolved!', 'success');
        switchAdminTab('disputes');
      } catch (e) {}
    },

    handleSaveSettings: async (e) => {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);
      const settings = [];
      for (const [key, value] of formData.entries()) {
        settings.push({ key, value });
      }
      try {
        await api('/api/admin/settings', 'PUT', { settings });
        showToast('Platform settings saved successfully!', 'success');
      } catch (e) {}
    },

    filterCategory: (catSlug) => {
      navigate('marketplace', { category: catSlug });
    },

    applyMarketSearch: () => {
      const search = document.getElementById('mkt-search').value;
      const sort = document.getElementById('mkt-sort').value;
      navigate('marketplace', { search, sort });
    },

    loadChatConversation,

    switchActivityTab: (tab, filter = 'all') => {
      const expView = document.getElementById('activity-explore-view');
      const myView = document.getElementById('activity-my-view');
      const btnExp = document.getElementById('tab-btn-explore');
      const btnMy = document.getElementById('tab-btn-my');

      if (tab === 'my') {
        if (expView) expView.classList.add('hidden');
        if (myView) myView.classList.remove('hidden');
        if (btnExp) btnExp.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 text-slate-600 hover:text-slate-900';
        if (btnMy) btnMy.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-white text-emerald-700 shadow-sm';
        loadAndRenderMyActivities(filter);
      } else {
        if (expView) expView.classList.remove('hidden');
        if (myView) myView.classList.add('hidden');
        if (btnExp) btnExp.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 bg-white text-emerald-700 shadow-sm';
        if (btnMy) btnMy.className = 'px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 text-slate-600 hover:text-slate-900';
      }
      if (window.lucide) window.lucide.createIcons();
    },

    filterMyActivities: (filter) => {
      const input = document.getElementById('activity-search-code-input');
      const q = input ? input.value : '';
      renderFilteredActivitiesList(filter, q);
    },

    handleActivitySearchKey: (e) => {
      const q = e.target.value;
      if (e.key === 'Enter') {
        window.app.searchOrTrackActivity();
      } else {
        renderFilteredActivitiesList(currentActivityFilter, q);
      }
    },

    searchOrTrackActivity: async () => {
      const input = document.getElementById('activity-search-code-input');
      const codeVal = input ? input.value.trim() : '';
      if (!codeVal) {
        showToast('Please enter a tracking code or keyword to search.', 'warning');
        return;
      }
      // If looks like a specific code, track it
      if (codeVal.toUpperCase().startsWith('PN-PAR-') || codeVal.toUpperCase().startsWith('RNTL-') || codeVal.toUpperCase().startsWith('LEND-') || codeVal.toUpperCase().startsWith('BORW-') || codeVal.startsWith('par-') || codeVal.startsWith('bk-')) {
        await window.app.trackByCode(codeVal);
      } else {
        renderFilteredActivitiesList('all', codeVal);
      }
    },

    copyToClipboard: (text) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('Tracking code copied: ' + text, 'success');
    },

    trackByCode: async (code) => {
      try {
        const res = await api('/api/activities/track/' + encodeURIComponent(code));
        if (!res || !res.found) {
          showToast('No record found for tracking code ' + code, 'error');
          return;
        }

        const stages = res.type === 'parcel' 
          ? [
              { key: 'submitted', label: '1. Submitted' },
              { key: 'accepted', label: '2. Accepted' },
              { key: 'collected', label: '3. Collected' },
              { key: 'out_for_delivery', label: '4. In Transit' },
              { key: 'delivered', label: '5. Delivered' },
              { key: 'completed', label: '6. Completed' }
            ]
          : [
              { key: 'pending', label: '1. Requested' },
              { key: 'accepted', label: '2. Accepted' },
              { key: 'active', label: '3. Handed Over' },
              { key: 'completed', label: '4. Returned' }
            ];

        const currentStageIndex = stages.findIndex(s => s.key === res.status);

        const modalHtml = `
          <div class="space-y-6">
            <!-- Header -->
            <div class="border-b border-slate-200 pb-4">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Live Campus Tracking Hub
                </span>
                <span class="font-mono font-extrabold text-xs bg-slate-900 text-emerald-400 px-3 py-1 rounded-lg">
                  ${res.trackingCode}
                </span>
              </div>
              <h2 class="text-xl font-extrabold text-slate-900 mt-3">${res.title}</h2>
              ${res.reference ? `<p class="text-xs text-slate-500 font-mono mt-0.5">Courier Ref: ${res.reference}</p>` : ''}
            </div>

            <!-- Visual Progress Tracker -->
            <div>
              <span class="text-xs font-bold text-slate-600 uppercase tracking-wider">Delivery / Rental Stage</span>
              <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                ${stages.map((st, idx) => {
                  const isDone = currentStageIndex >= idx;
                  const isCurrent = currentStageIndex === idx;
                  return `
                    <div class="text-center p-2 rounded-xl border text-xs ${isCurrent ? 'bg-emerald-600 text-white font-bold border-emerald-600 shadow-sm' : isDone ? 'bg-emerald-50 text-emerald-800 font-semibold border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}">
                      <div class="w-5 h-5 rounded-full mx-auto mb-1 flex items-center justify-center text-[10px] font-bold ${isCurrent ? 'bg-white text-emerald-700' : isDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}">
                        ${isDone ? '✓' : idx + 1}
                      </div>
                      <span class="text-[10px] block leading-tight">${st.label.split('. ')[1]}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- OTP Highlight if requester -->
            ${res.otp ? `
              <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs font-bold uppercase tracking-wider text-emerald-700">Delivery Security OTP</span>
                    <p class="text-xs text-emerald-700 mt-0.5">Show this 6-digit code to your delivery partner upon parcel arrival:</p>
                  </div>
                  <span class="font-mono font-extrabold text-2xl bg-white px-3 py-1 rounded-xl border border-emerald-300 text-emerald-900 tracking-widest shadow-sm">${res.otp}</span>
                </div>
              </div>
            ` : ''}

            <!-- Details Card -->
            <div class="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <span class="text-slate-400 block font-semibold">Requester / Borrower:</span>
                <span class="font-bold text-slate-800 text-sm">${res.requesterName || res.borrowerName || 'Verified Student'}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-semibold">Partner / Owner:</span>
                <span class="font-bold text-slate-800 text-sm">${res.partnerName || res.ownerName || 'Verified Student'}</span>
              </div>
              ${res.deliveryFee ? `
                <div>
                  <span class="text-slate-400 block font-semibold">Delivery Fee:</span>
                  <span class="font-bold text-slate-800 text-sm">₹${res.deliveryFee}</span>
                </div>
              ` : ''}
              ${res.totalPayable ? `
                <div>
                  <span class="text-slate-400 block font-semibold">Total Payable:</span>
                  <span class="font-bold text-slate-800 text-sm">₹${res.totalPayable} (Deposit: ₹${res.securityDeposit})</span>
                </div>
              ` : ''}
              <div>
                <span class="text-slate-400 block font-semibold">Current Status:</span>
                <span class="font-bold text-emerald-700 uppercase">${(res.status || '').replace(/_/g, ' ')}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-semibold">Last Updated:</span>
                <span class="font-medium text-slate-700">${new Date(res.updatedAt || res.createdAt).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <!-- Audit History Timeline -->
            ${res.history && res.history.length > 0 ? `
              <div>
                <span class="text-xs font-bold text-slate-600 uppercase tracking-wider">Status History Log</span>
                <div class="mt-2 space-y-2 max-h-40 overflow-y-auto pr-1 text-xs">
                  ${res.history.map(h => `
                    <div class="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span class="font-bold text-slate-800 uppercase">${h.status.replace(/_/g, ' ')}</span>
                      </div>
                      <span class="text-slate-400 font-mono text-[11px]">${new Date(h.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Bottom Actions -->
            <div class="flex items-center justify-between pt-4 border-t border-slate-200">
              <button onclick="window.app.copyToClipboard('${res.trackingCode}')" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center gap-1.5">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy Code
              </button>
              <button onclick="window.app.closeModal()" class="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition">
                Close
              </button>
            </div>
          </div>
        `;

        openModal(modalHtml);
      } catch (e) {
        showToast('Error tracking request: ' + (e.message || e), 'error');
      }
    }
  };

  function getStatusBadge(status) {
    const badges = {
      submitted: 'bg-slate-100 text-slate-700',
      waiting_for_partner: 'bg-blue-100 text-blue-700',
      accepted: 'bg-amber-100 text-amber-700',
      collected: 'bg-purple-100 text-purple-700',
      out_for_delivery: 'bg-indigo-100 text-indigo-700',
      delivered: 'bg-emerald-100 text-emerald-700',
      completed: 'bg-emerald-100 text-emerald-800',
      active: 'bg-emerald-100 text-emerald-700',
      pending: 'bg-amber-100 text-amber-700',
      rejected: 'bg-rose-100 text-rose-700',
      disputed: 'bg-rose-100 text-rose-800',
      under_investigation: 'bg-rose-100 text-rose-800'
    };
    return badges[status] || 'bg-slate-100 text-slate-700';
  }

  // App Initialization
  async function init() {
    await loadInitialData();
    if (state.token) {
      try {
        const me = await api('/api/auth/me');
        if (me && me.profile) {
          state.profile = me.profile;
          localStorage.setItem('pn_profile', JSON.stringify(me.profile));
        }
        initSSE();
        updateUnreadBadges();
        navigate('activities');
      } catch (e) {
        // Stale or invalid session
        clearSession();
      }
    } else {
      navigate('landing');
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
