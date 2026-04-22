const { Pool } = require("pg");
require("dotenv").config({ quiet: true });

let pool = null;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const error = new Error(
      "DATABASE_URL belum diset. Set environment variable DATABASE_URL di Vercel / .env untuk lokal."
    );
    error.code = "MISSING_DATABASE_URL";
    throw error;
  }

  pool = new Pool({ connectionString });
  pool.on("error", (error) => {
    console.error("Koneksi database bermasalah:", error);
  });

  return pool;
}

function toNullable(value) {
  return value ? value : null;
}

async function ensureRecommendationSchema() {
  const schemaLockId = 284902149; // arbitrary stable lock id for this project
  const client = await getPool().connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [schemaLockId]);

    try {
      await client.query("BEGIN");

      await client.query(`
        DO $$
        BEGIN
          CREATE TYPE price_category AS ENUM ('murah', 'standard', 'mahal');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS rekomendasi (
          id SERIAL PRIMARY KEY,
          nama_tempat VARCHAR(255) NOT NULL,
          nama_menu VARCHAR(255),
          price DECIMAL(10, 2),
          deskripsi TEXT,
          kategori price_category,
          google_maps_link TEXT,
          foto_url TEXT,
          created_by VARCHAR(100),
          likes INTEGER DEFAULT 0,
          tanggal_input TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        ALTER TABLE rekomendasi
        ADD COLUMN IF NOT EXISTS nama_menu VARCHAR(255),
        ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS deskripsi TEXT,
        ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
        ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
      `);

      const kategoriColumn = await client.query(`
        SELECT udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rekomendasi'
          AND column_name = 'kategori';
      `);

      if (
        kategoriColumn.rowCount > 0 &&
        kategoriColumn.rows[0].udt_name !== "price_category"
      ) {
        await client.query(`
          ALTER TABLE rekomendasi
          ALTER COLUMN kategori TYPE price_category
          USING (
            CASE
              WHEN kategori::text IN ('murah', 'standard', 'mahal')
                THEN kategori::text::price_category
              ELSE NULL
            END
          );
        `);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [schemaLockId]);
    }
  } finally {
    client.release();
  }
}

async function getRecommendations() {
  const result = await getPool().query(`
    SELECT
      id,
      nama_tempat,
      nama_menu,
      price,
      deskripsi,
      kategori,
      google_maps_link,
      foto_url,
      created_by,
      likes,
      tanggal_input
    FROM rekomendasi
    ORDER BY tanggal_input DESC, id DESC;
  `);

  return result.rows;
}

async function createRecommendation(data) {
  const values = [
    data.nama_tempat,
    toNullable(data.nama_menu),
    toNullable(data.price),
    toNullable(data.deskripsi),
    data.kategori,
    toNullable(data.google_maps_link),
    toNullable(data.foto_url),
    toNullable(data.created_by),
  ];

  const result = await getPool().query(
    `
      INSERT INTO rekomendasi (
        nama_tempat,
        nama_menu,
        price,
        deskripsi,
        kategori,
        google_maps_link,
        foto_url,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5::price_category, $6, $7, $8)
      RETURNING
        id,
        nama_tempat,
        nama_menu,
        price,
        deskripsi,
        kategori,
        google_maps_link,
        foto_url,
        created_by,
        tanggal_input;
    `,
    values
  );

  return result.rows[0];
}

async function updateLikes(id) {
  const result = await getPool().query(
    `UPDATE rekomendasi SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING likes;`,
    [id]
  );
  return result.rows[0];
}

module.exports = {
  ensureRecommendationSchema,
  getRecommendations,
  createRecommendation,
  updateLikes,
};
