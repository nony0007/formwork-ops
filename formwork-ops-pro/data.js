// Persistent local DB with schema + seed
export const SEED = {
  version: 1,
  sites: [
    { id: "Y1", name: "Main Yard Celbridge", type: "Yard" },
    { id: "S1", name: "M50 Interchange", type: "Site" },
    { id: "S2", name: "Limerick Hospital Wing", type: "Site" }
  ],
  people: [
    { id: "P1", name: "Alex Popescu", trade: "Carpenter" },
    { id: "P2", name: "Maria Ionescu", trade: "Steel Fixer" },
    { id: "P3", name: "Sean O'Connor", trade: "Concrete" }
  ],
  items: [
    { sku: "DK-FRMX-090x270", name: "Doka Framax 0.90 x 2.70 m", unit: "panel", category: "Doka Framax Xlife Panels" },
    { sku: "DK-FRMX-120x270", name: "Doka Framax 1.20 x 2.70 m", unit: "panel", category: "Doka Framax Xlife Panels" },
    { sku: "PR-TRIO-090x270", name: "PERI TRIO 0.90 x 2.70 m", unit: "panel", category: "Peri TRIO Panels" },
    { sku: "H20-3.9", name: "H20 Beam 3.90 m", unit: "beam", category: "Doka H20 Beams" },
    { sku: "GT24-5.9", name: "PERI GT24 5.90 m", unit: "beam", category: "Peri VARIO GT24 Beams" },
    { sku: "TIEROD-15-17", name: "Tie Rod 15/17", unit: "rod", category: "Tie Rods 15/17" },
    { sku: "WINGNUT-17", name: "Wing Nut 17", unit: "piece", category: "Wing Nuts & Clips" },
    { sku: "PROP-3.0", name: "Adjustable Prop 1.8–3.0 m", unit: "prop", category: "Scaff Props" },
    { sku: "CHEM-RELEASE-20L", name: "Release Agent 20L", unit: "drum", category: "Chemicals" },
    { sku: "PPE-HELMET", name: "Hard Hat", unit: "piece", category: "PPE" },
    { sku: "TOOL-VIB-38", name: "Concrete Poker 38mm", unit: "tool", category: "Small Tools" },
    { sku: "PLANT-MANITOU-2550", name: "Manitou MRT 2550", unit: "machine", category: "Heavy Plant" }
  ],
  stock: [
    { sku: "DK-FRMX-120x270", location: "Y1", qty: 120 },
    { sku: "DK-FRMX-120x270", location: "S1", qty: 22 },
    { sku: "PR-TRIO-090x270", location: "Y1", qty: 40 },
    { sku: "H20-3.9", location: "Y1", qty: 200 },
    { sku: "H20-3.9", location: "S2", qty: 60 },
    { sku: "TIEROD-15-17", location: "Y1", qty: 900 },
    { sku: "WINGNUT-17", location: "Y1", qty: 1200 },
    { sku: "PROP-3.0", location: "Y1", qty: 80 },
    { sku: "CHEM-RELEASE-20L", location: "Y1", qty: 20 },
    { sku: "PPE-HELMET", location: "Y1", qty: 100 },
    { sku: "TOOL-VIB-38", location: "Y1", qty: 6 },
    { sku: "PLANT-MANITOU-2550", location: "Y1", qty: 1 }
  ],
  transfers: [],
  deliveries: [],
  checkouts: [],
  movements: []
};

const KEY = "fops.db";
export function getDB(){ try{ return JSON.parse(localStorage.getItem(KEY)); }catch{return null;} }
export function setDB(db){ localStorage.setItem(KEY, JSON.stringify(db)); }
export function ensureDB(){
  let db = getDB();
  if(!db){ db = structuredClone(SEED); setDB(db); }
  return db;
}
export function backupDB(){
  const db = ensureDB();
  const blob = new Blob([JSON.stringify(db,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='formwork-ops-backup.json'; a.click();
  URL.revokeObjectURL(url);
}
export function restoreDB(file, cb){
  const r = new FileReader();
  r.onload = ()=>{
    try{ const obj = JSON.parse(r.result); if(obj && obj.version>=1){ localStorage.setItem(KEY, JSON.stringify(obj)); cb(true); } else cb(false); }
    catch{ cb(false); }
  };
  r.readAsText(file);
}
export function resetDB(){ localStorage.removeItem(KEY); }
