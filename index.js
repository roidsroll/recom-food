const path = require("path");
const express = require("express");
require("dotenv").config({ quiet: true });

const {
  ensureRecommendationSchema,
  getRecommendations,
  createRecommendation,
  updateLikes,
} = require("./DB.JS");

const app = express();

// Middleware Content Security Policy (CSP)
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: blob: *; " + // Mengizinkan semua URL gambar
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com;"
  );
  next();
});

const PORT = Number(process.env.PORT) || 3000;
const PRICE_CATEGORIES = ["murah", "standard", "mahal"];

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function formatDate(dateValue) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function normalizeFormData(body = {}) {
  return {
    nama_tempat: (body.nama_tempat || "").trim(),
    nama_menu: (body.nama_menu || "").trim(),
    price: (body.price || "").trim(),
    deskripsi: (body.deskripsi || "").trim(),
    kategori: (body.kategori || "").trim().toLowerCase(),
    google_maps_link: (body.google_maps_link || "").trim(),
    foto_url: (body.foto_url || "").trim(),
    created_by: (body.created_by || "").trim(),
  };
}

function isValidUrl(value) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function validateFormData(formData) {
  if (!formData.nama_tempat) {
    return "Nama tempat wajib diisi.";
  }

  if (!formData.kategori || !PRICE_CATEGORIES.includes(formData.kategori)) {
    return "Kategori wajib dipilih: murah, standard, atau mahal.";
  }

  if (!formData.google_maps_link) {
    return "Link Google Maps wajib diisi.";
  }

  if (formData.price) {
    const numericPrice = Number(formData.price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return "Harga harus berupa angka yang valid.";
    }
  }

  if (!isValidUrl(formData.google_maps_link)) {
    return "Link Google Maps harus berupa URL yang valid.";
  }

  if (!isValidUrl(formData.foto_url)) {
    return "Link foto harus berupa URL yang valid.";
  }

  return "";
}

async function renderHome(res, options = {}) {
  const recommendations = await getRecommendations();
  const filterCategory = options.filterCategory || "semua";

  const filteredRecommendations = recommendations.filter((item) => {
    if (filterCategory === "semua") {
      return true;
    }
    return item.kategori === filterCategory;
  });

  const mappedRecommendations = filteredRecommendations.map((item) => ({
    ...item,
    formatted_date: formatDate(item.tanggal_input),
    formatted_price: formatCurrency(item.price),
    has_image: Boolean(item.foto_url),
  }));

  res.status(options.status || 200).render("index", {
    recommendations: mappedRecommendations,
    totalRecommendations: mappedRecommendations.length,
    success: options.success || false,
    error: options.error || "",
    shouldOpenForm: options.shouldOpenForm || false,
    priceCategories: PRICE_CATEGORIES,
    activeCategory: filterCategory,
    formData: options.formData || {
      nama_tempat: "",
      nama_menu: "",
      price: "",
      deskripsi: "",
      kategori: "",
      google_maps_link: "",
      foto_url: "",
      created_by: "",
    },
  });
}

app.get("/", async (req, res) => {
  try {
    const category = (req.query.category || "semua").toLowerCase();
    await renderHome(res, { 
      success: req.query.success === "1",
      filterCategory: category
    });
  } catch (error) {
    console.error("Gagal menampilkan halaman:", error);
    res.status(500).send("Terjadi kesalahan saat memuat halaman.");
  }
});

// ROUTE LIKE HARUS DI ATAS /REKOMENDASI UMUM JIKA ADA POTENSI KONFLIK
app.post("/rekomendasi/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await updateLikes(id);
    res.json({ success: true, likes: result.likes });
  } catch (error) {
    console.error("Gagal update likes:", error);
    res.status(500).json({ success: false, error: "Gagal memproses like." });
  }
});

app.post("/rekomendasi", async (req, res) => {
  const formData = normalizeFormData(req.body);
  const validationError = validateFormData(formData);

  if (validationError) {
    try {
      await renderHome(res, {
        status: 400,
        error: validationError,
        formData,
        shouldOpenForm: true,
      });
    } catch (error) {
      console.error("Gagal merender validasi:", error);
      res.status(400).send(validationError);
    }
    return;
  }

  try {
    await createRecommendation(formData);
    res.redirect("/?success=1");
  } catch (error) {
    console.error("Gagal menyimpan rekomendasi:", error);

    try {
      await renderHome(res, {
        status: 500,
        error: "Data belum berhasil disimpan. Coba lagi sebentar.",
        formData,
        shouldOpenForm: true,
      });
    } catch (renderError) {
      console.error("Gagal merender error penyimpanan:", renderError);
      res.status(500).send("Data belum berhasil disimpan.");
    }
  }
});

async function start() {
  try {
    await ensureRecommendationSchema();
    app.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Gagal menyalakan aplikasi:", error);
    process.exit(1);
  }
}

start();
