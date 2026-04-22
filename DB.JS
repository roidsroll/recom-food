const { Pool } = require("pg");
require("dotenv").config({ quiet: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error("Koneksi database bermasalah:", error);
});

function toNullable(value) {
  return value ? value : null;
}

async function ensureRecommendationSchema() {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'price_category'
      ) THEN
        CREATE TYPE price_category AS ENUM ('murah', 'standard', 'mahal');
      END IF;
    END $$;
  `);

  await pool.query(`
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

  await pool.query(`
    ALTER TABLE rekomendasi
    ADD COLUMN IF NOT EXISTS nama_menu VARCHAR(255),
    ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS deskripsi TEXT,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
  `);

  const kategoriColumn = await pool.query(`
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rekomendasi'
      AND column_name = 'kategori';
  `);

  if (kategoriColumn.rowCount > 0 && kategoriColumn.rows[0].udt_name !== "price_category") {
    await pool.query(`
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
}

async function getRecommendations() {
  const result = await pool.query(`
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

  const result = await pool.query(
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
  const result = await pool.query(
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
