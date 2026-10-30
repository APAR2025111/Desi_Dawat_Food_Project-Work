import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const databaseTls = process.env.DB_SSL === "true"
  ? {
      rejectUnauthorized: true,
      ...(process.env.DB_SSL_CA ? { ca: fs.readFileSync(process.env.DB_SSL_CA, "utf8") } : {}),
    }
  : undefined;

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "desi_dawat_menu",
  ...(databaseTls ? { ssl: databaseTls } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
