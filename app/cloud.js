// Firestore sync. Loaded only when sync is configured, so "this device only" mode stays light.
import { COLLS } from './store.js';

export async function startCloud(config, tripKey, store) {
  const fb = await import('../vendor/firebase.js');
  const app = fb.initializeApp(config);
  const auth = fb.getAuth(app);

  let db;
  try {
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentSingleTabManager() }) });
  } catch (e) {
    db = fb.initializeFirestore(app, { localCache: fb.memoryLocalCache() });
  }

  // Anonymous sign-in. The first run needs a connection; after that the session is cached on the device.
  await new Promise((resolve) => {
    let started = false;
    fb.onAuthStateChanged(auth, (user) => {
      if (user) { resolve(user); return; }
      if (!started) {
        started = true;
        fb.signInAnonymously(auth).catch((err) => {
          store._status('error', err && err.code === 'auth/operation-not-allowed'
            ? 'Anonymous sign-in is not enabled in Firebase'
            : 'Can’t reach the sync service — showing saved data');
        });
      }
    });
  });

  const tripRef = fb.doc(db, 'trips', tripKey);
  let fromCache = true;

  const onError = (err) => {
    const denied = err && err.code === 'permission-denied';
    store._status('error', denied ? 'Trip key not accepted — check the key and the Firestore rules' : 'Sync error: ' + (err && err.message));
  };

  for (const coll of COLLS) {
    fb.onSnapshot(fb.collection(tripRef, coll), { includeMetadataChanges: true }, (snap) => {
      const changes = snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id, data: c.doc.data() }));
      store._applyChanges(coll, changes);
      if (snap.metadata.fromCache !== fromCache) {
        fromCache = snap.metadata.fromCache;
      }
      store._status(fromCache ? 'offline' : 'synced', fromCache ? 'Offline — showing saved data' : 'Synced');
    }, onError);
  }
  fb.onSnapshot(tripRef, (snap) => store._applyMeta(snap.exists() ? snap.data() : {}), onError);

  return {
    write(coll, id, data) {
      fb.setDoc(fb.doc(tripRef, coll, id), data).catch(onError);
    },
    remove(coll, id) {
      fb.deleteDoc(fb.doc(tripRef, coll, id)).catch(onError);
    },
    writeMeta(meta) {
      fb.setDoc(tripRef, meta, { merge: true }).catch(onError);
    },
  };
}
