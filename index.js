const { app, ensureSchemaReady } = require("./app");

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  try {
    await ensureSchemaReady();
    app.listen(PORT, () => {
      console.log(`Server berjalan di http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Gagal menyalakan aplikasi:", error);
    process.exitCode = 1;
  }
}

start();
