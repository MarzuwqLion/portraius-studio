// Adapters for models whose milestone hasn't come yet. Building a body throws,
// so nothing can reach Router with a half-made request.
export function notBuilt(model: string, milestone: string): never {
  throw new Error(`The ${model} adapter is built in ${milestone}.`);
}
