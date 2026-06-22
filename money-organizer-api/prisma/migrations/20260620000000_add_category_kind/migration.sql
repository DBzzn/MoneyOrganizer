CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME', 'BOTH');

ALTER TABLE "Category"
ADD COLUMN "kind" "CategoryKind" NOT NULL DEFAULT 'BOTH';

UPDATE "Category"
SET "kind" = 'EXPENSE'
WHERE lower("name") IN (
  'alimentação',
  'alimentacao',
  'transporte',
  'moradia',
  'saúde',
  'saude',
  'lazer'
);

UPDATE "Category"
SET "kind" = 'INCOME'
WHERE lower("name") IN (
  'salário',
  'salario'
);
