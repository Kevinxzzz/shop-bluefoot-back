import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  generateSlug,
  createCategory,
  listCategories,
  updateCategory,
  archiveCategory,
  restoreCategory,
  deleteCategoryPermanently,
} from "./category.service.js";
import { prisma } from "../../shared/database/prisma.js";
import {
  createCategorySchema,
  updateCategorySchema,
  queryCategorySchema,
} from "./category.schema.js";

describe("Category Module", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("Slug Generator", () => {
    it("deve normalizar caracteres especiais, acentos e espaços", () => {
      expect(generateSlug("Camisetas & Calças - Verão 2026!")).toBe(
        "camisetas-calcas-verao-2026"
      );
      expect(generateSlug("   Eletrônicos & Acessórios   ")).toBe(
        "eletronicos-acessorios"
      );
    });
  });

  describe("Zod Schemas", () => {
    it("deve validar payload de criação de categoria", () => {
      const valid = createCategorySchema.safeParse({ name: "Vestuário" });
      expect(valid.success).toBe(true);

      const emptyName = createCategorySchema.safeParse({ name: "" });
      expect(emptyName.success).toBe(false);
    });

    it("deve validar query parameters com defaults", () => {
      const parsed = queryCategorySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(50);
      expect(parsed.status).toBe("ACTIVE");
    });
  });

  describe("createCategory", () => {
    it("1. deve criar uma nova categoria com sucesso", async () => {
      jest.spyOn(prisma.category, "findUnique").mockResolvedValue(null as any);
      jest.spyOn(prisma.category, "create").mockResolvedValue({
        id: "cat-1",
        name: "Roupas",
        slug: "roupas",
        enterpriseId: "ent-1",
      } as any);

      const result = await createCategory("ent-1", { name: "Roupas" });

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: {
          enterpriseId_slug: {
            enterpriseId: "ent-1",
            slug: "roupas",
          },
        },
      });
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: "Roupas",
          slug: "roupas",
          enterpriseId: "ent-1",
        },
      });
      expect(result.id).toBe("cat-1");
    });

    it("2. deve restaurar categoria se ela já existia porém soft-deleted", async () => {
      jest.spyOn(prisma.category, "findUnique").mockResolvedValue({
        id: "cat-1",
        name: "Roupas Antigas",
        slug: "roupas",
        deletedAt: new Date(),
      } as any);
      jest.spyOn(prisma.category, "update").mockResolvedValue({
        id: "cat-1",
        name: "Roupas",
        slug: "roupas",
        deletedAt: null,
      } as any);

      const result = await createCategory("ent-1", { name: "Roupas" });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: { name: "Roupas", deletedAt: null },
      });
      expect(result.deletedAt).toBeNull();
    });

    it("3. deve lançar erro se categoria com mesmo slug já estiver ativa", async () => {
      jest.spyOn(prisma.category, "findUnique").mockResolvedValue({
        id: "cat-1",
        name: "Roupas",
        slug: "roupas",
        deletedAt: null,
      } as any);

      await expect(
        createCategory("ent-1", { name: "Roupas" })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Categoria já existe",
      });
    });
  });

  describe("listCategories", () => {
    it("4. deve listar categorias formatadas e retornar metadados de paginação", async () => {
      const mockCategories = [
        {
          id: "cat-1",
          name: "Calçados",
          slug: "calcados",
          deletedAt: null,
          _count: { products: 3 },
        },
      ];

      jest.spyOn(prisma.category, "findMany").mockResolvedValue(mockCategories as any);
      jest.spyOn(prisma.category, "count").mockResolvedValue(1 as any);

      const result = await listCategories("ent-1", {
        page: 1,
        limit: 10,
        status: "ACTIVE",
      });

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { enterpriseId: "ent-1", deletedAt: null },
          skip: 0,
          take: 10,
        })
      );
      expect(result.data).toEqual([
        {
          id: "cat-1",
          name: "Calçados",
          slug: "calcados",
          status: "ACTIVE",
          deletedAt: null,
          productsCount: 3,
        },
      ]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe("updateCategory", () => {
    it("5. deve atualizar categoria com sucesso", async () => {
      jest.spyOn(prisma.category, "findFirst").mockResolvedValue({
        id: "cat-1",
        name: "Nome Antigo",
        slug: "nome-antigo",
        deletedAt: null,
      } as any);
      jest.spyOn(prisma.category, "findUnique").mockResolvedValue(null as any);
      jest.spyOn(prisma.category, "update").mockResolvedValue({
        id: "cat-1",
        name: "Nome Novo",
        slug: "nome-novo",
      } as any);

      const result = await updateCategory("cat-1", "ent-1", {
        name: "Nome Novo",
      });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: { name: "Nome Novo", slug: "nome-novo" },
      });
      expect(result.name).toBe("Nome Novo");
    });

    it("6. deve lançar 404 se categoria não existir na empresa", async () => {
      jest.spyOn(prisma.category, "findFirst").mockResolvedValue(null as any);

      await expect(
        updateCategory("cat-999", "ent-1", { name: "Novo" })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Categoria não encontrada",
      });
    });

    it("7. deve impedir atualização se categoria estiver na lixeira", async () => {
      jest.spyOn(prisma.category, "findFirst").mockResolvedValue({
        id: "cat-1",
        name: "Arquivada",
        deletedAt: new Date(),
      } as any);

      await expect(
        updateCategory("cat-1", "ent-1", { name: "Novo" })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Categoria está na lixeira",
      });
    });
  });

  describe("archiveCategory", () => {
    it("8. deve arquivar categoria sem produtos vinculados", async () => {
      jest.spyOn(prisma.category, "findFirst").mockResolvedValue({
        id: "cat-1",
        enterpriseId: "ent-1",
        deletedAt: null,
      } as any);
      jest.spyOn(prisma.productCategory, "count").mockResolvedValue(0 as any);
      jest.spyOn(prisma.category, "update").mockResolvedValue({ id: "cat-1" } as any);

      const result = await archiveCategory("cat-1", "ent-1");

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result.message).toBe("Categoria arquivada com sucesso");
    });

    it("9. deve impedir arquivamento se categoria tiver produtos ativos vinculados", async () => {
      jest.spyOn(prisma.category, "findFirst").mockResolvedValue({
        id: "cat-1",
        enterpriseId: "ent-1",
        deletedAt: null,
      } as any);
      jest.spyOn(prisma.productCategory, "count").mockResolvedValue(2 as any);

      await expect(archiveCategory("cat-1", "ent-1")).rejects.toMatchObject({
        statusCode: 409,
        message: "Categoria possui produtos vinculados",
      });
    });
  });

  describe("restoreCategory", () => {
    it("10. deve restaurar categoria arquivada", async () => {
      jest
        .spyOn(prisma.category, "findFirst")
        .mockResolvedValueOnce({
          id: "cat-1",
          enterpriseId: "ent-1",
          slug: "calcados",
          deletedAt: new Date(),
        } as any)
        .mockResolvedValueOnce(null as any); // Nenhum conflito ativo de slug

      jest.spyOn(prisma.category, "update").mockResolvedValue({
        id: "cat-1",
        deletedAt: null,
      } as any);

      const result = await restoreCategory("cat-1", "ent-1");

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: { deletedAt: null },
      });
      expect(result.message).toBe("Categoria restaurada com sucesso");
    });

    it("11. deve impedir restauração se já houver categoria ativa com o mesmo slug", async () => {
      jest
        .spyOn(prisma.category, "findFirst")
        .mockResolvedValueOnce({
          id: "cat-1",
          enterpriseId: "ent-1",
          slug: "calcados",
          deletedAt: new Date(),
        } as any)
        .mockResolvedValueOnce({
          id: "cat-2",
          slug: "calcados",
          deletedAt: null,
        } as any);

      await expect(restoreCategory("cat-1", "ent-1")).rejects.toMatchObject({
        statusCode: 409,
        message:
          "Não é possível restaurar: já existe uma categoria ativa com este nome/slug.",
      });
    });
  });

  describe("deleteCategoryPermanently", () => {
    it("12. deve excluir permanentemente se estiver arquivada e sem produtos", async () => {
      jest.spyOn(prisma.category, "findFirst").mockResolvedValue({
        id: "cat-1",
        enterpriseId: "ent-1",
        deletedAt: new Date(),
      } as any);
      jest.spyOn(prisma.productCategory, "count").mockResolvedValue(0 as any);
      jest.spyOn(prisma.category, "delete").mockResolvedValue({ id: "cat-1" } as any);

      const result = await deleteCategoryPermanently("cat-1", "ent-1");

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: "cat-1" },
      });
      expect(result.message).toBe("Categoria removida permanentemente");
    });

    it("13. deve impedir exclusão permanente se a categoria não estiver arquivada", async () => {
      jest.spyOn(prisma.category, "findFirst").mockResolvedValue({
        id: "cat-1",
        enterpriseId: "ent-1",
        deletedAt: null,
      } as any);

      await expect(
        deleteCategoryPermanently("cat-1", "ent-1")
      ).rejects.toMatchObject({
        statusCode: 400,
        message:
          "A categoria deve estar arquivada para ser excluída permanentemente",
      });
    });
  });
});
