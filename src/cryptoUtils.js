/**
 * Web Crypto Utility for End-to-End Encryption (E2EE)
 */

const DB_NAME = 'PulxoCryptoDB';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const storeKey = async (key, name) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(key, name);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getKey = async (name) => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.get(name);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const generateAndStoreKeyPair = async (userId) => {
  // Check if we already have it
  const existingPrivateKey = await getKey(`${userId}_private`);
  if (existingPrivateKey) {
    const pub = await getKey(`${userId}_public_jwk`);
    return pub;
  }

  // Generate ECDH P-256 Key Pair
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  // Store Private Key (opaque)
  await storeKey(keyPair.privateKey, `${userId}_private`);

  // Export and Store Public Key as JWK
  const publicJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  await storeKey(publicJwk, `${userId}_public_jwk`);

  return publicJwk;
};

export const deriveSharedSecret = async (myUserId, theirPublicJwk) => {
  const myPrivateKey = await getKey(`${myUserId}_private`);
  if (!myPrivateKey) throw new Error("Private key not found");

  const theirPublicKey = await window.crypto.subtle.importKey(
    "jwk",
    theirPublicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  return await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    256
  );
};

export const encryptMessageE2EE = async (sharedSecret, text) => {
  const enc = new TextEncoder();
  const encoded = enc.encode(text);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const key = await window.crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoded
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
};

export const decryptMessageE2EE = async (sharedSecret, encryptedData) => {
  try {
    const iv = new Uint8Array(atob(encryptedData.iv).split("").map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(encryptedData.ciphertext).split("").map(c => c.charCodeAt(0)));

    const key = await window.crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return "[Decryption Error]";
  }
};
