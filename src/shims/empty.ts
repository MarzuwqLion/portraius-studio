// Stand-in for node:fs, node:fs/promises, node:path, node:stream and
// node:stream/promises. Only the SDK's Cloud client uses them, and the app
// never imports that client, so these names exist only to satisfy the bundler.
const unavailable = (name: string) => () => {
  throw new Error(`${name} is not available in the browser`);
};

export const createReadStream = unavailable("createReadStream");
export const createWriteStream = unavailable("createWriteStream");
export const readFile = unavailable("readFile");
export const basename = unavailable("basename");
export const extname = unavailable("extname");
export const pipeline = unavailable("pipeline");
export class Readable {
  static fromWeb = unavailable("Readable.fromWeb");
  static toWeb = unavailable("Readable.toWeb");
}

export default {};
