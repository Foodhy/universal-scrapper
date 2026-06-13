// IndexedDB wrapper for Universal Scraper
const DB_NAME = 'UniversalScraperDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('scrapes')) {
        const store = db.createObjectStore('scrapes', { keyPath: 'id', autoIncrement: true });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('templates')) {
        const store = db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveScrape(scrapeData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scrapes', 'readwrite');
    const store = tx.objectStore('scrapes');
    const record = {
      ...scrapeData,
      timestamp: new Date().toISOString(),
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function getAllScrapes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scrapes', 'readonly');
    const store = tx.objectStore('scrapes');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function getScrape(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scrapes', 'readonly');
    const store = tx.objectStore('scrapes');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function deleteScrape(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scrapes', 'readwrite');
    const store = tx.objectStore('scrapes');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveTemplate(template) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readwrite');
    const store = tx.objectStore('templates');
    const req = store.add(template);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function getAllTemplates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readonly');
    const store = tx.objectStore('templates');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Export for ES module (service worker) and script tag (sidepanel)
if (typeof globalThis.__uniScraperDB === 'undefined') {
  globalThis.__uniScraperDB = {
    openDB, saveScrape, getAllScrapes, getScrape, deleteScrape, saveTemplate, getAllTemplates,
  };
}
