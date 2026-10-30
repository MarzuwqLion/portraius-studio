// Example characters anyone can add to their vault: .portraius files in
// public/examples/, each with its thumbnail beside it. Adding one
// goes through the same import as a file the visitor picks.
import { readImport, type PendingImport } from "./manage";

export interface ExampleCharacter {
  id: string; // character.json's id, so an example already in the vault isn't offered again
  slug: string;
  name: string;
  note: string;
}

export const EXAMPLE_CHARACTERS: readonly ExampleCharacter[] = [
  { id: "a59ebd49-e939-4102-8f66-ae2157f69557", slug: "marzuwq", name: "Marzuwq", note: "Made from photos, with consent on file" },
  { id: "b0bf9aa1-ed3a-4fe6-8de6-4b434a19ed64", slug: "priya", name: "Priya", note: "Designed, real-looking" },
  { id: "ec009582-edbb-405e-ac4c-7c7ec2475b5c", slug: "an-mei", name: "An'Mei", note: "Designed, animated" },
];

export const exampleFileUrl = (e: ExampleCharacter) => `${import.meta.env.BASE_URL}examples/${e.slug}.portraius`;
export const exampleThumbUrl = (e: ExampleCharacter) => `${import.meta.env.BASE_URL}examples/${e.slug}.jpg`;

export async function readExample(e: ExampleCharacter): Promise<PendingImport> {
  const res = await fetch(exampleFileUrl(e));
  if (!res.ok) throw new Error(`Couldn't load ${e.name} (${res.status}).`);
  return readImport(await res.blob());
}
