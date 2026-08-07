import { z } from "zod";

export const tableTokenSchema = z
  .string()
  .trim()
  .min(8, "Минимум 8 символов")
  .max(160, "Максимум 160 символов")
  .regex(
    /^[A-Za-z0-9._~-]+$/,
    "Используйте латинские буквы, цифры, точку, дефис или подчёркивание",
  );
