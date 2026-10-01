const state = { products: [], categories: [], suppliers: [], movements: [], transactions: [], query: '', category: 'all', status: 'all', sort: 'name', view: 'dashboard' };
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('id-ID');
const fruitEmojis = ['🍓', '🍇', '🍊', '🍑', '🥝', '🍎', '🍌'];
const supabaseConfig = {
  url: 'https://xrkqmxhrfiudvsltdezb.supabase.co',
  publishedKey: 'sb_publishable_LQ-7cir8R-O4MNeu-KxRzw_Dkf0cITH',
  ...window.GIOVANI_SUPABASE_CONFIG,
};
const useSupabaseDirectly = location.protocol === 'file:' || location.hostname.endsWith('.github.io') || supabaseConfig.apiMode === 'supabase';
const elements = {
  rows: document.querySelector('#product-rows'),
  mobileProducts: document.querySelector('#mobile-products'),
  search: document.querySelector('#search-input'),
  categoryFilter: document.querySelector('#category-filter'),
  statusFilter: document.querySelector('#status-filter'),
  sortFilter: document.querySelector('#sort-filter'),
  productDialog: document.querySelector('#product-dialog'),
  movementDialog: document.querySelector('#movement-dialog'),
  toast: document.querySelector('#toast'),
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function fruitForProduct(product) {
  const name = `${product.name || ''} ${product.category?.name || ''}`.toLocaleLowerCase('id');
  if (name.includes('strawberry') || name.includes('stroberi')) return '🍓';
  if (name.includes('anggur') || name.includes('grape')) return '🍇';
  if (name.includes('jeruk') || name.includes('orange')) return '🍊';
  if (name.includes('peach') || name.includes('persik')) return '🍑';
  if (name.includes('kiwi')) return '🥝';
  if (name.includes('apel') || name.includes('apple')) return '🍎';
  if (name.includes('pisang') || name.includes('banana')) return '🍌';
  return fruitEmojis[Math.abs((product.name?.charCodeAt(0) || 0) % fruitEmojis.length)];
}

function emptyStateMarkup(title, subtitle, action = '', buttonLabel = '') {
  const button = action ? `<button class="button button-primary" data-action="${action}">＋ ${escapeHtml(buttonLabel)}</button>` : '';
  return `<div class="empty-fruit"><div class="fruit-row" aria-hidden="true">🍓　🍇<br>　🍊<br>🍑　🥝</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(subtitle)}</p>${button}</div>`;
}

async function api(path, options = {}) {
  if (useSupabaseDirectly) return supabaseApi(path, options);
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
  return data;
}

async function supabaseRequest(resource, options = {}) {
  const response = await fetch(`${supabaseConfig.url.replace(/\/$/, '')}/rest/v1/${resource}`, {
    ...options,
    headers: {
      apikey: supabaseConfig.publishedKey,
      Authorization: `Bearer ${supabaseConfig.publishedKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.message || 'Permintaan langsung ke Supabase gagal.');
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

async function supabaseApi(path, options = {}) {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : {};
  const withSelect = (resource) => `${resource}${resource.includes('?') ? '&' : '?'}select=*`;
  if (method === 'GET' && path === '/api/bootstrap') {
    const [products, categories, suppliers, movements, transactions] = await Promise.all([
      supabaseRequest('products?select=*,category:categories(id,name),supplier:suppliers(id,name)&order=name.asc'),
      supabaseRequest('categories?select=id,name&order=name.asc'),
      supabaseRequest('suppliers?select=id,name,phone,address&order=name.asc'),
      supabaseRequest('stock_movements?select=id,product_id,type,quantity,note,created_at,product:products(name,unit)&order=created_at.desc'),
      supabaseRequest('sales_transactions?select=*,product:products(name,unit)&order=created_at.desc&limit=500').catch((error) => {
        if (['PGRST205', '42P01'].includes(error.code)) return [];
        throw error;
      }),
    ]);
    return { products, categories, suppliers, movements, transactions };
  }

  const productMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (path === '/api/products' && method === 'POST' || productMatch && method === 'PUT') {
    if (!body.name?.trim() || !body.category_id || !body.unit?.trim()) throw new Error('Nama, kategori, dan satuan wajib diisi.');
    const product = {
      name: body.name.trim(), sku: body.sku?.trim() || null, category_id: body.category_id,
      supplier_id: body.supplier_id || null, unit: body.unit.trim(),
      min_stock: Math.max(0, Number(body.min_stock) || 0),
      purchase_price: Math.max(0, Number(body.purchase_price) || 0),
      selling_price: Math.max(0, Number(body.selling_price) || 0),
    };
    if (!productMatch) product.stock = 0;
    const resource = productMatch ? `products?id=eq.${encodeURIComponent(productMatch[1])}` : 'products';
    const result = await supabaseRequest(withSelect(resource), {
      method: productMatch ? 'PATCH' : 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(product),
    });
    return Array.isArray(result) ? result[0] : result;
  }
  if (productMatch && method === 'DELETE') {
    return supabaseRequest(`products?id=eq.${encodeURIComponent(productMatch[1])}`, {
      method: 'DELETE', headers: { Prefer: 'return=representation' },
    });
  }

  for (const collection of [
    { path: '/api/suppliers', table: 'suppliers', fields: ['name', 'phone', 'address'] },
    { path: '/api/categories', table: 'categories', fields: ['name'] },
  ]) {
    const itemMatch = path.match(new RegExp(`^${collection.path}/([^/]+)$`));
    if (path !== collection.path && !itemMatch) continue;
    if (!['POST', 'PUT', 'DELETE'].includes(method)) continue;
    if (method === 'DELETE' && itemMatch) {
      return supabaseRequest(`${collection.table}?id=eq.${encodeURIComponent(itemMatch[1])}`, {
        method: 'DELETE', headers: { Prefer: 'return=representation' },
      });
    }
    if (method === 'POST' && !itemMatch || method === 'PUT' && itemMatch) {
      if (!body.name?.trim()) throw new Error('Nama wajib diisi.');
      const payload = Object.fromEntries(collection.fields.map((field) => [field, body[field]?.trim() || null]));
      const resource = itemMatch ? `${collection.table}?id=eq.${encodeURIComponent(itemMatch[1])}` : collection.table;
      return supabaseRequest(withSelect(resource), {
        method: itemMatch ? 'PATCH' : 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
    }
    throw new Error('Operasi data tidak valid.');
  }

  if (method === 'POST' && path === '/api/movements') {
    const quantity = Number(body.quantity);
    if (!body.product_id || !['masuk', 'keluar', 'penyesuaian', 'retur'].includes(body.type) || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Produk, jenis mutasi, dan jumlah bilangan bulat positif wajib diisi.');
    }
    return supabaseRequest('rpc/record_stock_movement', {
      method: 'POST',
      body: JSON.stringify({ p_product_id: body.product_id, p_type: body.type, p_quantity: quantity, p_note: body.note?.trim() || null }),
    });
  }

  if (method === 'POST' && path === '/api/transactions') {
    const quantity = Number(body.quantity);
    const unitPrice = Number(body.unit_price);
    if (!body.product_id || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0 || !['Cash', 'Transfer', 'QRIS'].includes(body.payment_method)) {
      throw new Error('Produk, jumlah, harga, dan metode pembayaran harus valid.');
    }
    return supabaseRequest('rpc/record_sale', {
      method: 'POST',
      body: JSON.stringify({
        p_product_id: body.product_id,
        p_quantity: quantity,
        p_unit_price: unitPrice,
        p_payment_method: body.payment_method,
        p_note: body.note?.trim() || null,
      }),
    });
  }

  throw new Error('Operasi belum didukung pada mode GitHub Pages.');
}

function statusFor(product) {
  if (Number(product.stock) <= 0) return { className: 'status-empty', label: 'Habis', key: 'empty' };
  if (Number(product.stock) <= Number(product.min_stock)) return { className: 'status-low', label: 'Stok menipis', key: 'low' };
  return { className: 'status-ready', label: 'Tersedia', key: 'ready' };
}

function movementLabel(type) {
  return ({ masuk: 'Stok masuk', keluar: 'Penjualan', penyesuaian: 'Penyesuaian', retur: 'Retur' })[type] || 'Mutasi stok';
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isToday(value) {
  const date = new Date(value);
  return todayKey(date) === todayKey();
}

function visibleProducts() {
  const query = state.query.toLocaleLowerCase('id');
  const filtered = state.products.filter((product) => {
    const matchesQuery = !query || `${product.name} ${product.sku || ''}`.toLocaleLowerCase('id').includes(query);
    const matchesCategory = state.category === 'all' || product.category_id === state.category;
    return matchesQuery && matchesCategory && (state.status === 'all' || statusFor(product).key === state.status);
  });
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name, 'id'),
    'stock-asc': (a, b) => Number(a.stock) - Number(b.stock),
    'stock-desc': (a, b) => Number(b.stock) - Number(a.stock),
    'price-desc': (a, b) => Number(b.selling_price) - Number(a.selling_price),
  };
  return filtered.sort(sorters[state.sort] || sorters.name);
}

function productActions(product) {
  const productName = escapeHtml(product.name);
  return `<div class="row-actions"><button class="stock-action stock-in" data-product-action="masuk" data-id="${product.id}" title="Catat stok masuk" aria-label="Stok masuk ${productName}">＋</button><button class="stock-action stock-out" data-product-action="keluar" data-id="${product.id}" title="Catat stok keluar" aria-label="Stok keluar ${productName}">−</button><button class="action-button" data-product-action="detail" data-id="${product.id}" title="Detail produk" aria-label="Detail ${productName}">◉</button><button class="action-button" data-product-action="edit" data-id="${product.id}" title="Edit produk" aria-label="Edit ${productName}">✎</button><button class="action-button" data-product-action="delete" data-id="${product.id}" title="Hapus produk" aria-label="Hapus ${productName}">×</button></div>`;
}

function productMarkup(product, compact = false) {
  const status = statusFor(product);
  const emoji = fruitForProduct(product);
  const actions = productActions(product);
  if (compact) return `<article class="mobile-product"><div class="mobile-product-top"><span class="fruit-mark">${emoji}</span><div class="mobile-product-name"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || 'Tanpa kode')}</small></div><span class="status ${status.className}">${status.label}</span></div><div class="mobile-product-details"><span>Stok <strong>${number.format(product.stock)} ${escapeHtml(product.unit)}</strong></span><span>${escapeHtml(product.category?.name || 'Tanpa kategori')}</span></div><div class="mobile-product-bottom"><strong>${rupiah.format(product.selling_price || 0)}</strong>${actions}</div></article>`;
  return `<tr><td>${escapeHtml(product.sku || '—')}</td><td><div class="product-cell"><span class="fruit-mark">${emoji}</span><span class="product-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.unit || '')} / satuan</small></span></div></td><td><span class="category-tag">${escapeHtml(product.category?.name || 'Tanpa kategori')}</span></td><td class="supplier-cell">${escapeHtml(product.supplier?.name || '—')}</td><td><span class="stock-amount">${number.format(product.stock)}</span><span class="stock-unit">${escapeHtml(product.unit)}</span></td><td class="price-cell">${rupiah.format(product.purchase_price || 0)}</td><td class="price-cell">${rupiah.format(product.selling_price || 0)}</td><td><span class="status ${status.className}">${status.label}</span></td><td>${actions}</td></tr>`;
}

function renderProducts() {
  const products = visibleProducts();
  document.querySelector('#product-count').textContent = `${number.format(products.length)} produk`;
  if (!products.length) {
    const empty = state.products.length ? emptyStateMarkup('Produk tidak ditemukan', 'Ubah kata kunci atau filter untuk melihat produk lain.') : emptyStateMarkup('Belum ada produk', 'Tambahkan produk buah pertama untuk mulai mengelola persediaan.', 'add-product', 'Tambah Produk');
    elements.rows.innerHTML = `<tr><td colspan="9" class="table-message">${empty}</td></tr>`;
    elements.mobileProducts.innerHTML = empty;
  } else {
    elements.rows.innerHTML = products.map((product) => productMarkup(product)).join('');
    elements.mobileProducts.innerHTML = products.map((product) => productMarkup(product, true)).join('');
  }
  renderMetrics();
}

function renderMetrics() {
  const totalStock = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const lowProducts = state.products.filter((product) => Number(product.stock) <= Number(product.min_stock));
  const low = lowProducts.length;
  const stockValue = state.products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.purchase_price || 0), 0);
  const todayTransactions = state.transactions.filter((transaction) => isToday(transaction.created_at));
  const todaySales = todayTransactions.reduce((sum, transaction) => sum + Number(transaction.total || 0), 0);
  document.querySelector('#metric-products').textContent = number.format(state.products.length);
  document.querySelector('#metric-stock').textContent = number.format(totalStock);
  document.querySelector('#metric-low').textContent = number.format(low);
  document.querySelector('#metric-value').textContent = rupiah.format(stockValue);
  document.querySelector('#metric-sales').textContent = rupiah.format(todaySales);
  document.querySelector('#metric-transactions').textContent = number.format(todayTransactions.length);
  document.querySelector('#inventory-metric-products').textContent = number.format(state.products.length);
  document.querySelector('#inventory-metric-low').textContent = number.format(low);
  document.querySelector('#inventory-metric-value').textContent = rupiah.format(stockValue);
  document.querySelector('#inventory-metric-stock').textContent = number.format(totalStock);
  document.querySelector('#transaction-sales').textContent = rupiah.format(todaySales);
  document.querySelector('#transaction-count').textContent = number.format(todayTransactions.length);
  document.querySelector('#transaction-units').textContent = number.format(todayTransactions.reduce((sum, transaction) => sum + Number(transaction.quantity || 0), 0));
  document.querySelector('#transaction-revenue').textContent = rupiah.format(todaySales);
  document.querySelector('#report-sales').textContent = rupiah.format(todaySales);
  document.querySelector('#report-stock').textContent = number.format(totalStock);
  document.querySelector('#report-low').textContent = number.format(low);
  document.querySelector('#report-value').textContent = rupiah.format(stockValue);
  const alert = document.querySelector('#restock-alert');
  alert.hidden = low === 0;
  document.querySelector('#restock-message').textContent = `${number.format(low)} produk perlu segera direstok`;
  document.querySelector('#low-stock-list').innerHTML = lowProducts.length ? lowProducts.slice(0, 5).map((product) => {
    const emoji = fruitForProduct(product);
    const status = statusFor(product);
    const level = Math.max(0, Math.min(100, Number(product.stock) / Math.max(Number(product.min_stock), 1) * 100));
    return `<div class="low-stock-row"><span class="fruit-mark">${emoji}</span><span class="low-stock-copy"><strong>${escapeHtml(product.name)}</strong><small>Stok ${number.format(product.stock)} / minimum ${number.format(product.min_stock)} ${escapeHtml(product.unit)}</small><span class="restock-track"><span style="width:${level}%"></span></span></span><span class="status ${status.className}">${status.label}</span></div>`;
  }).join('') : '<div class="empty-fruit">🍑<p>Semua stok dalam kondisi aman.</p></div>';
  renderNotifications();
}

function renderActivity() {
  const container = document.querySelector('#activity-list');
  const activities = [
    ...state.transactions.slice(0, 5).map((transaction) => ({ ...transaction, activityType: 'transaction' })),
    ...state.movements.slice(0, 5).map((movement) => ({ ...movement, activityType: 'movement' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  if (!activities.length) {
    container.innerHTML = '<div class="empty-fruit">🍑<p>Belum ada aktivitas stok yang tercatat.</p></div>';
    return;
  }
  container.innerHTML = activities.map((activity) => {
    const emoji = fruitForProduct(activity.product || {});
    if (activity.activityType === 'transaction') {
      const reference = `INV-${String(activity.id).slice(0, 6).toUpperCase()}`;
      return `<article class="activity-row transaction-activity"><span class="fruit-mark">${emoji}</span><div class="activity-copy"><strong>${escapeHtml(activity.product?.name || 'Produk')}</strong><small>${reference} · ${number.format(activity.quantity)} ${escapeHtml(activity.product?.unit || '')} · Selesai</small></div><span class="activity-quantity">${rupiah.format(activity.total || 0)}</span></article>`;
    }
    const incoming = ['masuk', 'retur'].includes(activity.type);
    const date = new Date(activity.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<article class="activity-row"><span class="activity-mark ${incoming ? 'activity-in' : 'activity-out'}">${incoming ? '↓' : '↑'}</span><div class="activity-copy"><strong>${escapeHtml(activity.product?.name || 'Produk')}</strong><small>${movementLabel(activity.type)}${activity.note ? ` · ${escapeHtml(activity.note)}` : ''}</small></div><span class="activity-quantity ${incoming ? 'quantity-in' : 'quantity-out'}">${incoming ? '+' : '−'}${number.format(activity.quantity)} ${escapeHtml(activity.product?.unit || '')}</span><time>${date}</time></article>`;
  }).join('');
}

function renderMovementTable() {
  const search = (document.querySelector('#movement-search')?.value || '').toLocaleLowerCase('id');
  const type = document.querySelector('#movement-type-filter')?.value || 'all';
  const from = document.querySelector('#movement-from')?.value || '';
  const to = document.querySelector('#movement-to')?.value || '';
  const rows = document.querySelector('#movement-rows');
  const movements = state.movements.filter((movement) => {
    const matchesSearch = !search || `${movement.product?.name || ''} ${movement.note || ''}`.toLocaleLowerCase('id').includes(search);
    const date = todayKey(new Date(movement.created_at));
    return matchesSearch && (type === 'all' || movement.type === type) && (!from || date >= from) && (!to || date <= to);
  });
  const latestStock = new Map(state.products.map((product) => [product.id, Number(product.stock)]));
  const chronological = [...state.movements].reverse();
  const stockAfter = new Map();
  for (const movement of [...chronological].reverse()) {
    const after = latestStock.get(movement.product_id) ?? null;
    if (after !== null) {
      stockAfter.set(movement.id, after);
      latestStock.set(movement.product_id, after + (['masuk', 'retur'].includes(movement.type) ? -Number(movement.quantity) : Number(movement.quantity)));
    }
  }
  if (!movements.length) {
    const empty = state.movements.length ? emptyStateMarkup('Mutasi tidak ditemukan', 'Coba ubah tanggal, kata kunci, atau jenis mutasi.') : emptyStateMarkup('Belum ada data mutasi', 'Catat perubahan persediaan untuk melihat riwayatnya.', state.products.length ? 'add-movement' : 'add-product', state.products.length ? 'Catat Mutasi' : 'Tambah Produk');
    rows.innerHTML = `<tr><td colspan="7" class="table-message">${empty}</td></tr>`;
    return;
  }
  rows.innerHTML = movements.map((movement) => {
    const incoming = ['masuk', 'retur'].includes(movement.type);
    const after = stockAfter.get(movement.id);
    const before = after === undefined ? null : after + (incoming ? -Number(movement.quantity) : Number(movement.quantity));
    const date = new Date(movement.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    return `<tr><td>${date}</td><td><span class="fruit-mark">${fruitForProduct(movement.product || {})}</span> ${escapeHtml(movement.product?.name || 'Produk')}</td><td><span class="status movement-badge movement-${movement.type}">${movementLabel(movement.type)}</span></td><td>${incoming ? '+' : '−'}${number.format(movement.quantity)} ${escapeHtml(movement.product?.unit || '')}</td><td>${before === null ? '—' : number.format(before)}</td><td>${after === undefined ? '—' : number.format(after)}</td><td>${escapeHtml(movement.note || '—')}</td></tr>`;
  }).join('');
}

function renderTransactions() {
  const todayTransactions = state.transactions.filter((transaction) => isToday(transaction.created_at));
  const rows = document.querySelector('#transaction-rows');
  const mobile = document.querySelector('#mobile-transactions');
  if (!state.transactions.length) {
    const empty = state.products.length ? emptyStateMarkup('Belum ada transaksi', 'Transaksi akan muncul setelah penjualan pertama dicatat.', 'add-transaction', 'Transaksi Baru') : emptyStateMarkup('Belum ada transaksi', 'Tambahkan produk terlebih dahulu sebelum mencatat penjualan.', 'add-product', 'Tambah Produk');
    rows.innerHTML = `<tr><td colspan="9" class="table-message">${empty}</td></tr>`;
    mobile.innerHTML = empty;
    return;
  }
  const markup = state.transactions.map((transaction) => {
    const date = new Date(transaction.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const id = `TRX-${String(transaction.id).slice(0, 8).toUpperCase()}`;
    return `<tr><td>${id}</td><td>${date}</td><td><span class="fruit-mark">${fruitForProduct(transaction.product || {})}</span> ${escapeHtml(transaction.product?.name || 'Produk')}</td><td>${number.format(transaction.quantity)} ${escapeHtml(transaction.product?.unit || '')}</td><td>${rupiah.format(transaction.unit_price)}</td><td><strong>${rupiah.format(transaction.total)}</strong></td><td>${escapeHtml(transaction.payment_method)}</td><td><span class="status status-ready">Selesai</span></td><td><button class="action-button" data-transaction-detail="${transaction.id}" title="Detail transaksi" aria-label="Detail ${id}">◉</button></td></tr>`;
  }).join('');
  rows.innerHTML = markup;
  mobile.innerHTML = state.transactions.map((transaction) => `<article class="mobile-product"><div class="mobile-product-top"><span class="fruit-mark">${fruitForProduct(transaction.product || {})}</span><div class="mobile-product-name"><strong>${escapeHtml(transaction.product?.name || 'Produk')}</strong><small>${new Date(transaction.created_at).toLocaleString('id-ID')}</small></div><span class="status status-ready">Selesai</span></div><div class="mobile-product-details"><span>${number.format(transaction.quantity)} × ${rupiah.format(transaction.unit_price)}</span><strong>${rupiah.format(transaction.total)}</strong></div><div class="mobile-product-bottom"><span>${escapeHtml(transaction.payment_method)}</span></div></article>`).join('');
  document.querySelector('#transaction-count').textContent = number.format(todayTransactions.length);
}

function renderSuppliers() {
  const rows = document.querySelector('#supplier-rows');
  const productsBySupplier = (supplier) => state.products.filter((product) => product.supplier_id === supplier.id);
  const rankedSuppliers = state.suppliers.map((supplier) => ({ supplier, count: productsBySupplier(supplier).length })).sort((a, b) => b.count - a.count);
  document.querySelector('#supplier-total').textContent = number.format(state.suppliers.length);
  document.querySelector('#supplier-active').textContent = number.format(state.suppliers.filter((supplier) => productsBySupplier(supplier).length).length);
  document.querySelector('#supplier-products').textContent = rankedSuppliers[0]?.count ? rankedSuppliers[0].supplier.name : '—';
  document.querySelector('#supplier-top-count').textContent = rankedSuppliers[0]?.count ? `${number.format(rankedSuppliers[0].count)} produk disuplai` : 'Belum menyuplai produk';
  if (!state.suppliers.length) {
    rows.innerHTML = `<tr><td colspan="7" class="table-message">${emptyStateMarkup('Belum ada pemasok', 'Data akan muncul setelah mitra pemasok ditambahkan.', 'add-supplier', 'Tambah Pemasok')}</td></tr>`;
    return;
  }
  rows.innerHTML = state.suppliers.map((supplier, index) => {
    const supplied = productsBySupplier(supplier);
    const code = `SUP-${String(index + 1).padStart(3, '0')}`;
    return `<tr><td>${code}</td><td><strong>${escapeHtml(supplier.name)}</strong></td><td>${escapeHtml(supplier.phone || '—')}</td><td>${escapeHtml(supplier.address || '—')}</td><td>${supplied.length ? supplied.map((product) => escapeHtml(product.name)).join(', ') : '—'}</td><td><span class="status ${supplied.length ? 'status-ready' : 'status-low'}">${supplied.length ? 'Aktif' : 'Belum memasok'}</span></td><td><div class="row-actions"><button class="action-button" data-supplier-action="detail" data-id="${supplier.id}" title="Detail pemasok">◉</button><button class="action-button" data-supplier-action="edit" data-id="${supplier.id}" title="Edit pemasok">✎</button><button class="action-button" data-supplier-action="delete" data-id="${supplier.id}" title="Hapus pemasok">×</button></div></td></tr>`;
  }).join('');
}

function renderCategories() {
  const container = document.querySelector('#category-grid');
  if (!state.categories.length) {
    container.innerHTML = '<div class="panel empty-fruit">🍓 &nbsp; 🍇 &nbsp; 🍊<p>Belum ada kategori produk.</p><button class="button button-primary" id="add-category-empty">＋ Tambah kategori</button></div>';
    return;
  }
  container.innerHTML = state.categories.map((category, index) => {
    const count = state.products.filter((product) => product.category_id === category.id).length;
    return `<article class="category-card"><span class="category-emoji">${fruitEmojis[index % fruitEmojis.length]}</span><div class="category-info"><strong>${escapeHtml(category.name)}</strong><small>${number.format(count)} produk</small></div><div class="category-actions"><button class="action-button" data-category-action="edit" data-id="${category.id}" title="Edit kategori">✎</button><button class="action-button" data-category-action="delete" data-id="${category.id}" title="Hapus kategori">×</button></div></article>`;
  }).join('');
}

function renderReports() {
  const period = document.querySelector('#report-period').value;
  const count = period === 'monthly' ? 6 : 7;
  const buckets = Array.from({ length: count }, (_, index) => {
    const date = new Date();
    if (period === 'monthly') {
      date.setDate(1);
      date.setMonth(date.getMonth() - (count - index - 1));
      return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(date), total: 0 };
    }
    date.setDate(date.getDate() - (count - index - 1) * (period === 'weekly' ? 7 : 1));
    if (period === 'weekly') date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return { key: todayKey(date), label: period === 'weekly' ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date) : new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date), total: 0 };
  });
  const bucketKey = (date) => {
    if (period === 'monthly') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (period === 'weekly') {
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return todayKey(date);
    }
    return todayKey(date);
  };
  const salesByPeriod = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const transaction of state.transactions) {
    const bucket = salesByPeriod.get(bucketKey(new Date(transaction.created_at)));
    if (bucket) bucket.total += Number(transaction.total || 0);
  }
  const title = { daily: 'Penjualan harian', weekly: 'Penjualan mingguan', monthly: 'Penjualan bulanan' };
  document.querySelector('#report-title').textContent = title[period];
  const maximum = Math.max(...buckets.map((bucket) => bucket.total), 1);
  document.querySelector('#sales-chart').innerHTML = buckets.map((bucket) => `<div class="chart-column"><span class="chart-value">${bucket.total ? rupiah.format(bucket.total).replace('Rp', '') : '—'}</span><div class="chart-bar" style="height:${Math.max(bucket.total / maximum * 100, 2)}%"></div><span>${bucket.label}</span></div>`).join('');
  const totals = state.categories.map((category) => ({ name: category.name, stock: state.products.filter((product) => product.category_id === category.id).reduce((sum, product) => sum + Number(product.stock || 0), 0) }));
  const maximumStock = Math.max(...totals.map((category) => category.stock), 1);
  document.querySelector('#category-report').innerHTML = totals.length ? totals.map((category) => `<div class="category-bar-row"><span>${escapeHtml(category.name)}</span><div class="category-track"><div class="category-fill" style="width:${category.stock / maximumStock * 100}%"></div></div><strong>${number.format(category.stock)}</strong></div>`).join('') : '<div class="empty-fruit">Belum ada kategori.</div>';
  const topProducts = new Map();
  for (const transaction of state.transactions) {
    const current = topProducts.get(transaction.product_id) || { name: transaction.product?.name || 'Produk', units: 0 };
    current.units += Number(transaction.quantity || 0);
    topProducts.set(transaction.product_id, current);
  }
  const rankedProducts = [...topProducts.values()].sort((a, b) => b.units - a.units).slice(0, 5);
  const maximumUnits = Math.max(...rankedProducts.map((product) => product.units), 1);
  document.querySelector('#top-selling-list').innerHTML = rankedProducts.length ? rankedProducts.map((product) => `<div class="category-bar-row"><span>${escapeHtml(product.name)}</span><div class="category-track"><div class="category-fill" style="width:${product.units / maximumUnits * 100}%"></div></div><strong>${number.format(product.units)}</strong></div>`).join('') : emptyStateMarkup('Belum ada data penjualan', 'Grafik produk terlaris akan muncul setelah transaksi dicatat.', 'add-transaction', 'Transaksi Baru');
}

function renderNotifications() {
  const low = state.products.filter((product) => Number(product.stock) <= Number(product.min_stock));
  document.querySelector('#notification-count').textContent = number.format(low.length);
  const items = low.slice(0, 6).map((product) => `<div class="notification-item"><strong>${escapeHtml(product.name)}</strong><br>${statusFor(product).label} · ${number.format(product.stock)} ${escapeHtml(product.unit)}</div>`);
  const latestSale = state.transactions[0];
  if (latestSale) items.unshift(`<div class="notification-item"><strong>Transaksi baru</strong><br>${escapeHtml(latestSale.product?.name || 'Produk')} · ${rupiah.format(latestSale.total)}</div>`);
  document.querySelector('#notification-panel').innerHTML = `<h3>Notifikasi</h3>${items.length ? items.join('') : '<div class="notification-item">Semua stok dalam kondisi aman.</div>'}`;
}

function fillSelectors() {
  const options = state.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
  const selectedCategory = elements.categoryFilter.value || state.category;
  elements.categoryFilter.innerHTML = '<option value="all">Semua kategori</option>' + options;
  state.category = state.categories.some((category) => category.id === selectedCategory) ? selectedCategory : 'all';
  elements.categoryFilter.value = state.category;
  document.querySelector('#product-form [name="category_id"]').innerHTML = `<option value="">Pilih kategori</option>${options}`;
  document.querySelector('#product-form [name="supplier_id"]').innerHTML = '<option value="">Tanpa pemasok</option>' + state.suppliers.map((supplier) => `<option value="${supplier.id}">${escapeHtml(supplier.name)}</option>`).join('');
  document.querySelector('#movement-product').innerHTML = `<option value="">Pilih produk</option>${state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} · stok ${number.format(product.stock)} ${escapeHtml(product.unit)}</option>`).join('')}`;
  const transactionProduct = document.querySelector('#transaction-product');
  transactionProduct.innerHTML = `<option value="">Pilih produk</option>${state.products.map((product) => `<option value="${product.id}" ${Number(product.stock) < 1 ? 'disabled' : ''}>${escapeHtml(product.name)} · stok ${number.format(product.stock)} ${escapeHtml(product.unit)}</option>`).join('')}`;
}

function renderAll() {
  fillSelectors();
  renderProducts();
  renderActivity();
  renderMovementTable();
  renderTransactions();
  renderSuppliers();
  renderCategories();
  renderReports();
}

async function loadData() {
  try {
    const data = await api('/api/bootstrap');
    Object.assign(state, data);
    renderAll();
  } catch (error) {
    elements.rows.innerHTML = `<tr><td colspan="9" class="table-message table-error">${escapeHtml(error.message)} Periksa konfigurasi Supabase dan jalankan backend/schema.sql.</td></tr>`;
    elements.mobileProducts.innerHTML = `<div class="table-message table-error">${escapeHtml(error.message)} Periksa konfigurasi Supabase dan jalankan backend/schema.sql.</div>`;
    showToast(error.message, true);
  }
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle('toast-error', isError);
  elements.toast.classList.add('toast-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('toast-visible'), 3200);
}

function switchView(name) {
  const labels = { dashboard: 'Dashboard', inventory: 'Inventaris', transactions: 'Transaksi', movements: 'Mutasi stok', suppliers: 'Pemasok', categories: 'Kategori produk', reports: 'Laporan', settings: 'Pengaturan' };
  state.view = name;
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  document.querySelectorAll('[data-view]').forEach((link) => {
    if (link.classList.contains('nav-item')) link.classList.toggle('active', link.dataset.view === name);
  });
  document.querySelector('#breadcrumb-current').textContent = labels[name] || 'Dashboard';
  document.querySelector('#sidebar').classList.remove('sidebar-open');
  document.querySelector('#sidebar-scrim').classList.remove('visible');
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

function openProductDialog(product = null) {
  const form = document.querySelector('#product-form');
  form.reset();
  form.elements.unit.value = 'kg';
  form.elements.initial_stock.value = 0;
  form.elements.min_stock.value = 5;
  form.elements.purchase_price.value = 0;
  form.elements.selling_price.value = 0;
  document.querySelector('#product-dialog-title').textContent = product ? 'Edit produk' : 'Tambah produk';
  document.querySelector('#initial-stock-field').hidden = Boolean(product);
  document.querySelector('#product-error').textContent = '';
  if (product) {
    for (const key of ['name', 'category_id', 'supplier_id', 'sku', 'unit', 'min_stock', 'purchase_price', 'selling_price']) form.elements[key].value = product[key] ?? '';
    form.dataset.id = product.id;
  } else delete form.dataset.id;
  elements.productDialog.showModal();
}

function openMovementDialog(product = null, type = 'masuk') {
  const form = document.querySelector('#movement-form');
  form.reset();
  form.elements.product_id.value = product?.id || '';
  form.elements.type.value = type;
  updateMovementHeading();
  document.querySelector('#movement-error').textContent = '';
  elements.movementDialog.showModal();
}

function updateMovementHeading() {
  const form = document.querySelector('#movement-form');
  const product = state.products.find((item) => item.id === form.elements.product_id.value);
  const type = form.elements.type.value;
  document.querySelector('#movement-title').textContent = movementLabel(type);
  document.querySelector('#selected-product').textContent = product ? `${product.name} · stok saat ini ${number.format(product.stock)} ${product.unit}` : 'Pilih produk dan jenis mutasi.';
  document.querySelector('#movement-submit').textContent = `Catat ${movementLabel(type).toLocaleLowerCase('id')}`;
}

function openSupplierDialog(supplier = null) {
  const form = document.querySelector('#supplier-form');
  form.reset();
  document.querySelector('#supplier-dialog-title').textContent = supplier ? 'Edit pemasok' : 'Tambah pemasok';
  document.querySelector('#supplier-error').textContent = '';
  if (supplier) {
    for (const key of ['name', 'phone', 'address']) form.elements[key].value = supplier[key] || '';
    form.dataset.id = supplier.id;
  } else delete form.dataset.id;
  document.querySelector('#supplier-dialog').showModal();
}

function openCategoryDialog(category = null) {
  const form = document.querySelector('#category-form');
  form.reset();
  document.querySelector('#category-dialog-title').textContent = category ? 'Edit kategori' : 'Tambah kategori';
  document.querySelector('#category-error').textContent = '';
  if (category) {
    form.elements.name.value = category.name;
    form.dataset.id = category.id;
  } else delete form.dataset.id;
  document.querySelector('#category-dialog').showModal();
}

function openTransactionDialog() {
  const form = document.querySelector('#transaction-form');
  form.reset();
  form.elements.quantity.value = 1;
  document.querySelector('#transaction-error').textContent = '';
  syncTransactionPrice();
  document.querySelector('#transaction-dialog').showModal();
}

function syncTransactionPrice() {
  const product = state.products.find((item) => item.id === document.querySelector('#transaction-product').value);
  if (product) document.querySelector('#transaction-price').value = Number(product.selling_price || 0);
  const quantity = Number(document.querySelector('#transaction-quantity').value || 0);
  const price = Number(document.querySelector('#transaction-price').value || 0);
  document.querySelector('#transaction-total').textContent = rupiah.format(quantity * price);
}

function confirmAction(title, message, action) {
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-message').textContent = message;
  document.querySelector('#confirm-error').textContent = '';
  const dialog = document.querySelector('#confirm-dialog');
  const button = document.querySelector('#confirm-submit');
  button.onclick = async () => {
    button.disabled = true;
    try {
      await action();
      dialog.close();
      await loadData();
    } catch (error) {
      document.querySelector('#confirm-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  dialog.showModal();
}

function showProductDetail(product) {
  const status = statusFor(product);
  const supplier = product.supplier?.name || 'Tanpa pemasok';
  const details = `Kategori: ${product.category?.name || 'Tanpa kategori'}\nPemasok: ${supplier}\nKode: ${product.sku || '—'}\nStok: ${number.format(product.stock)} ${product.unit}\nBatas minimum: ${number.format(product.min_stock)} ${product.unit}\nHarga beli: ${rupiah.format(product.purchase_price || 0)}\nHarga jual: ${rupiah.format(product.selling_price || 0)}\nStatus: ${status.label}`;
  showDetails(product.name, details);
}

function showDetails(title, details) {
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-message').textContent = details;
  document.querySelector('#confirm-message').style.whiteSpace = 'pre-line';
  document.querySelector('#confirm-error').textContent = '';
  document.querySelector('#confirm-submit').hidden = true;
  document.querySelector('#confirm-dialog').showModal();
  document.querySelector('#confirm-dialog').addEventListener('close', () => {
    document.querySelector('#confirm-submit').hidden = false;
    document.querySelector('#confirm-message').style.whiteSpace = '';
  }, { once: true });
}

document.querySelector('#today').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
document.querySelector('#dashboard-date').textContent = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
document.querySelectorAll('[data-view]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  switchView(link.dataset.view);
}));
document.querySelector('#menu-toggle').addEventListener('click', () => {
  document.querySelector('#sidebar').classList.toggle('sidebar-open');
  document.querySelector('#sidebar-scrim').classList.toggle('visible');
});
document.querySelector('#sidebar-scrim').addEventListener('click', () => switchView(state.view));
document.querySelector('#notification-button').addEventListener('click', () => {
  const panel = document.querySelector('#notification-panel');
  panel.hidden = !panel.hidden;
});
document.querySelector('#add-product-button').addEventListener('click', () => openProductDialog());
document.querySelector('#add-supplier-button').addEventListener('click', () => openSupplierDialog());
document.querySelector('#add-category-button').addEventListener('click', () => openCategoryDialog());
document.querySelector('#add-transaction-button').addEventListener('click', openTransactionDialog);
document.querySelector('#quick-transaction').addEventListener('click', openTransactionDialog);
document.querySelector('#record-movement-button').addEventListener('click', () => openMovementDialog());
elements.search.addEventListener('input', () => { state.query = elements.search.value; renderProducts(); });
elements.categoryFilter.addEventListener('change', () => { state.category = elements.categoryFilter.value; renderProducts(); });
elements.statusFilter.addEventListener('change', () => { state.status = elements.statusFilter.value; renderProducts(); });
elements.sortFilter.addEventListener('change', () => { state.sort = elements.sortFilter.value; renderProducts(); });
document.querySelector('#movement-search').addEventListener('input', renderMovementTable);
document.querySelector('#movement-type-filter').addEventListener('change', renderMovementTable);
document.querySelector('#movement-from').addEventListener('change', renderMovementTable);
document.querySelector('#movement-to').addEventListener('change', renderMovementTable);
document.querySelector('#movement-product').addEventListener('change', updateMovementHeading);
document.querySelector('#movement-kind').addEventListener('change', updateMovementHeading);
document.querySelector('#report-period').addEventListener('change', renderReports);
document.querySelector('#transaction-product').addEventListener('change', syncTransactionPrice);
document.querySelector('#transaction-quantity').addEventListener('input', syncTransactionPrice);
document.querySelector('#transaction-price').addEventListener('input', syncTransactionPrice);

document.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    if (actionButton.dataset.action === 'add-product') openProductDialog();
    if (actionButton.dataset.action === 'add-transaction') openTransactionDialog();
    if (actionButton.dataset.action === 'add-supplier') openSupplierDialog();
    if (actionButton.dataset.action === 'add-movement') openMovementDialog();
    if (actionButton.dataset.action === 'go-inventory') switchView('inventory');
    return;
  }
  const productButton = event.target.closest('[data-product-action]');
  if (productButton) {
    const product = state.products.find((item) => item.id === productButton.dataset.id);
    if (!product) return;
    const action = productButton.dataset.productAction;
    if (action === 'masuk' || action === 'keluar') openMovementDialog(product, action);
    if (action === 'edit') openProductDialog(product);
    if (action === 'detail') showProductDetail(product);
    if (action === 'delete') confirmAction('Hapus produk?', `Produk ${product.name} akan dihapus. Produk dengan riwayat mutasi tidak dapat dihapus.`, async () => {
      await api(`/api/products/${product.id}`, { method: 'DELETE' });
      showToast('Produk berhasil dihapus.');
    });
    return;
  }
  const supplierButton = event.target.closest('[data-supplier-action]');
  if (supplierButton) {
    const supplier = state.suppliers.find((item) => item.id === supplierButton.dataset.id);
    if (!supplier) return;
    if (supplierButton.dataset.supplierAction === 'detail') {
      const supplied = state.products.filter((product) => product.supplier_id === supplier.id).map((product) => product.name);
      showDetails(supplier.name, `Telepon: ${supplier.phone || '—'}\nAlamat: ${supplier.address || '—'}\nProduk disuplai: ${supplied.join(', ') || 'Belum ada produk'}`);
    }
    if (supplierButton.dataset.supplierAction === 'edit') openSupplierDialog(supplier);
    if (supplierButton.dataset.supplierAction === 'delete') confirmAction('Hapus pemasok?', `Pemasok ${supplier.name} akan dihapus. Produk terkait akan menjadi tanpa pemasok.`, async () => {
      await api(`/api/suppliers/${supplier.id}`, { method: 'DELETE' });
      showToast('Pemasok berhasil dihapus.');
    });
    return;
  }
  const categoryButton = event.target.closest('[data-category-action]');
  if (categoryButton) {
    const category = state.categories.find((item) => item.id === categoryButton.dataset.id);
    if (!category) return;
    if (categoryButton.dataset.categoryAction === 'edit') openCategoryDialog(category);
    if (categoryButton.dataset.categoryAction === 'delete') confirmAction('Hapus kategori?', `Kategori ${category.name} tidak dapat dihapus jika masih dipakai produk.`, async () => {
      await api(`/api/categories/${category.id}`, { method: 'DELETE' });
      showToast('Kategori berhasil dihapus.');
    });
  }
  const transactionDetail = event.target.closest('[data-transaction-detail]');
  if (transactionDetail) {
    const transaction = state.transactions.find((item) => item.id === transactionDetail.dataset.transactionDetail);
    if (transaction) {
      const details = `Produk: ${transaction.product?.name || 'Produk'}\nJumlah: ${number.format(transaction.quantity)} ${transaction.product?.unit || ''}\nHarga: ${rupiah.format(transaction.unit_price)}\nTotal: ${rupiah.format(transaction.total)}\nPembayaran: ${transaction.payment_method}\nCatatan: ${transaction.note || '—'}\nTanggal: ${new Date(transaction.created_at).toLocaleString('id-ID')}`;
      showDetails(`TRX-${String(transaction.id).slice(0, 8).toUpperCase()}`, details);
    }
  }
  if (event.target.closest('#add-category-empty')) openCategoryDialog();
});

document.querySelector('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.id;
  const payload = Object.fromEntries(new FormData(form));
  const initialStock = Number(payload.initial_stock) || 0;
  delete payload.initial_stock;
  try {
    const savedProduct = await api(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (!id && initialStock > 0) {
      await api('/api/movements', {
        method: 'POST',
        body: JSON.stringify({ product_id: savedProduct.id, type: 'masuk', quantity: initialStock, note: 'Stok awal produk' }),
      });
    }
    elements.productDialog.close();
    showToast(id ? 'Data produk berhasil diperbarui.' : 'Produk berhasil ditambahkan.');
    await loadData();
  } catch (error) {
    document.querySelector('#product-error').textContent = error.message;
  }
});

document.querySelector('#movement-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api('/api/movements', { method: 'POST', body: JSON.stringify(payload) });
    elements.movementDialog.close();
    showToast(payload.type === 'masuk' ? 'Stok masuk berhasil dicatat.' : 'Stok keluar berhasil dicatat.');
    await loadData();
  } catch (error) {
    document.querySelector('#movement-error').textContent = error.message;
  }
});

document.querySelector('#supplier-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.id;
  try {
    await api(id ? `/api/suppliers/${id}` : '/api/suppliers', { method: id ? 'PUT' : 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    document.querySelector('#supplier-dialog').close();
    showToast(id ? 'Data pemasok berhasil diperbarui.' : 'Pemasok berhasil ditambahkan.');
    await loadData();
  } catch (error) { document.querySelector('#supplier-error').textContent = error.message; }
});

document.querySelector('#category-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.id;
  try {
    await api(id ? `/api/categories/${id}` : '/api/categories', { method: id ? 'PUT' : 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    document.querySelector('#category-dialog').close();
    showToast(id ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil ditambahkan.');
    await loadData();
  } catch (error) { document.querySelector('#category-error').textContent = error.message; }
});

document.querySelector('#transaction-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });
    document.querySelector('#transaction-dialog').close();
    showToast('Transaksi berhasil disimpan. Stok telah diperbarui.');
    await loadData();
  } catch (error) { document.querySelector('#transaction-error').textContent = error.message; }
});

document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    switchView('inventory');
    elements.search.focus();
  }
  if (event.key === 'Escape') {
    document.querySelector('#sidebar').classList.remove('sidebar-open');
    document.querySelector('#sidebar-scrim').classList.remove('visible');
  }
});
const initialView = location.hash.slice(1);
if (document.querySelector(`#view-${initialView}`)) switchView(initialView);
loadData();