import path from "node:path";

export const PORT = Number(process.env.PORT ?? 8080);
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
export const FIXTURES_DIR = path.resolve(process.env.FIXTURES_DIR ?? "./fixtures");
export const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR ?? "./public");
