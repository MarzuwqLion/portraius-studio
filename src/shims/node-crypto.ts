// The SDK's Router client imports node:crypto only for randomUUID.
export const randomUUID = () => globalThis.crypto.randomUUID();
