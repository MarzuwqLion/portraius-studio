// Loads the .env files Vite would use for a production build into process.env,
// so src/lib/config.ts sees the deployed site's settings under tsx. Import it
// before anything from src/.
import { loadEnv } from "vite";

Object.assign(process.env, loadEnv("production", process.cwd(), "VITE_"));
