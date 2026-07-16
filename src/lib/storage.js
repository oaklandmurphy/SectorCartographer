// Personal, per-device storage.
//
// The split this file used to hold — shared data in Firebase, personal data in
// localStorage — now lives on the other side of the line: everything shared is
// in lib/sectorRepo.js, keyed per entity. What's left is the personal half, the
// edit code *this* browser knows, which never leaves the device.
export const storage = {
  get(key) {
    const raw = localStorage.getItem(key);
    return raw === null ? null : { value: raw };
  },
  set(key, value) {
    localStorage.setItem(key, value);
    return true;
  },
  remove(key) {
    localStorage.removeItem(key);
    return true;
  },
};
