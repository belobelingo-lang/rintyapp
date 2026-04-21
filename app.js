const SUPABASE_URL = 'https://xkfbddsocidbballtkko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrZmJkZHNvY2lkYmJhbGx0a2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDM4MzksImV4cCI6MjA5MjExOTgzOX0.-evlscIW2bNysQpavMK4LoYPYOFguszZCN5LQoy6Tvs';
const clienteSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentItems = [], categoriasData = [], carrito = [];
let facturasList = [];
let chartCatInstance = null, chartMetodoInstance = null;
let isAdmin = false;

let paginaActual = 1;
const itemsPorPagina = 30;

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    document.getElementById('venta-fecha').value = today.toISOString().split('T')[0];
    document.getElementById('consulta-fecha').value = today.toISOString().split('T')[0];
    
    const mSelect = document.getElementById('finanzas-mes-select');
    const aSelect = document.getElementById('finanzas-anio-select');
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    
    meses.forEach((m, i) => {
        let opt = document.createElement('option');
        opt.value = (i + 1).toString().padStart(2, '0');
        opt.innerText = m;
        mSelect.appendChild(opt);
    });

    for (let a = 2026; a <= 2060; a++) {
        let opt = document.createElement('option');
        opt.value = a; opt.innerText = a;
        aSelect.appendChild(opt);
    }

    mSelect.value = (today.getMonth() + 1).toString().padStart(2, '0');
    aSelect.value = today.getFullYear();

    verificarSesion();
});

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} fade-in`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function verificarSesion() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    actualizarUI(session);
    clienteSupabase.auth.onAuthStateChange((_event, session) => actualizarUI(session));
}

async function actualizarUI(session) {
    if (session) {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        
        const { data: rolData } = await clienteSupabase.from('usuarios_roles').select('rol').eq('email', session.user.email).single();
        if (rolData && rolData.rol === 'admin') {
            isAdmin = true;
            document.body.classList.add('is-admin');
            document.getElementById('tarjeta-costo-stock').style.display = 'flex';
        } else {
            isAdmin = false;
            document.body.classList.remove('is-admin');
            document.getElementById('tarjeta-costo-stock').style.display = 'none';
        }
        
        loadAll();
    } else {
        document.getElementById('app-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        isAdmin = false;
        document.body.classList.remove('is-admin');
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await clienteSupabase.auth.signInWithPassword({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    });
    if (error) showToast(error.message, 'error');
});

async function logout() { await clienteSupabase.auth.signOut(); }

function showTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.add('active');
    if (id === 'finanzas' && isAdmin) renderCharts();
}

async function loadAll() { await loadCats(); await loadInv(); await fetchFacturas(); }

async function loadCats() {
    const { data } = await clienteSupabase.from('categorias').select('*').order('nombre');
    categoriasData = data || [];
    const tbody = document.getElementById('categorias-body');
    tbody.innerHTML = categoriasData.map(c => `<tr><td>${c.nombre}</td><td>${c.prefijo}</td><td><button onclick="delCat(${c.id})" class="btn-danger">Borrar</button></td></tr>`).join('');
    const html = `<option value="">Categoría</option>` + categoriasData.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
    ['item-cat', 'filter-cat', 'edit-cat'].forEach(id => document.getElementById(id).innerHTML = html);
}

document.getElementById('add-cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await clienteSupabase.from('categorias').insert([{ nombre: document.getElementById('cat-nombre').value, prefijo: document.getElementById('cat-prefijo').value.toUpperCase() }]);
    document.getElementById('add-cat-form').reset();
    loadCats();
});

async function delCat(id) { if (confirm('¿Seguro que deseas eliminar?')) { await clienteSupabase.from('categorias').delete().eq('id', id); loadCats(); } }

async function loadInv() {
    const { data } = await clienteSupabase.from('inventario').select('*').order('id', { ascending: false });
    currentItems = data || [];
    paginaActual = 1;
    renderTable();
    updateSaleSelect();
    
    if (isAdmin) {
        const totalCostoStock = currentItems.filter(i => i.estado === 'stock').reduce((sum, i) => sum + Number(i.costo), 0);
        document.getElementById('stock-total-costo').innerText = `$${totalCostoStock.toLocaleString()}`;
    }
}

async function fetchFacturas() {
    const { data } = await clienteSupabase.from('facturas')
        .select(`*, factura_detalle(id, inventario_id, precio_vendido, inventario(codigo))`)
        .order('id', { ascending: false });
    facturasList = data || [];
    renderHistory();
}

function cambiarPagina(delta) {
    paginaActual += delta;
    renderTable();
}

function renderTable() {
    const fCod = document.getElementById('filter-codigo').value.toLowerCase();
    const fCat = document.getElementById('filter-cat').value;
    const fEst = document.getElementById('filter-estado').value;
    
    const filtered = currentItems.filter(i => i.codigo.toLowerCase().includes(fCod) && (fCat === '' || i.categoria === fCat) && (fEst === '' || i.estado === fEst));
    
    const totalPaginas = Math.ceil(filtered.length / itemsPorPagina) || 1;
    if (paginaActual < 1) paginaActual = 1;
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const itemsPagina = filtered.slice(inicio, fin);

    document.getElementById('table-body').innerHTML = itemsPagina.map(i => `
        <tr>
            <td>${i.codigo}</td><td>${i.categoria}</td><td>${i.talle || '-'}</td><td>${i.detalle || '-'}</td>
            <td class="admin-cell">$${i.costo}</td><td>$${i.precio_efectivo}</td><td>$${i.precio_tarjeta}</td>
            <td><span class="badge ${i.estado}">${i.estado.toUpperCase()}</span></td>
            <td><button onclick="openEdit(${i.id})" class="btn-primary" style="padding: 6px; font-size: 0.8rem;">Editar</button> <button onclick="delItem(${i.id})" class="btn-danger" style="padding: 6px; font-size: 0.8rem;">Borrar</button></td>
        </tr>
    `).join('');
    
    document.getElementById('page-indicator').innerText = `Página ${paginaActual} de ${totalPaginas}`;
}

document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btnAdd = document.getElementById('btn-add-item');
    btnAdd.disabled = true;
    btnAdd.innerText = 'Procesando...';

    const cat = document.getElementById('item-cat').value;
    const cant = parseInt(document.getElementById('item-cantidad').value);
    const pref = (categoriasData.find(c => c.nombre === cat) || {prefijo:'X'}).prefijo;
    const { data } = await clienteSupabase.from('inventario').select('codigo').like('codigo', `${pref}%`);
    let lastNum = 0;
    (data || []).forEach(i => { const n = parseInt(i.codigo.replace(pref, '')); if (n > lastNum) lastNum = n; });
    const newItems = [];
    const costoVal = isAdmin ? (document.getElementById('item-costo').value || 0) : 0;
    
    for (let i = 1; i <= cant; i++) {
        newItems.push({
            codigo: pref + (lastNum + i).toString().padStart(5, '0'),
            categoria: cat, talle: document.getElementById('item-talle').value,
            detalle: document.getElementById('item-color-detalle').value,
            costo: costoVal,
            precio_efectivo: document.getElementById('item-efectivo').value,
            precio_tarjeta: document.getElementById('item-tarjeta').value,
            estado: 'stock'
        });
    }
    
    await clienteSupabase.from('inventario').insert(newItems);
    
    document.getElementById('add-item-form').reset();
    document.getElementById('item-cantidad').value = 1;
    
    btnAdd.disabled = false;
    btnAdd.innerText = 'Agregar al Stock';
    showToast(`${cant} artículo(s) agregado(s) con éxito`);
    
    loadInv();
});

async function delItem(id) { if (confirm('¿Seguro que deseas eliminar?')) { await clienteSupabase.from('inventario').delete().eq('id', id); loadInv(); } }

function openEdit(id) {
    const i = currentItems.find(x => x.id === id);
    document.getElementById('edit-id').value = i.id;
    document.getElementById('edit-codigo-display').innerText = i.codigo;
    document.getElementById('edit-cat').value = i.categoria;
    document.getElementById('edit-talle').value = i.talle || 'Unico';
    document.getElementById('edit-color-detalle').value = i.detalle || '';
    if (isAdmin) document.getElementById('edit-costo').value = i.costo;
    document.getElementById('edit-efectivo').value = i.precio_efectivo;
    document.getElementById('edit-tarjeta').value = i.precio_tarjeta;
    document.getElementById('edit-estado').value = i.estado;
    document.getElementById('edit-modal').classList.add('active');
}

function closeModal() { document.getElementById('edit-modal').classList.remove('active'); }

document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updateData = {
        categoria: document.getElementById('edit-cat').value, talle: document.getElementById('edit-talle').value,
        detalle: document.getElementById('edit-color-detalle').value, precio_efectivo: document.getElementById('edit-efectivo').value,
        precio_tarjeta: document.getElementById('edit-tarjeta').value, estado: document.getElementById('edit-estado').value
    };
    if (isAdmin) updateData.costo = document.getElementById('edit-costo').value;
    
    await clienteSupabase.from('inventario').update(updateData).eq('id', document.getElementById('edit-id').value);
    closeModal(); loadInv();
});

function updateSaleSelect() {
    const filter = document.getElementById('filter-sell-item').value.toLowerCase();
    const html = `<option value="">Seleccione prenda...</option>` + 
        currentItems.filter(i => i.estado === 'stock' && !carrito.some(c => c.id === i.id) && i.codigo.toLowerCase().includes(filter))
        .map(i => `<option value="${i.id}">${i.codigo} - ${i.categoria} (${i.talle || '-'})${i.detalle ? ' - '+i.detalle : ''}</option>`).join('');
    document.getElementById('sell-item').innerHTML = html;
}

function addToCart() {
    const id = document.getElementById('sell-item').value;
    if (!id) return;
    const i = currentItems.find(x => x.id == id);
    carrito.push({ 
        id: i.id, codigo: i.codigo, detalle: i.detalle, talle: i.talle, cat: i.categoria, 
        p_efe: i.precio_efectivo, p_tar: i.precio_tarjeta, final: i.precio_efectivo 
    });
    document.getElementById('filter-sell-item').value = '';
    renderCart();
    updateSaleSelect();
}

function renderCart() {
    document.getElementById('cart-body').innerHTML = carrito.map((i, idx) => `
        <tr><td>${i.codigo}</td><td>${i.cat} (${i.talle}) ${i.detalle||''}</td><td>$${i.p_efe}</td><td>$${i.p_tar}</td>
        <td><input type="number" value="${i.final}" style="width:80px" oninput="carrito[${idx}].final=this.value; calcCart()"></td>
        <td><button onclick="carrito.splice(${idx},1); renderCart(); updateSaleSelect()" class="btn-danger" style="padding:6px">Quitar</button></td></tr>
    `).join('');
    calcCart();
}

function calcCart() { 
    const total = carrito.reduce((s, i) => s + Number(i.final), 0);
    document.getElementById('cart-total').innerText = total.toLocaleString();
    
    document.getElementById('pay-efe').value = total;
    document.getElementById('pay-tar').value = 0;
    document.getElementById('pay-tra').value = 0;
}

document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (carrito.length === 0) return;
    
    const efe = Number(document.getElementById('pay-efe').value) || 0;
    const tar = Number(document.getElementById('pay-tar').value) || 0;
    const tra = Number(document.getElementById('pay-tra').value) || 0;
    const totalPagos = efe + tar + tra;
    const totalCart = carrito.reduce((s, i) => s + Number(i.final), 0);
    
    if (totalPagos !== totalCart) {
        showToast('La suma de los pagos no coincide con el total del carrito', 'error');
        return;
    }

    const btnCheckout = document.getElementById('btn-checkout');
    btnCheckout.disabled = true;
    btnCheckout.innerText = 'Procesando Venta...';

    // 1. Crear Factura en la nueva tabla
    const { data: numData } = await clienteSupabase.from('facturas').select('numero').order('id', { ascending: false }).limit(1);
    const nro = 'A' + (numData && numData[0] ? parseInt(numData[0].numero.substring(1)) + 1 : 1).toString().padStart(8, '0');
    
    const { data: newFactura, error: errFactura } = await clienteSupabase.from('facturas').insert([{
        numero: nro,
        fecha: document.getElementById('venta-fecha').value,
        telefono_cliente: document.getElementById('venta-telefono').value,
        total: totalCart,
        pago_efectivo: efe, pago_tarjeta: tar, pago_transferencia: tra
    }]).select().single();

    if (errFactura) {
        showToast('Error al crear factura', 'error');
        btnCheckout.disabled = false;
        btnCheckout.innerText = 'Confirmar Venta';
        return;
    }

    // 2. Crear el Detalle y actualizar Inventario
    const detalles = carrito.map(item => ({
        factura_id: newFactura.id,
        inventario_id: item.id,
        precio_vendido: item.final
    }));
    await clienteSupabase.from('factura_detalle').insert(detalles);

    const inventarioUpdates = carrito.map(item => clienteSupabase.from('inventario').update({ estado: 'vendido' }).eq('id', item.id));
    await Promise.all(inventarioUpdates);
    
    btnCheckout.disabled = false;
    btnCheckout.innerText = 'Confirmar Venta';

    showToast(`Venta ${nro} Exitosa`);
    carrito = []; 
    document.getElementById('pay-efe').value = 0;
    document.getElementById('pay-tar').value = 0;
    document.getElementById('pay-tra').value = 0;
    renderCart(); loadInv(); fetchFacturas();
});

function renderHistory() {
    const fFact = (document.getElementById('filter-hist-factura')?.value || '').toLowerCase();
    const fTel = (document.getElementById('filter-hist-tel')?.value || '').toLowerCase();
    const fFecha = document.getElementById('filter-hist-fecha')?.value;

    let filtradas = facturasList;

    if (fFact) filtradas = filtradas.filter(f => f.numero.toLowerCase().includes(fFact));
    if (fTel) filtradas = filtradas.filter(f => (f.telefono_cliente || '').toLowerCase().includes(fTel));
    if (fFecha) filtradas = filtradas.filter(f => f.fecha === fFecha);

    document.getElementById('facturas-body').innerHTML = filtradas.map(f => {
        const itemsHTML = (f.factura_detalle || []).map(det => 
            `<div style="margin-bottom:5px;">
                <span>${det.inventario?.codigo} | $${det.precio_vendido}</span> 
                <button onclick='abrirModalDevolucion(${JSON.stringify(f)}, ${JSON.stringify(det)})' class="btn-warning" style="padding:4px; font-size:0.7rem">Devolver</button>
            </div>`
        ).join('');

        return `<tr>
            <td>${f.numero}</td><td>${f.fecha}</td><td>${f.telefono_cliente || '-'}</td>
            <td>${itemsHTML || '<span class="text-muted">Sin artículos</span>'}</td>
            <td class="text-success">$${Number(f.total).toLocaleString()}</td>
        </tr>`;
    }).join('');
}

// ---- LOGICA NUEVA DE DEVOLUCION INTERACTIVA ----
let returnData = null;

function abrirModalDevolucion(factura, detalle) {
    returnData = { factura, detalle };
    document.getElementById('ret-codigo').innerText = detalle.inventario.codigo;
    document.getElementById('ret-valor').innerText = detalle.precio_vendido;
    
    document.getElementById('ret-efe').max = factura.pago_efectivo;
    document.getElementById('ret-tar').max = factura.pago_tarjeta;
    document.getElementById('ret-tra').max = factura.pago_transferencia;
    
    document.getElementById('ret-efe').value = 0;
    document.getElementById('ret-tar').value = 0;
    document.getElementById('ret-tra').value = 0;

    document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal() {
    returnData = null;
    document.getElementById('confirm-modal').classList.remove('active');
}

document.getElementById('btn-confirm-yes').addEventListener('click', async () => {
    if (!returnData) return;

    const vEfe = Number(document.getElementById('ret-efe').value) || 0;
    const vTar = Number(document.getElementById('ret-tar').value) || 0;
    const vTra = Number(document.getElementById('ret-tra').value) || 0;
    const devTotal = vEfe + vTar + vTra;

    if (devTotal !== Number(returnData.detalle.precio_vendido)) {
        showToast('La suma a devolver no coincide con el valor del artículo', 'error');
        return;
    }

    if (vEfe > returnData.factura.pago_efectivo || vTar > returnData.factura.pago_tarjeta || vTra > returnData.factura.pago_transferencia) {
        showToast('Estás devolviendo más dinero por un método del que ingresó originalmente', 'error');
        return;
    }
    
    const btnYes = document.getElementById('btn-confirm-yes');
    btnYes.disabled = true;
    btnYes.innerText = 'Procesando...';

    // 1. Restar de la factura
    await clienteSupabase.from('facturas').update({
        total: returnData.factura.total - devTotal,
        pago_efectivo: returnData.factura.pago_efectivo - vEfe,
        pago_tarjeta: returnData.factura.pago_tarjeta - vTar,
        pago_transferencia: returnData.factura.pago_transferencia - vTra
    }).eq('id', returnData.factura.id);

    // 2. Liberar el inventario
    await clienteSupabase.from('inventario').update({ estado: 'stock' }).eq('id', returnData.detalle.inventario_id);

    // 3. Borrar el detalle
    await clienteSupabase.from('factura_detalle').delete().eq('id', returnData.detalle.id);
    
    btnYes.disabled = false;
    btnYes.innerText = 'Confirmar Devolución Exacta';
    
    closeConfirmModal();
    showToast('Artículo devuelto y factura ajustada', 'success');
    loadInv(); fetchFacturas();
});

async function renderCharts() {
    if (!isAdmin) return;
    
    const mes = document.getElementById('finanzas-mes-select').value;
    const anio = document.getElementById('finanzas-anio-select').value;
    const periodo = `${anio}-${mes}`;

    // Obtener facturas del mes con sus detalles e inventario para saber el costo
    // PEGAR ESTO:
    // Calculamos el último día del mes automáticamente
    const ultimoDia = new Date(anio, mes, 0).getDate(); 
    
    const { data: facturasMes } = await clienteSupabase.from('facturas')
        .select(`*, factura_detalle(precio_vendido, inventario(categoria, costo))`)
        .gte('fecha', `${periodo}-01`)
        .lte('fecha', `${periodo}-${ultimoDia}`);

    let totalFacturado = 0, totalCosto = 0, totalEfe = 0, totalTar = 0, totalTra = 0;
    const cC = {};

    (facturasMes || []).forEach(f => {
        totalFacturado += Number(f.total);
        totalEfe += Number(f.pago_efectivo);
        totalTar += Number(f.pago_tarjeta);
        totalTra += Number(f.pago_transferencia);

        (f.factura_detalle || []).forEach(det => {
            totalCosto += Number(det.inventario.costo || 0);
            cC[det.inventario.categoria] = (cC[det.inventario.categoria] || 0) + Number(det.precio_vendido);
        });
    });

    document.getElementById('finanzas-total-facturado').innerText = `$${totalFacturado.toLocaleString()}`;
    document.getElementById('finanzas-costo-vendido').innerText = `$${totalCosto.toLocaleString()}`;
    document.getElementById('finanzas-ganancia-neta').innerText = `$${(totalFacturado - totalCosto).toLocaleString()}`;
    
    if (chartCatInstance) chartCatInstance.destroy();
    chartCatInstance = new Chart(document.getElementById('chartCategorias'), { 
        type: 'pie', 
        data: { labels: Object.keys(cC), datasets: [{ data: Object.values(cC), backgroundColor: ['#2563eb', '#16a34a', '#f59e0b', '#dc2626'] }] } 
    });

    if (chartMetodoInstance) chartMetodoInstance.destroy();
    chartMetodoInstance = new Chart(document.getElementById('chartMetodos'), {
        type: 'pie',
        data: { labels: ['Efectivo', 'Tarjeta', 'Transferencia'], datasets: [{ data: [totalEfe, totalTar, totalTra], backgroundColor: ['#16a34a', '#f59e0b', '#3b82f6'] }] }
    });

    const objetivoLocal = localStorage.getItem(`objetivo_${periodo}`) || 0;
    document.getElementById('finanzas-objetivo-input').value = objetivoLocal > 0 ? objetivoLocal : '';
    document.getElementById('finanzas-objetivo-display').innerText = Number(objetivoLocal).toLocaleString();
    
    let porcentaje = 0;
    if (objetivoLocal > 0) {
        porcentaje = (totalFacturado / objetivoLocal) * 100;
    }
    document.getElementById('finanzas-progress-bar').style.width = `${Math.min(porcentaje, 100)}%`;
    document.getElementById('finanzas-progreso-texto').innerText = porcentaje.toFixed(1);
}

function guardarObjetivo() {
    const mes = document.getElementById('finanzas-mes-select').value;
    const anio = document.getElementById('finanzas-anio-select').value;
    const periodo = `${anio}-${mes}`;
    const obj = document.getElementById('finanzas-objetivo-input').value;
    localStorage.setItem(`objetivo_${periodo}`, obj);
    showToast('Objetivo guardado con éxito');
    renderCharts();
}

async function consultarVentaDia() {
    const f = document.getElementById('consulta-fecha').value;
    const { data } = await clienteSupabase.from('facturas').select('total').eq('fecha', f);
    const total = (data || []).reduce((sum, f) => sum + Number(f.total), 0);
    document.getElementById('total-consulta').innerText = `$${total.toLocaleString()}`;
}
