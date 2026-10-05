import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const source = path.resolve("migrations");
const destination = path.resolve("dist/migrations");
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
