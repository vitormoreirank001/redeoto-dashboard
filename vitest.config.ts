import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config própria dos testes: não carrega o plugin do Lovable/Nitro do
// vite.config.ts, só resolve o alias "@/" e roda as funções puras em Node.
// Fuso fixo da clínica: os bugs de "dia trocado depois das 21h" só aparecem
// em UTC-3, então os testes precisam rodar nele em qualquer máquina.
process.env.TZ = "America/Fortaleza";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
