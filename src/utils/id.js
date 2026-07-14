let _id = 0;
export const uid = (p) => `${p}_${++_id}_${Math.random().toString(36).slice(2, 6)}`;
