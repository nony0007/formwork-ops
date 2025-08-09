import { ensureDB, setDB, resetDB, backupDB, restoreDB } from './data.js';

// Register SW for offline
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }

const nav = document.getElementById('nav');
const app = document.getElementById('app');
const fileRestore = document.getElementById('file-restore');
document.getElementById('btn-backup').onclick = backupDB;
document.getElementById('btn-reset').onclick = ()=>{ if(confirm('Reset all local data?')){ resetDB(); location.reload(); } };
document.getElementById('btn-restore').onclick = ()=> fileRestore.click();
fileRestore.onchange = ()=>{ const f = fileRestore.files[0]; if(!f) return; restoreDB(f, ok=>{ alert(ok?'Restored data.':'Invalid file.'); location.reload(); }); };

// Router
const routes = {
  inventory: InventoryView,
  transfers: TransfersView,
  deliveries: DeliveriesView,
  checkout: CheckoutView,
  maintenance: MaintenanceView,
  admin: AdminView,
  movements: MovementsView
};

const tabs = [
  ['inventory','Inventory'],
  ['transfers','Transfers'],
  ['deliveries','Deliveries'],
  ['checkout','Check-in/Out'],
  ['maintenance','Maintenance'],
  ['movements','Movements'],
  ['admin','Admin']
];

function drawNav(){
  nav.innerHTML='';
  tabs.forEach(([id,label])=>{
    const a = el('a',{href:'#'+id},label);
    if(('#'+id)===location.hash || (!location.hash&&id==='inventory')) a.classList.add('active');
    nav.appendChild(a);
  });
}
window.addEventListener('hashchange', ()=>{ drawNav(); render(); });
window.addEventListener('load', ()=>{ drawNav(); render(); });

function render(){
  const route = (location.hash.replace('#','') || 'inventory');
  const View = routes[route] || InventoryView;
  const db = ensureDB();
  app.innerHTML='';
  app.appendChild(View(db));
}

// DOM helpers
function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==='class') n.className = v;
    else if(k.startsWith('on') && typeof v==='function') n.addEventListener(k.substring(2), v);
    else if(k==='html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  (Array.isArray(children)?children:[children]).filter(Boolean).forEach(c=>n.appendChild(typeof c==='string'?document.createTextNode(c):c));
  return n;
}

// ---------- Inventory ----------
function InventoryView(db){
  const root = el('div',{class:'grid'});
  root.appendChild(kpis(db));
  const itemBySku = Object.fromEntries(db.items.map(i=>[i.sku,i]));
  const controls = el('div',{class:'panel'},[
    el('div',{class:'grid cols-3'},[
      el('input',{class:'input', id:'q', placeholder:'Search (SKU, item, site)'}),
      selectSites(db,'All locations','loc'),
      el('div',{class:'row'},[
        el('button',{class:'btn', onClick:()=>exportInventory(db)},'Export CSV'),
        el('button',{class:'btn primary', onClick:()=>openAddStock(db, root)},'Add Stock'),
        el('button',{class:'btn ghost', onClick:()=>openNewItem(db, root)},'New Item'),
      ])
    ])
  ]);
  root.appendChild(controls);

  const tableWrap = el('div',{class:'panel'});
  const table = el('table',{class:'table'});
  table.innerHTML=`<thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Location</th><th style="text-align:right">Qty</th><th>QR</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector('tbody');
  tableWrap.appendChild(table); root.appendChild(tableWrap);

  function draw(){
    const q = controls.querySelector('#q').value.toLowerCase();
    const loc = controls.querySelector('#loc').value;
    tbody.innerHTML='';
    db.stock.filter(r=>!loc || r.location===loc).filter(r=>{
      if(!q) return true;
      const it=itemBySku[r.sku]||{name:'',category:''};
      const sit=db.sites.find(s=>s.id===r.location)?.name||'';
      return r.sku.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) || sit.toLowerCase().includes(q);
    }).forEach(r=>{
      const it=itemBySku[r.sku]||{};
      const tr = el('tr',{},[
        el('td',{},r.sku),
        el('td',{},it.name||''),
        el('td',{},it.category||''),
        el('td',{},db.sites.find(s=>s.id===r.location)?.name||r.location),
        el('td',{},String(r.qty)),
        el('td',{},[el('button',{class:'btn small', onClick:()=>openQrLabel({sku:r.sku, location:r.location})},'Label')])
      ]);
      tbody.appendChild(tr);
    });
  }
  controls.querySelector('#q').addEventListener('input', draw);
  controls.querySelector('#loc').addEventListener('change', draw);
  draw();
  return root;
}

function openNewItem(db, mount){
  const dlg = panelDialog('New Item');
  const sku = el('input',{class:'input', placeholder:'SKU e.g. DK-FRMX-120x270'});
  const name = el('input',{class:'input', placeholder:'Name'});
  const cat = el('input',{class:'input', placeholder:'Category'});
  const unit = el('input',{class:'input', placeholder:'Unit (panel, beam, rod, piece...)'});
  dlg.appendChild(el('div',{class:'grid cols-2'},[sku,name]));
  dlg.appendChild(el('div',{class:'grid cols-2'},[cat,unit]));
  dlg.appendChild(el('div',{class:'row'},[
    el('button',{class:'btn primary', onClick:()=>{
      if(!sku.value) return alert('SKU required');
      db.items.push({sku:sku.value,name:name.value,category:cat.value,unit:unit.value||'piece'});
      setDB(db); dlg.remove(); render();
    }},'Create'),
    el('button',{class:'btn ghost', onClick:()=>dlg.remove()},'Close')
  ]));
  mount.appendChild(dlg);
}

function openAddStock(db, mount){
  const dlg = panelDialog('Add Stock');
  const sku = selectItems(db,'Choose item','sku');
  const loc = selectSites(db,'Choose location','loc');
  const qty = el('input',{class:'input', placeholder:'Quantity', type:'number', min:'1', value:'1'});
  dlg.appendChild(el('div',{class:'grid cols-2'},[sku,loc]));
  dlg.appendChild(qty);
  dlg.appendChild(el('div',{class:'row'},[
    el('button',{class:'btn primary', onClick:()=>{
      const s=sku.value, l=loc.value, q=Math.max(1,parseInt(qty.value||'0',10));
      if(!s||!l) return alert('Pick SKU and Location');
      const i = db.stock.findIndex(x=>x.sku===s && x.location===l);
      if(i>=0) db.stock[i].qty+=q; else db.stock.push({sku:s,location:l,qty:q});
      addMovement(db,{type:'IN',sku:s,qty:q,to:l,ref:'manual-add'});
      setDB(db); dlg.remove(); render();
    }},'Add'),
    el('button',{class:'btn ghost', onClick:()=>dlg.remove()},'Close')
  ]));
  mount.appendChild(dlg);
}

function exportInventory(db){
  const itemBySku = Object.fromEntries(db.items.map(i=>[i.sku,i]));
  const rows = [['SKU','Item','Category','Location','Qty']];
  db.stock.forEach(r=>rows.push([r.sku, itemBySku[r.sku]?.name||'', itemBySku[r.sku]?.category||'', (db.sites.find(s=>s.id===r.location)?.name)||r.location, String(r.qty)]));
  downloadCSV('inventory.csv', rows);
}

// ---------- Transfers ----------
function TransfersView(db){
  const root = el('div',{class:'grid'});
  root.appendChild(kpis(db));
  const panel = el('div',{class:'panel'},[
    el('div',{class:'row'},[
      el('button',{class:'btn', onClick:()=>openScanner(data=>handleScanTransfer(db,data))},'Open Scanner'),
      el('button',{class:'btn primary', onClick:()=>openNewTransfer(db, root)},'New Transfer')
    ])
  ]);
  root.appendChild(panel);

  root.appendChild(renderTransfersTable(db));
  return root;
}

function renderTransfersTable(db){
  const tableBox = el('div',{class:'panel'});
  const t = el('table',{class:'table'});
  t.innerHTML = `<thead><tr><th>Ref</th><th>From → To</th><th>Lines</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = t.querySelector('tbody');
  db.transfers.forEach(tr=>{
    const lines = tr.lines.map(l=>`${l.sku} × ${l.qty}`).join(' · ');
    const row = el('tr',{},[
      el('td',{},tr.id),
      el('td',{},`${siteName(db,tr.from)} → ${siteName(db,tr.to)}`),
      el('td',{},lines||'-'),
      el('td',{},el('span',{class:'badge'},tr.status)),
      el('td',{},[
        el('button',{class:'btn small', onClick:()=>progressTransfer(db,tr.id)},'Advance'),
        el('button',{class:'btn small ghost', onClick:()=>printTransferQr(tr)},'QR')
      ])
    ]);
    tbody.appendChild(row);
  });
  tableBox.appendChild(t);
  return tableBox;
}

function openNewTransfer(db, mount){
  const dlg = panelDialog('New Transfer');
  const from = selectSites(db,'From','from');
  const to = selectSites(db,'To','to');
  const linesBox = el('div',{class:'grid'});
  function addLineRow(){
    const sku = selectItems(db,'Item','sku');
    const qty = el('input',{class:'input', type:'number', min:'1', placeholder:'Qty', value:'1'});
    const row = el('div',{class:'grid cols-3'},[sku, qty, el('button',{class:'btn ghost', onClick:()=>row.remove()},'Remove')]);
    linesBox.appendChild(row);
  }
  addLineRow();
  dlg.appendChild(el('div',{class:'grid cols-2'},[from,to]));
  dlg.appendChild(linesBox);
  dlg.appendChild(el('button',{class:'btn', onClick:addLineRow},'Add Line'));
  dlg.appendChild(el('div',{class:'row'},[
    el('button',{class:'btn primary', onClick:()=>{
      if(!from.value || !to.value || from.value===to.value) return alert('Pick different From/To');
      const lines = [...linesBox.querySelectorAll('div.grid.cols-3')].map(div=>{
        const s = div.querySelector('select').value;
        const q = Math.max(1, parseInt(div.querySelector('input').value||'0',10));
        return {sku:s, qty:q};
      }).filter(x=>x.sku);
      if(!lines.length) return alert('Add at least one line');
      const id = 'T-' + Date.now().toString().slice(-6);
      db.transfers.push({id, from:from.value, to:to.value, lines, status:'Draft'});
      setDB(db); dlg.remove(); render();
    }},'Create'),
    el('button',{class:'btn ghost', onClick:()=>dlg.remove()},'Close')
  ]));
  mount.appendChild(dlg);
}

function progressTransfer(db, id){
  const tr = db.transfers.find(t=>t.id===id);
  if(!tr) return;
  const order = ['Draft','Loaded','OnRoute','Delivered'];
  const idx = order.indexOf(tr.status);
  const next = order[Math.min(order.length-1, idx+1)];
  tr.status = next;
  if(next==='Delivered'){
    // apply stock move
    tr.lines.forEach(l=>moveStock(db,l.sku,tr.from,tr.to,l.qty,tr.id));
  }
  setDB(db); render();
}

function handleScanTransfer(db, data){
  try{
    const o = JSON.parse(data);
    if(o.sku && o.location){
      // quick move 1 unit to first transfer with status Draft or Loaded
      const tr = db.transfers.find(x=>x.status==='Draft' || x.status==='Loaded');
      if(!tr){ alert('No active transfer. Create one first.'); return; }
      const from = o.location, to = tr.to;
      if(from===to){ alert('Item already at destination.'); return; }
      moveStock(db,o.sku,from,to,1,tr.id);
      alert(`Moved 1 × ${o.sku} ${from}→${to}`);
      render();
    }else{
      alert('Unsupported scan payload.');
    }
  }catch{
    alert('Scanned: '+data);
  }
}

// ---------- Deliveries ----------
function DeliveriesView(db){
  const root = el('div',{class:'grid'});
  const panel = el('div',{class:'panel'},[
    el('div',{class:'row'},[
      el('button',{class:'btn primary', onClick:()=>openNewDelivery(db, root)},'New Delivery'),
      el('button',{class:'btn', onClick:()=>openScanner(data=>handleScanDelivery(db,data))},'Start Receiving')
    ])
  ]);
  root.appendChild(panel);
  const table = el('table',{class:'table'});
  table.innerHTML = `<thead><tr><th>Docket</th><th>To</th><th>Supplier</th><th>Lines</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector('tbody');
  db.deliveries.forEach(d=>{
    const lines = d.lines.map(l=>`${l.sku} ${l.received||0}/${l.expected}`).join(' · ');
    const row = el('tr',{},[
      el('td',{},d.id),
      el('td',{},siteName(db,d.to)),
      el('td',{},d.supplier||'-'),
      el('td',{},lines||'-'),
      el('td',{},el('span',{class:'badge'},d.status)),
      el('td',{},[
        el('button',{class:'btn small', onClick:()=>receiveDelivery(db,d.id)},'Receive'),
        el('button',{class:'btn small ghost', onClick:()=>printDeliveryQr(d)},'QR')
      ])
    ]);
    tbody.appendChild(row);
  });
  root.appendChild(el('div',{class:'panel'},table));
  return root;
}

function openNewDelivery(db, mount){
  const dlg = panelDialog('New Delivery');
  const to = selectSites(db,'To site','to');
  const supplier = el('input',{class:'input', placeholder:'Supplier'});
  const linesBox = el('div',{class:'grid'});
  function addRow(){
    const sku = selectItems(db,'Item','sku');
    const exp = el('input',{class:'input', type:'number', min:'1', value:'1', placeholder:'Expected'});
    const row = el('div',{class:'grid cols-3'},[sku,exp,el('button',{class:'btn ghost', onClick:()=>row.remove()},'Remove')]);
    linesBox.appendChild(row);
  }
  addRow();
  dlg.appendChild(el('div',{class:'grid cols-2'},[to,supplier]));
  dlg.appendChild(linesBox);
  dlg.appendChild(el('button',{class:'btn', onClick:addRow},'Add Line'));
  dlg.appendChild(el('div',{class:'row'},[
    el('button',{class:'btn primary', onClick:()=>{
      if(!to.value) return alert('Choose site');
      const lines = [...linesBox.querySelectorAll('div.grid cols-3, div.grid.cols-3')].map(div=>{
        const s = div.querySelector('select').value;
        const e = Math.max(1, parseInt(div.querySelector('input').value||'0',10));
        return {sku:s, expected:e, received:0};
      }).filter(x=>x.sku);
      const id = 'D-' + Date.now().toString().slice(-6);
      db.deliveries.push({id,to:to.value,supplier:supplier.value,lines,status:'Pending'});
      setDB(db); dlg.remove(); render();
    }},'Create'),
    el('button',{class:'btn ghost', onClick:()=>dlg.remove()},'Close')
  ]));
  mount.appendChild(dlg);
}

function receiveDelivery(db, id){
  const d = db.deliveries.find(x=>x.id===id);
  if(!d) return;
  const dlg = panelDialog('Receive ' + d.id);
  d.lines.forEach((l,idx)=>{
    const input = el('input',{class:'input', type:'number', min:'0', value:String(l.received||0)});
    input.addEventListener('change',()=>{ l.received = Math.max(0,parseInt(input.value||'0',10)); });
    dlg.appendChild(el('div',{class:'grid cols-3'},[ el('div',{},l.sku), el('div',{},`Expected ${l.expected}`), input ]));
  });
  dlg.appendChild(el('div',{class:'row'},[
    el('button',{class:'btn primary', onClick:()=>{
      d.lines.forEach(l=>{
        const diff = Math.max(0,(l.received||0));
        if(diff>0){
          addStock(db,l.sku,d.to,diff);
          addMovement(db,{type:'IN',sku:l.sku,qty:diff,to:d.to,ref:d.id});
        }
      });
      d.status='Checked';
      setDB(db); dlg.remove(); render();
    }},'Confirm'),
    el('button',{class:'btn ghost', onClick:()=>dlg.remove()},'Close')
  ]));
  app.appendChild(dlg);
}

function handleScanDelivery(db, data){
  try{
    const o = JSON.parse(data);
    if(o.docket){ const d=db.deliveries.find(x=>x.id===o.docket); alert(d?('Found docket '+o.docket):'Unknown docket '+o.docket); }
    else if(o.sku && o.location){ addStock(db,o.sku,o.location,1); addMovement(db,{type:'IN',sku:o.sku,qty:1,to:o.location,ref:'scan'}); setDB(db); render(); }
    else alert('Unsupported scan');
  }catch{ alert('Scanned: '+data); }
}

// ---------- Checkout ----------
function CheckoutView(db){
  const root = el('div',{class:'grid'});
  const panel = el('div',{class:'panel'},[
    el('div',{class:'grid cols-3'},[
      selectPeople(db,'Person','person'),
      selectItems(db,'Item','sku'),
      el('input',{class:'date', type:'date', id:'due'})
    ]),
    el('div',{class:'row'},[
      el('input',{class:'input', type:'number', min:'1', id:'qty', value:'1', placeholder:'Qty'}),
      el('button',{class:'btn primary', onClick:()=>{
        const p = panel.querySelector('#person').value;
        const s = panel.querySelector('#sku').value;
        const q = Math.max(1, parseInt(panel.querySelector('#qty').value||'0',10));
        const due = panel.querySelector('#due').value;
        if(!p||!s) return alert('Choose person & item');
        const loc = firstStockLocation(db,s);
        if(!loc) return alert('No stock for '+s);
        if(!takeStock(db,s,loc,q)) return alert('Not enough stock');
        const id = 'C-' + Date.now().toString().slice(-6);
        db.checkouts.push({id, personId:p, items:[{sku:s,qty:q}], due, status:'Out'});
        addMovement(db,{type:'CHECKOUT',sku:s,qty:q,from:loc,ref:id});
        setDB(db); render();
      }},'Assign')
    ])
  ]);
  root.appendChild(panel);
  const table = el('table',{class:'table'});
  table.innerHTML = `<thead><tr><th>ID</th><th>Person</th><th>Items</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector('tbody');
  db.checkouts.forEach(c=>{
    const items = c.items.map(it=>`${it.sku} × ${it.qty}`).join(' · ');
    const row = el('tr',{},[
      el('td',{},c.id), el('td',{},personName(db,c.personId)), el('td',{},items),
      el('td',{},c.due||'-'), el('td',{},el('span',{class:'badge'},c.status)),
      el('td',{},[
        el('button',{class:'btn small', onClick:()=>returnCheckout(db,c.id)},'Return'),
        el('button',{class:'btn small warn', onClick:()=>flagDamaged(db,c.id)},'Damaged')
      ])
    ]);
    tbody.appendChild(row);
  });
  root.appendChild(el('div',{class:'panel'},table));
  return root;
}

function returnCheckout(db,id){
  const c = db.checkouts.find(x=>x.id===id); if(!c) return;
  c.items.forEach(it=>{ addStock(db,it.sku,'Y1',it.qty); addMovement(db,{type:'CHECKIN',sku:it.sku,qty:it.qty,to:'Y1',ref:id}); });
  c.status='Returned'; setDB(db); render();
}
function flagDamaged(db,id){
  const c = db.checkouts.find(x=>x.id===id); if(!c) return;
  c.status='Damaged'; setDB(db); render();
}

// ---------- Maintenance ----------
function MaintenanceView(db){
  const root = el('div',{class:'grid'});
  root.appendChild(el('div',{class:'panel'},[
    el('div',{class:'row'},[
      el('button',{class:'btn', onClick:()=>alert('Inspections list coming soon')},'Inspections'),
      el('button',{class:'btn', onClick:()=>alert('Service planner coming soon')},'Service Planner'),
      el('button',{class:'btn', onClick:()=>uploadDoc()},'Upload MSDS')
    ])
  ]));
  const table = el('table',{class:'table'});
  table.innerHTML = `<thead><tr><th>Asset</th><th>Hours</th><th>Next Service</th><th>Last Inspection</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>Manitou MRT 2550</td><td>2210</td><td>250h due in 40h</td><td>Yesterday</td><td><span class="badge">OK</span></td></tr>
    <tr><td>Concrete Vibrator 38mm</td><td>120</td><td>Service Q4</td><td>2 weeks</td><td><span class="badge">OK</span></td></tr>
  </tbody>`;
  root.appendChild(el('div',{class:'panel'},table));
  return root;

  function uploadDoc(){
    const i = document.createElement('input');
    i.type = 'file'; i.onchange = ()=>alert('Document uploaded (demo)'); i.click();
  }
}

// ---------- Movements (audit log) ----------
function MovementsView(db){
  const root = el('div',{class:'grid'});
  const table = el('table',{class:'table'});
  table.innerHTML = `<thead><tr><th>Time</th><th>Type</th><th>SKU</th><th>Qty</th><th>From</th><th>To</th><th>Ref</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector('tbody');
  db.movements.slice().reverse().forEach(m=>{
    const row = el('tr',{},[
      el('td',{},new Date(m.ts).toLocaleString()),
      el('td',{},m.type),
      el('td',{},m.sku),
      el('td',{},String(m.qty)),
      el('td',{},m.from||'-'),
      el('td',{},m.to||'-'),
      el('td',{},m.ref||'-')
    ]);
    tbody.appendChild(row);
  });
  root.appendChild(el('div',{class:'panel'},table));
  return root;
}

// ---------- Shared helpers ----------
function kpis(db){
  const bySku = {}; db.stock.forEach(s=>bySku[s.sku]=(bySku[s.sku]||0)+s.qty);
  const sum = pred => Object.entries(bySku).filter(([sku])=>pred(sku)).reduce((a,[,v])=>a+v,0);
  const panels = sum(s=>/FRMX|TRIO/.test(s));
  const props = bySku['PROP-3.0']||0;
  const rods = bySku['TIEROD-15-17']||0;
  const machines = sum(s=>/PLANT-/.test(s));
  const box = el('div',{class:'kpis'},[
    kpi('Panels on hand', panels),
    kpi('Props', props),
    kpi('Tie rods', rods),
    kpi('Machines', machines)
  ]);
  return box;
}
function kpi(label,value){ return el('div',{class:'kpi'},[el('div',{class:'label'},label),el('div',{class:'value'},String(value))]); }

function selectSites(db, placeholder, id){ const s = el('select',{class:'select', id}); s.appendChild(el('option',{value:''},placeholder)); db.sites.forEach(x=>s.appendChild(el('option',{value:x.id},x.name))); return s; }
function selectItems(db, placeholder, id){ const s = el('select',{class:'select', id}); s.appendChild(el('option',{value:''},placeholder)); db.items.forEach(x=>s.appendChild(el('option',{value:x.sku},`${x.sku} — ${x.name}`))); return s; }
function selectPeople(db, placeholder, id){ const s = el('select',{class:'select', id}); s.appendChild(el('option',{value:''},placeholder)); db.people.forEach(x=>s.appendChild(el('option',{value:x.id},x.name))); return s; }
function siteName(db, id){ return db.sites.find(s=>s.id===id)?.name||id; }
function personName(db, id){ return db.people.find(p=>p.id===id)?.name||id; }

function openQrLabel(payload){
  const dlg = panelDialog('QR Label');
  const canvas = el('canvas',{width:'180', height:'180'});
  dlg.appendChild(canvas);
  dlg.appendChild(el('div',{class:'small'},JSON.stringify(payload)));
  dlg.appendChild(el('div',{class:'row'},[ el('button',{class:'btn ghost', onClick:()=>window.print()},'Print'), el('button',{class:'btn', onClick:()=>dlg.remove()},'Close') ]));
  app.prepend(dlg);
  // eslint-disable-next-line no-undef
  QRCode.toCanvas(canvas, JSON.stringify(payload), {width:180}, err=>{ if(err) console.error(err); });
}

function openScanner(onResult){
  const dlg = panelDialog('Scanner');
  const div = el('div',{id:'reader'});
  const log = el('pre',{class:'code'},'Waiting for camera...');
  dlg.appendChild(div); dlg.appendChild(log);
  dlg.appendChild(el('div',{class:'row'},[ el('button',{class:'btn ghost', onClick:stop},'Close') ]));
  app.prepend(dlg);
  // eslint-disable-next-line no-undef
  const h = new Html5Qrcode('reader');
  const config = { fps:10, qrbox:250, rememberLastUsedCamera:true };
  function success(text){ log.textContent = 'Scanned: '+text; try{ onResult(text); }catch(e){ console.error(e); } }
  function failure(){}
  Html5Qrcode.getCameras().then(()=> h.start({facingMode:'environment'}, config, success, failure)).catch(e=> log.textContent='Camera error: '+e);
  function stop(){ try{ h.stop().then(()=>h.clear()); }catch{} dlg.remove(); }
}

function printTransferQr(tr){ openQrLabel({transfer:tr.id}); }
function printDeliveryQr(d){ openQrLabel({docket:d.id}); }

function panelDialog(title){
  const d = el('div',{class:'panel'});
  d.appendChild(el('div',{class:'row'},[ el('strong',{},title), el('button',{class:'btn ghost', onClick:()=>d.remove()},'×') ]));
  return d;
}

function downloadCSV(filename, rows){
  const csv = rows.map(r=>r.map(cell=>{
    const s = String(cell).replace(/"/g,'""');
    return /,|\n/.test(s) ? `"${s}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Stock operations + movements
function firstStockLocation(db, sku){
  const hit = db.stock.find(s=>s.sku===sku && s.qty>0);
  return hit && hit.location;
}
function addStock(db, sku, loc, qty){
  const i = db.stock.findIndex(s=>s.sku===sku && s.location===loc);
  if(i>=0) db.stock[i].qty += qty; else db.stock.push({sku, location:loc, qty});
  setDB(db);
}
function takeStock(db, sku, loc, qty){
  const i = db.stock.findIndex(s=>s.sku===sku && s.location===loc);
  if(i<0 || db.stock[i].qty<qty) return false;
  db.stock[i].qty -= qty; setDB(db); return true;
}
function moveStock(db, sku, from, to, qty, ref){
  if(!takeStock(db, sku, from, qty)) return false;
  addStock(db, sku, to, qty);
  addMovement(db,{type:'TRANSFER',sku,qty,from,to,ref});
  return true;
}
function addMovement(db, m){
  db.movements.push({ts:Date.now(), ...m});
  setDB(db);
}

// Self-tests
(function tests(){
  try{
    const db = ensureDB();
    const total = db.stock.reduce((a,b)=>a+b.qty,0);
    console.assert(total>0, 'stock should not be empty');
    console.log('[FOPS] self-tests OK');
  }catch(e){ console.warn('[FOPS] tests failed', e); }
})();
