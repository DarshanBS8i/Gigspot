// GigSpot - Main Application JS
const API = '';
let token = localStorage.getItem('gs_token');
let currentUser = null;
let currentProfile = null;
let mainMap = null;
let heroMap = null;
let postJobMap = null;
let categories = [];

// ========== API HELPERS ==========
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            handleLogout();
            throw new Error('Session expired. Please log in again.');
        }
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

function toast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

// ========== PAGE NAVIGATION ==========
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    if (page === 'landing') initHeroMap();
    if (page === 'dashboard') initDashboard();
}

function showDashboardView(view) {
    document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`.nav-link[data-view="${view}"]`)?.classList.add('active');
    if (view === 'map') setTimeout(() => initMainMap(), 100);
    if (view === 'jobs') loadJobs();
    if (view === 'applications') loadApplications();
    if (view === 'notifications') loadNotifications();
    if (view === 'profile') renderProfile();
    if (view === 'overview') loadOverview();
}

// ========== AUTH ==========
function selectRole(role) {
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.role-btn[data-role="${role}"]`).classList.add('active');
    document.getElementById('register-role').value = role;
    document.getElementById('provider-fields').classList.toggle('hidden', role !== 'provider');
    document.getElementById('worker-fields').classList.toggle('hidden', role !== 'worker');
}

function startRegister(role) {
    showPage('register');
    selectRole(role);
}

async function handleLogin(e) {
    e.preventDefault();
    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: document.getElementById('login-email').value,
                password: document.getElementById('login-password').value
            })
        });
        token = data.token;
        localStorage.setItem('gs_token', token);
        currentUser = data.user;
        currentProfile = data.profile;
        toast('Welcome back, ' + currentUser.full_name + '!', 'success');
        showPage('dashboard');
    } catch (err) { toast(err.message, 'error'); }
}

async function handleRegister(e) {
    e.preventDefault();
    const role = document.getElementById('register-role').value;
    const body = {
        email: document.getElementById('register-email').value,
        password: document.getElementById('register-password').value,
        full_name: document.getElementById('register-name').value,
        phone: document.getElementById('register-phone').value,
        role
    };
    if (role === 'provider') body.company_name = document.getElementById('register-company').value;
    if (role === 'worker') body.skills = document.getElementById('register-skills').value.split(',').map(s => s.trim()).filter(Boolean);
    try {
        const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
        token = data.token;
        localStorage.setItem('gs_token', token);
        currentUser = data.user;
        toast(data.message || 'Account created!', 'success');
        showPage('dashboard');
    } catch (err) { toast(err.message, 'error'); }
}

function handleLogout() {
    token = null; currentUser = null; currentProfile = null;
    localStorage.removeItem('gs_token');
    showPage('landing');
    toast('Logged out', 'info');
}

function toggleUserDropdown(e) {
    e.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('show');
}
window.addEventListener('click', (e) => {
    const drop = document.getElementById('user-dropdown');
    if (drop && !e.target.closest('.nav-user')) {
        drop.classList.remove('show');
    }
});

// ========== DASHBOARD INIT ==========
async function initDashboard() {
    try {
        const data = await api('/api/auth/me');
        currentUser = data.user;
        currentProfile = data.profile;
    } catch { handleLogout(); return; }
    document.getElementById('user-avatar').textContent = currentUser.full_name[0].toUpperCase();
    document.getElementById('greeting').textContent = `Welcome, ${currentUser.full_name}!`;
    document.getElementById('role-subtitle').textContent = currentUser.role === 'provider' ? '📋 Provider Dashboard' : '🔍 Worker Dashboard';
    const bjp = document.getElementById('btn-post-job');
    bjp.style.display = currentUser.role === 'provider' ? 'inline-flex' : 'none';
    document.getElementById('nav-jobs-label').textContent = currentUser.role === 'provider' ? 'My Jobs' : 'Browse Jobs';
    document.getElementById('apps-title').textContent = currentUser.role === 'provider' ? 'Received Applications' : 'My Applications';
    
    const availCont = document.getElementById('availability-container');
    if (currentUser.role === 'worker') {
        availCont.style.display = 'flex';
        document.getElementById('worker-status-select').value = currentProfile.availability_status || 'available';
    } else {
        availCont.style.display = 'none';
    }
    
    await loadCategories();
    showDashboardView('overview');
    loadNotifBadge();
}

async function updateWorkerStatus(e) {
    const newStatus = e.target.value;
    try {
        await api('/api/workers/status', {
            method: 'PUT',
            body: JSON.stringify({ availability_status: newStatus })
        });
        toast('Status updated successfully', 'success');
        if (currentProfile) currentProfile.availability_status = newStatus;
    } catch (err) {
        toast('Failed to update status: ' + err.message, 'error');
        if (currentProfile) e.target.value = currentProfile.availability_status || 'available';
    }
}

async function loadCategories() {
    try {
        categories = await api('/api/categories');
        const selects = ['map-filter-category', 'job-filter-cat', 'pj-category'];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const val = sel.value;
            sel.innerHTML = '<option value="">All Categories</option>';
            categories.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.icon} ${c.name}`; sel.appendChild(o); });
            sel.value = val;
        });
    } catch (e) { console.error(e); }
}

async function loadOverview() {
    try {
        const stats = await api('/api/stats');
        document.getElementById('dash-stats').innerHTML = `
            <div class="stat-card"><div class="stat-icon">💼</div><div class="stat-value">${stats.open_jobs}</div><div class="stat-label">Open Jobs</div></div>
            <div class="stat-card"><div class="stat-icon">👷</div><div class="stat-value">${stats.available_workers}</div><div class="stat-label">Available Workers</div></div>
            <div class="stat-card"><div class="stat-icon">🏢</div><div class="stat-value">${stats.total_providers}</div><div class="stat-label">Providers</div></div>
            <div class="stat-card"><div class="stat-icon">📄</div><div class="stat-value">${stats.total_applications}</div><div class="stat-label">Applications</div></div>`;
    } catch (e) {}
    try {
        const jobs = await api('/api/jobs?limit=5');
        document.getElementById('recent-jobs-list').innerHTML = jobs.length ? jobs.map(j => `
            <div class="card" onclick="showJobDetail(${j.id})">
                <div class="card-title">${j.category_icon||''} ${j.title}</div>
                <div class="card-meta"><span>₹${j.pay_rate}/${j.pay_type}</span><span>📍 ${j.location_name||'N/A'}</span></div>
            </div>`).join('') : '<div class="empty-state"><div class="empty-icon">📋</div><p>No jobs yet</p></div>';
    } catch (e) {}
    try {
        const notifs = await api('/api/notifications');
        document.getElementById('recent-activity').innerHTML = notifs.notifications.slice(0, 5).map(n => `
            <div class="card" style="cursor:default"><div class="card-title">${n.title}</div><div class="card-meta"><span>${n.message}</span></div></div>`).join('') || '<div class="empty-state"><p>No activity</p></div>';
    } catch (e) {}
}

// ========== MAP ==========
function createIcon(emoji, color) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)">${emoji}</div>`,
        iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20]
    });
}

function initHeroMap() {
    if (heroMap) return;
    try {
        heroMap = L.map('hero-map', { zoomControl: false, attributionControl: false }).setView([12.9716, 77.5946], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(heroMap);
        // Add some sample markers
        const spots = [[12.9352,77.6245],[12.9784,77.6408],[12.9299,77.5838],[12.9116,77.6389],[12.9698,77.75],[12.99,77.55],[12.8456,77.6603],[12.9757,77.6061]];
        spots.forEach(s => L.marker(s, { icon: createIcon('💼', '#6C63FF') }).addTo(heroMap));
    } catch (e) {}
}

async function initMainMap() {
    if (!mainMap) {
        mainMap = L.map('main-map').setView([12.9716, 77.5946], 12);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }).addTo(mainMap);
    }
    setTimeout(() => mainMap.invalidateSize(), 200);
    refreshMap();
}

async function refreshMap() {
    if (!mainMap) return;
    mainMap.eachLayer(l => { if (l instanceof L.Marker) mainMap.removeLayer(l); });
    const catId = document.getElementById('map-filter-category').value;
    const showW = document.getElementById('map-show-workers').checked;
    const showJ = document.getElementById('map-show-jobs').checked;
    if (showJ) {
        try {
            const jobs = await api(`/api/jobs?limit=100${catId ? '&category_id=' + catId : ''}`);
            jobs.forEach(j => {
                const color = j.urgency === 'urgent' ? '#FF6B6B' : j.category_color || '#6C63FF';
                L.marker([j.latitude, j.longitude], { icon: createIcon(j.category_icon || '💼', color) })
                    .addTo(mainMap)
                    .bindPopup(`<div class="popup-title">${j.title}</div><div class="popup-pay">₹${j.pay_rate}<small>/${j.pay_type}</small></div><div class="popup-meta">📍 ${j.location_name || ''}<br>🏢 ${j.provider_name || ''}<br>👥 ${j.filled_slots}/${j.slots} slots filled</div><br><button class="btn btn-primary btn-sm" onclick="showJobDetail(${j.id})">View Details</button>`);
            });
        } catch (e) {}
    }
    if (showW) {
        try {
            const workers = await api('/api/workers');
            workers.forEach(w => {
                L.marker([w.latitude, w.longitude], { icon: createIcon('👷', '#00D4AA') })
                    .addTo(mainMap)
                    .bindPopup(`<div class="popup-title">${w.full_name}</div><div class="popup-meta">⭐ ${w.rating || 'New'} · ${w.total_jobs_completed} jobs done<br>💰 ₹${w.hourly_rate_min}-${w.hourly_rate_max}/hr<br>🛠️ ${(w.skills||[]).join(', ')}</div>`);
            });
        } catch (e) {}
    }
}

// ========== JOBS ==========
async function loadJobs() {
    const cat = document.getElementById('job-filter-cat').value;
    const search = document.getElementById('job-search').value;
    try {
        let url = currentUser?.role === 'provider' ? '/api/jobs/provider/mine' : `/api/jobs?limit=50${cat ? '&category_id=' + cat : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`;
        const jobs = await api(url);
        document.getElementById('jobs-list').innerHTML = jobs.length ? jobs.map(j => `
            <div class="job-card" onclick="showJobDetail(${j.id})">
                <span class="urgency-tag urgency-${j.urgency}">${j.urgency}</span>
                <div class="job-category">${j.category_icon || '💼'} ${j.category_name || 'General'}</div>
                <h3>${j.title}</h3>
                <div class="job-desc">${j.description || ''}</div>
                <div class="job-pay">₹${j.pay_rate} <small>/ ${j.pay_type}</small></div>
                <div class="job-info"><span>📍 ${j.location_name || 'N/A'}</span><span>👥 ${j.filled_slots||0}/${j.slots} slots</span>${j.application_count !== undefined ? `<span>📄 ${j.application_count} apps</span>` : ''}</div>
            </div>`).join('') : '<div class="empty-state"><div class="empty-icon">📋</div><p>No jobs found</p></div>';
    } catch (e) { toast(e.message, 'error'); }
}

let searchTimer;
function searchJobs() { clearTimeout(searchTimer); searchTimer = setTimeout(loadJobs, 400); }

async function showJobDetail(id) {
    try {
        const j = await api(`/api/jobs/${id}`);
        let actions = '';
        if (currentUser?.role === 'worker') {
            actions = `<div style="margin-top:16px"><button class="btn btn-primary" onclick="applyToJob(${j.id})">Apply Now</button> <button class="btn btn-secondary" onclick="saveJob(${j.id})">🔖 Save</button></div>`;
        } else if (currentUser?.role === 'provider' && j.provider_id === currentUser.id) {
            actions = `<div style="margin-top:16px"><button class="btn btn-primary" onclick="viewJobApps(${j.id})">View Applications</button></div>`;
        }
        document.getElementById('modal-body').innerHTML = `
            <div class="job-category">${j.category_icon||'💼'} ${j.category_name||'General'}</div>
            <h2 style="margin:8px 0 4px">${j.title}</h2>
            <span class="urgency-tag urgency-${j.urgency}" style="position:static;margin-bottom:16px;display:inline-block">${j.urgency}</span>
            <div class="job-pay" style="margin:12px 0">₹${j.pay_rate} <small>/ ${j.pay_type}</small></div>
            <p style="color:var(--text2);margin-bottom:16px">${j.description||'No description'}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px">
                <div>📍 <strong>Location:</strong> ${j.location_name||'N/A'}</div>
                <div>🏢 <strong>Provider:</strong> ${j.company_name||j.provider_name||'N/A'} ${j.provider_verified ? '✅' : ''}</div>
                <div>👥 <strong>Slots:</strong> ${j.filled_slots||0}/${j.slots}</div>
                <div>⏰ <strong>Time:</strong> ${j.start_time||'?'} - ${j.end_time||'?'}</div>
                <div>📅 <strong>From:</strong> ${j.start_date||'N/A'}</div>
                <div>📅 <strong>To:</strong> ${j.end_date||'N/A'}</div>
            </div>
            ${j.requirements ? `<div style="margin-top:16px"><strong>Requirements:</strong><p style="color:var(--text2)">${j.requirements}</p></div>` : ''}
            ${actions}`;
        document.getElementById('modal-overlay').classList.remove('hidden');
    } catch (e) { toast(e.message, 'error'); }
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

async function applyToJob(jobId) {
    try {
        await api('/api/applications', { method: 'POST', body: JSON.stringify({ job_id: jobId, message: 'I am interested in this opportunity.' }) });
        toast('Application submitted!', 'success');
        closeModal();
    } catch (e) { toast(e.message, 'error'); }
}

async function saveJob(jobId) {
    try { await api(`/api/jobs/${jobId}/save`, { method: 'POST' }); toast('Job saved!', 'success'); } catch (e) { toast(e.message, 'error'); }
}

// ========== POST JOB ==========
function showPostJobModal() {
    document.getElementById('post-job-overlay').classList.remove('hidden');
    setTimeout(() => {
        if (!postJobMap) {
            postJobMap = L.map('pj-map').setView([12.9716, 77.5946], 12);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(postJobMap);
            let marker;
            postJobMap.on('click', e => {
                if (marker) postJobMap.removeLayer(marker);
                marker = L.marker(e.latlng).addTo(postJobMap);
                document.getElementById('pj-lat').value = e.latlng.lat;
                document.getElementById('pj-lng').value = e.latlng.lng;
            });
        }
        postJobMap.invalidateSize();
    }, 200);
}

function closePostJobModal() { document.getElementById('post-job-overlay').classList.add('hidden'); }

async function handlePostJob(e) {
    e.preventDefault();
    const lat = document.getElementById('pj-lat').value;
    const lng = document.getElementById('pj-lng').value;
    if (!lat || !lng) { toast('Click the map to set location', 'error'); return; }
    try {
        await api('/api/jobs', {
            method: 'POST',
            body: JSON.stringify({
                title: document.getElementById('pj-title').value,
                description: document.getElementById('pj-description').value,
                category_id: document.getElementById('pj-category').value || null,
                pay_rate: parseFloat(document.getElementById('pj-pay').value),
                pay_type: document.getElementById('pj-paytype').value,
                location_name: document.getElementById('pj-location').value,
                latitude: parseFloat(lat), longitude: parseFloat(lng),
                start_time: document.getElementById('pj-start-time').value || null,
                end_time: document.getElementById('pj-end-time').value || null,
                slots: parseInt(document.getElementById('pj-slots').value) || 1,
                urgency: document.getElementById('pj-urgency').value,
                requirements: document.getElementById('pj-requirements').value
            })
        });
        toast('Job posted!', 'success');
        closePostJobModal();
        document.getElementById('post-job-form').reset();
        loadJobs();
    } catch (e) { toast(e.message, 'error'); }
}

// ========== APPLICATIONS ==========
async function loadApplications() {
    try {
        if (currentUser.role === 'worker') {
            const apps = await api('/api/applications/my');
            document.getElementById('applications-list').innerHTML = apps.length ? apps.map(a => `
                <div class="card">
                    <div class="card-title">${a.category_icon||'💼'} ${a.job_title}</div>
                    <div class="card-meta"><span>₹${a.pay_rate}/${a.pay_type}</span><span>📍 ${a.location_name||''}</span><span>🏢 ${a.provider_name||''}</span></div>
                    <div style="margin-top:8px"><span class="status-badge status-${a.status}">${a.status.toUpperCase()}</span></div>
                </div>`).join('') : '<div class="empty-state"><div class="empty-icon">📄</div><p>No applications yet</p></div>';
        } else {
            const jobs = await api('/api/jobs/provider/mine');
            let html = '';
            for (const j of jobs) {
                try {
                    const apps = await api(`/api/applications/job/${j.id}`);
                    if (apps.length) {
                        html += `<h3 style="margin:16px 0 8px">${j.title} (${apps.length} applications)</h3>`;
                        html += apps.map(a => `
                            <div class="card">
                                <div class="card-title">👷 ${a.worker_name}</div>
                                <div class="card-meta"><span>⭐ ${a.worker_rating||'New'}</span><span>🛠️ ${(a.skills||[]).join(', ')}</span><span>${a.experience_years||0} yrs exp</span></div>
                                <div style="margin-top:8px"><span class="status-badge status-${a.status}">${a.status.toUpperCase()}</span></div>
                                ${a.status === 'pending' ? `<div class="card-actions"><button class="btn btn-success btn-sm" onclick="updateAppStatus(${a.id},'accepted')">✓ Accept</button><button class="btn btn-danger btn-sm" onclick="updateAppStatus(${a.id},'rejected')">✕ Reject</button></div>` : ''}
                            </div>`).join('');
                    }
                } catch (e) {}
            }
            document.getElementById('applications-list').innerHTML = html || '<div class="empty-state"><div class="empty-icon">📄</div><p>No applications received</p></div>';
        }
    } catch (e) { toast(e.message, 'error'); }
}

async function viewJobApps(jobId) {
    closeModal();
    showDashboardView('applications');
}

async function updateAppStatus(appId, status) {
    try {
        await api(`/api/applications/${appId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
        toast(`Application ${status}`, 'success');
        loadApplications();
    } catch (e) { toast(e.message, 'error'); }
}

// ========== NOTIFICATIONS ==========
async function loadNotifBadge() {
    try {
        const data = await api('/api/notifications');
        const badge = document.getElementById('notif-badge');
        if (data.unread_count > 0) { badge.textContent = data.unread_count; badge.classList.remove('hidden'); }
        else badge.classList.add('hidden');
    } catch (e) {}
}

async function loadNotifications() {
    try {
        const data = await api('/api/notifications');
        document.getElementById('notifications-list').innerHTML = data.notifications.length ? data.notifications.map(n => `
            <div class="card" style="opacity:${n.read ? '0.6' : '1'};cursor:default">
                <div class="card-title">${n.title}</div>
                <div class="card-meta"><span>${n.message}</span><span>${new Date(n.created_at).toLocaleDateString()}</span></div>
            </div>`).join('') : '<div class="empty-state"><div class="empty-icon">🔔</div><p>No notifications</p></div>';
    } catch (e) {}
}

async function markAllRead() {
    try { await api('/api/notifications/read-all', { method: 'PUT' }); loadNotifications(); loadNotifBadge(); toast('All marked read', 'success'); } catch (e) {}
}

// ========== PROFILE ==========
function renderProfile() {
    const u = currentUser, p = currentProfile;
    if (!u) return;
    let profileHtml = `
        <div class="profile-field"><label>Name</label><div class="value">${u.full_name}</div></div>
        <div class="profile-field"><label>Email</label><div class="value">${u.email}</div></div>
        <div class="profile-field"><label>Phone</label><div class="value">${u.phone || 'Not set'}</div></div>
        <div class="profile-field"><label>Role</label><div class="value">${u.role === 'provider' ? '📋 Provider' : '🔍 Worker'}</div></div>
        <div class="profile-field"><label>Member since</label><div class="value">${new Date(u.created_at).toLocaleDateString()}</div></div>`;
    if (p && u.role === 'provider') {
        profileHtml += `<div class="profile-field"><label>Company</label><div class="value">${p.company_name || 'N/A'}</div></div>
            <div class="profile-field"><label>Rating</label><div class="value">⭐ ${p.rating || 'No reviews'} (${p.total_reviews} reviews)</div></div>
            <div class="profile-field"><label>Jobs Posted</label><div class="value">${p.total_jobs_posted}</div></div>`;
    } else if (p && u.role === 'worker') {
        profileHtml += `<div class="profile-field"><label>Skills</label><div class="value">${(p.skills||[]).map(s => `<span class="skill-tag">${s}</span>`).join('') || 'None'}</div></div>
            <div class="profile-field"><label>Status</label><div class="value"><span class="status-dot status-${p.availability_status}"></span>${p.availability_status}</div></div>
            <div class="profile-field"><label>Hourly Rate</label><div class="value">₹${p.hourly_rate_min||0} - ₹${p.hourly_rate_max||0}</div></div>
            <div class="profile-field"><label>Rating</label><div class="value">⭐ ${p.rating || 'No reviews'} (${p.total_reviews} reviews)</div></div>
            <div class="profile-field"><label>Jobs Completed</label><div class="value">${p.total_jobs_completed}</div></div>`;
    }
    document.getElementById('profile-content').innerHTML = profileHtml;
}

// ========== LANDING STATS ==========
async function loadLandingStats() {
    try {
        const s = await api('/api/stats');
        document.getElementById('stat-jobs').textContent = s.open_jobs;
        document.getElementById('stat-workers').textContent = s.available_workers;
        document.getElementById('stat-providers').textContent = s.total_providers;
    } catch (e) {}
}

// ========== ADVANCED AUTH ==========
function showForgotPasswordModal() { document.getElementById('forgot-password-overlay').classList.remove('hidden'); }
function closeForgotPasswordModal() { document.getElementById('forgot-password-overlay').classList.add('hidden'); }
async function handleForgotPassword(e) {
    e.preventDefault();
    try {
        const res = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: document.getElementById('fp-email').value }) });
        toast(res.message, 'success');
        closeForgotPasswordModal();
    } catch (err) { toast(err.message, 'error'); }
}

function showResetPasswordModal(token) {
    document.getElementById('reset-password-overlay').classList.remove('hidden');
    document.getElementById('rp-token').value = token;
}
function closeResetPasswordModal() { document.getElementById('reset-password-overlay').classList.add('hidden'); }
async function handleResetPassword(e) {
    e.preventDefault();
    try {
        const res = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: document.getElementById('rp-token').value, newPassword: document.getElementById('rp-password').value }) });
        toast(res.message, 'success');
        closeResetPasswordModal();
        showPage('login');
    } catch (err) { toast(err.message, 'error'); }
}

async function handleEmailVerification(token) {
    try {
        const res = await api('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
        toast(res.message, 'success');
    } catch (err) { toast(err.message, 'error'); }
}

// ========== OTP AUTH ==========
function showOtpLoginModal() {
    document.getElementById('otp-login-overlay').classList.remove('hidden');
    showOtpStep1();
}
function closeOtpLoginModal() { document.getElementById('otp-login-overlay').classList.add('hidden'); }
function showOtpStep1() {
    document.getElementById('otp-step-1').classList.remove('hidden');
    document.getElementById('otp-step-2').classList.add('hidden');
}
function showOtpStep2() {
    document.getElementById('otp-step-1').classList.add('hidden');
    document.getElementById('otp-step-2').classList.remove('hidden');
}
async function handleSendOtp(e) {
    e.preventDefault();
    const email = document.getElementById('otp-email').value;
    const name = document.getElementById('otp-name').value;
    const role = document.getElementById('register-role')?.value || 'worker';
    try {
        const res = await api('/api/auth/send-otp', {
            method: 'POST',
            body: JSON.stringify({ email, full_name: name, role })
        });
        toast(res.message, 'success');
        showOtpStep2();
    } catch (err) { toast(err.message, 'error'); }
}
async function handleVerifyOtp(e) {
    e.preventDefault();
    try {
        const data = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: JSON.stringify({
                email: document.getElementById('otp-email').value,
                otp: document.getElementById('otp-code').value
            })
        });
        token = data.token;
        localStorage.setItem('gs_token', token);
        currentUser = data.user;
        currentProfile = data.profile;
        toast('Logged in successfully!', 'success');
        closeOtpLoginModal();
        showPage('dashboard');
    } catch (err) { toast(err.message, 'error'); }
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('verify')) {
        handleEmailVerification(urlParams.get('verify'));
        window.history.replaceState({}, document.title, "/");
    } else if (urlParams.has('reset')) {
        showResetPasswordModal(urlParams.get('reset'));
        window.history.replaceState({}, document.title, "/");
    }

    if (token) {
        showPage('dashboard');
    } else {
        showPage('landing');
        loadLandingStats();
    }
});
