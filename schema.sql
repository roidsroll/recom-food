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
    tanggal_input TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
