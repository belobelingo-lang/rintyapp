const SUPABASE_URL = 'https://xkfbddsocidbballtkko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZmJkZHNvY2lkYmJhbGx0a2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDM4MzksImV4cCI6MjA5MjExOTgzOX0.-evlscIW2bNysQpavMK4LoYPYOFguszZCN5LQoy6Tvs';
const clienteSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentItems = [];
let categoriasData = [];
let carrito = [];
let chartCatInstance = null;
let chartMetodoInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    document.getElementById('finanzas-mes').value = today.toISOString().substring(0, 7);
    document.getElementById('venta-fecha').value = today.toISOString().split('T')[0];
    verificarSesion();
});

// --- UI & NOTIFICACIONES ---
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''} fade-in`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function setLoading(id, loading) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) { btn.dataset.old = btn.innerText; btn.innerText = '...'; }
    else { btn.innerText = btn.dataset.old; }
}

// --- SESIÓN ---
async function verificarSesion() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    actualizarUI(session);
    clienteSupabase.auth.onAuthStateChange((_event, session) => actualizarUI(session));
}

function actualizarUI(session) {
    if (session) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        loadAll();
    } else {
        document.getElementById('app-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading('btn-login', true);
    const { error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    setLoading('btn-login', false);
    if (error) showToast(error.message, 'error');
});

async function logout() { await clienteSupabase.auth.signOut(); }

function showTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');
    if (id === 'finanzas') renderCharts();
}

// --- DATOS ---
async function loadAll() {
    await loadCats();
    await loadInv();
}

async function loadCats() {
    const { data } = await clienteSupabase.from('categorias').select('*').order('nombre');
    categoriasData = data || [];
    renderCats();
    updateSelects();
}

function renderCats() {
    const tbody = document.getElementById('categorias-body');
    tbody.innerHTML = categoriasData.map(c => `
        <tr><td>${c.nombre}</td><td><b>${c.prefijo}</b></td>
        <td><button onclick="delCat(${c.id})" class="btn-danger" style="padding:5px">🗑️</button></td></tr>
    `).join('');
}

function updateSelects() {
    const html = `<option value="">Categoría</option>` + categoriasData.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
    ['item-cat', 'filter-cat', 'edit-cat'].forEach(id => document.getElementById(id).innerHTML = html);
}

document.getElementById('add-cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('cat-nombre').value;
    const prefijo = document.getElementById('cat-prefijo').value.toUpperCase();
    await clienteSupabase.from('categorias').insert([{ nombre, prefijo }]);
    document.getElementById('add-cat-form').reset();
    loadCats();
});

async function delCat(id) {
    if (confirm('¿Eliminar categoría?')) {
        await clienteSupabase.from('categorias').delete().eq('id', id);
        loadCats();
    }
}

// --- INVENTARIO ---
async function loadInv() {
    const { data } = await clienteSupabase.from('inventario').select('*').order('id', { ascending: false });
    currentItems = data || [];
    renderTable();
    updateSaleSelect();
    renderHistory();
}

function renderTable() {
    const fCod = document.getElementById('filter-codigo').value.toLowerCase();
    const fCat = document.getElementById('filter-cat').value;
    const fEst = document.getElementById('filter-estado').value;

    const filtered = currentItems.filter(i => 
        i.codigo.toLowerCase().includes(fCod) && (fCat === '' || i.categoria === fCat) && (fEst === '' || i.estado === fEst)
    );

    document.getElementById('table-body').innerHTML = filtered.map(i => `
        <tr>
            <td><b class="text-primary">${i.codigo}</b></td>
            <td>${i.categoria}</td>
            <td>${i.talle || '-'}</td>
            <td>${i.detalle || '-'}</td>
            <td>$${i.precio_efectivo}</td><td>$${i.precio_tarjeta}</td>
            <td><span class="badge ${i.estado}">${i.estado.toUpperCase()}</span></td>
            <td>
                <button onclick="openEdit(${i.id})" style="background:none; color:var(--primary)">✏️</button>
                <button onclick="delItem(${i.id})" style="background:none; color:var(--danger)">🗑️</button>
            </td>
        </tr>
    `).join('');
}

document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading('btn-add-item', true);
    
    const cat = document.getElementById('item-cat').value;
    const cant = parseInt(document.getElementById('item-cantidad').value);
    const catObj = categoriasData.find(c => c.nombre === cat);
    const pref = catObj ? catObj.prefijo : 'X';

    // Obtener el último número para esta categoría
    const { data } = await clienteSupabase.from('inventario').select('codigo').like('codigo', `${pref}%`);
    let lastNum = 0;
    (data || []).forEach(i => {
        const n = parseInt(i.codigo.replace(pref, ''));
        if (n > lastNum) lastNum = n;
    });

    const newItems = [];
    for (let i = 1; i <= cant; i++) {
        newItems.push({
            codigo: pref + (lastNum + i).toString().padStart(4, '0'),
            categoria: cat,
            talle: document.getElementById('item-talle').value,
            detalle: document.getElementById('item-color-detalle').value,
            precio_efectivo: document.getElementById('item-efectivo').value,
            precio_tarjeta: document.getElementById('item-tarjeta').value,
            estado: 'stock'
        });
    }

    const { error } = await clienteSupabase.from('inventario').insert(newItems);
    setLoading('btn-add-item', false);
    if (!error) {
        showToast(`Se cargaron ${cant} prendas.`);
        document.getElementById('add-item-form').reset();
        document.getElementById('item-cantidad').value = 1;
        loadInv();
    } else {
        showToast('Error al cargar prendas (Revisa la Base de Datos)', 'error');
    }
});

async function delItem(id) { if (confirm('¿Eliminar del sistema?')) { await clienteSupabase.from('inventario').delete().eq('id', id); loadInv(); } }

function openEdit(id) {
    const i = currentItems.find(x => x.id === id);
    document.getElementById('edit-id').value = i.id;
    document.getElementById('edit-codigo-display').innerText = i.codigo;
    document.getElementById('edit-cat').value = i.categoria;
    document.getElementById('edit-talle').value = i.talle || 'Unico';
    document.getElementById('edit-color-detalle').value = i.detalle || '';
    document.getElementById('edit-efectivo').value = i.precio_efectivo;
    document.getElementById('edit-tarjeta').value = i.precio_tarjeta;
    document.getElementById('edit-estado').value = i.estado;
    document.getElementById('edit-modal').classList.add('active');
}

function closeModal() { document.getElementById('edit-modal').classList.remove('active'); }

document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    await clienteSupabase.from('inventario').update({
        categoria: document.getElementById('edit-cat').value,
        talle: document.getElementById('edit-talle').value,
        detalle: document.getElementById('edit-color-detalle').value,
        precio_efectivo: document.getElementById('edit-efectivo').value,
        precio_tarjeta: document.getElementById('edit-tarjeta').value,
        estado: document.getElementById('edit-estado').value
    }).eq('id', id);
    closeModal();
    loadInv();
});

// --- VENTAS Y DEVOLUCIONES ---
function updateSaleSelect() {
    const html = `<option value="">Seleccione prenda...</option>` + 
        currentItems.filter(i => i.estado === 'stock' && !carrito.some(c => c.id === i.id))
        .map(i => {
            // Si hay detalle lo agregamos, sino lo dejamos en blanco
            const textoDetalle = i.detalle ? ` - ${i.detalle}` : '';
            return `<option value="${i.id}">${i.codigo} - ${i.categoria} (${i.talle || '-'})${textoDetalle}</option>`;
        }).join('');
    document.getElementById('sell-item').innerHTML = html;
}

function addToCart() {
    const id = document.getElementById('sell-item').value;
    if (!id) return;
    const i = currentItems.find(x => x.id == id);
    carrito.push({ id: i.id, codigo: i.codigo, detalle: i.detalle, talle: i.talle, cat: i.categoria, sugerido: i.precio_efectivo, final: i.precio_efectivo });
    renderCart();
    updateSaleSelect();
}

function renderCart() {
    document.getElementById('cart-body').innerHTML = carrito.map((i, idx) => `
        <tr><td>${i.codigo}</td><td>${i.cat} (${i.talle || '-'}) - ${i.detalle || ''}</td><td>$${i.sugerido}</td>
        <td><input type="number" value="${i.final}" style="width:80px" oninput="carrito[${idx}].final=this.value; calcCart()"></td>
        <td><button onclick="carrito.splice(${idx},1); renderCart(); updateSaleSelect()" class="btn-danger" style="padding:2px 5px">X</button></td></tr>
    `).join('');
    calcCart();
}

function calcCart() {
    const total = carrito.reduce((s, i) => s + Number(i.final), 0);
    document.getElementById('cart-total').innerText = total.toLocaleString();
}

document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (carrito.length === 0) return;
    setLoading('btn-checkout', true);

    const { data } = await clienteSupabase.from('inventario').select('factura').not('factura', 'is', null).order('factura', { ascending: false }).limit(1);
    const nro = 'A' + (data && data[0] ? parseInt(data[0].factura.substring(1)) + 1 : 1).toString().padStart(8, '0');

    const updates = carrito.map(i => clienteSupabase.from('inventario').update({
        estado: 'vendido', factura: nro, metodo_pago: document.getElementById('sell-method').value,
        fecha_venta: document.getElementById('venta-fecha').value, telefono_cliente: document.getElementById('venta-telefono').value,
        precio_venta_final: i.final
    }).eq('id', i.id));

    await Promise.all(updates);
    showToast(`Venta ${nro} Exitosa`);
    carrito = [];
    renderCart();
    loadInv();
    setLoading('btn-checkout', false);
});

// Función de Devolución
window.devolverItem = async function(id) {
    if (confirm('¿Estás seguro de devolver esta prenda al stock? Se restará del total de la factura original.')) {
        await clienteSupabase.from('inventario').update({
            estado: 'stock',
            factura: null,
            fecha_venta: null,
            metodo_pago: null,
            telefono_cliente: null,
            precio_venta_final: null
        }).eq('id', id);
        
        showToast('Prenda devuelta al stock correctamente');
        loadInv(); // Recarga todo para actualizar historial y tablas
    }
}

// --- HISTORIAL & FINANZAS ---
function renderHistory() {
    const facturas = {};
    currentItems.filter(i => i.factura).forEach(i => {
        if (!facturas[i.factura]) facturas[i.factura] = { fecha: i.fecha_venta, tel: i.telefono_cliente || '-', total: 0, itemsHTML: [] };
        facturas[i.factura].total += Number(i.precio_venta_final);
        
        // Armamos el HTML del item individual con su botón de devolver
        facturas[i.factura].itemsHTML.push(`
            <div class="historial-item">
                <span>${i.codigo} (${i.categoria} - ${i.talle || '-'}) | $${i.precio_venta_final}</span>
                <button onclick="devolverItem(${i.id})" class="btn-icon btn-warning" title="Devolver a Stock">🔄</button>
            </div>
        `);
    });

    document.getElementById('facturas-body').innerHTML = Object.keys(facturas).sort().reverse().map(f => `
        <tr>
            <td style="vertical-align: top;"><b>${f}</b></td>
            <td style="vertical-align: top;">${facturas[f].fecha}</td>
            <td style="vertical-align: top;">${facturas[f].tel}</td>
            <td>${facturas[f].itemsHTML.join('')}</td>
            <td class="text-success text-bold" style="vertical-align: top;">$${facturas[f].total.toLocaleString()}</td>
        </tr>
    `).join('');
}

function renderCharts() {
    const mes = document.getElementById('finanzas-mes').value;
    const ventas = currentItems.filter(i => i.estado === 'vendido' && i.fecha_venta && i.fecha_venta.startsWith(mes));
    
    let total = 0; const cC = {}; const mC = {};
    ventas.forEach(v => {
        const p = Number(v.precio_venta_final); total += p;
        cC[v.categoria] = (cC[v.categoria] || 0) + p;
        mC[v.metodo_pago] = (mC[v.metodo_pago] || 0) + p;
    });

    document.getElementById('total-ingresos').innerText = `$${total.toLocaleString()}`;
    
    if (chartCatInstance) chartCatInstance.destroy();
    chartCatInstance = new Chart(document.getElementById('chartCategorias'), {
        type: 'pie', data: { labels: Object.keys(cC), datasets: [{ data: Object.values(cC), backgroundColor: ['#2563eb', '#16a34a', '#f59e0b', '#dc2626'] }] }
    });

    if (chartMetodoInstance) chartMetodoInstance.destroy();
    chartMetodoInstance = new Chart(document.getElementById('chartMetodos'), {
        type: 'pie', data: { labels: Object.keys(mC), datasets: [{ data: Object.values(mC), backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899'] }] }
    });
}