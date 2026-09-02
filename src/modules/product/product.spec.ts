import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { prisma } from "../../shared/database/prisma.js";
import {
  createProduct,
  getEnterpriseProductsPublic,
  getUserProducts,
  getPublicProductById,
  incrementProductView,
  updateProduct,
  deleteProduct,
} from "./product.service.js";
import { getAuthorizedProduct } from "./product.authorization.js";
import { s3 } from "../../shared/config/s3.js";
import {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
  updateProductMediaSchema,
} from "./product.schema.js";

describe("Product Module", () => {
  const mockEnterpriseId = "ent-123";
  const mockUserId = "user-123";
  const mockAdminId = "admin-123";

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    jest
      .spyOn(s3, "send")
      .mockImplementation(() => Promise.resolve({} as never));
  });

  describe("Zod Schemas", () => {
    it("deve validar payload correto de criação de produto", () => {
      const parsed = createProductSchema.safeParse({
        name: "Camiseta",
        price: 50,
        categoryIds: ["123e4567-e89b-12d3-a456-426614174000"],
      });
      expect(parsed.success).toBe(true);
    });

    it("deve rejeitar preço negativo", () => {
      const parsed = createProductSchema.safeParse({
        name: "Camiseta",
        price: -10,
      });
      expect(parsed.success).toBe(false);
    });

    it("deve rejeitar keepMediaIds duplicados", () => {
      const uuid = "123e4567-e89b-12d3-a456-426614174000";
      const parsed = updateProductMediaSchema.safeParse({
        keepMediaIds: [uuid, uuid],
      });
      expect(parsed.success).toBe(false);
    });

    it("deve aplicar defaults e coerção no getProductsQuerySchema", () => {
      const parsed = getProductsQuerySchema.parse({
        page: "2",
        limit: "10",
        minPrice: "100",
      });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(10);
      expect(parsed.minPrice).toBe(100);
    });
  });

  describe("createProduct", () => {
    it("1. deve criar produto sem categorias com sucesso", async () => {
      const mockTx = {
        product: {
          create: jest.fn<any>().mockResolvedValue({
            id: "prod-1",
            name: "Produto 1",
            userId: mockUserId,
            enterpriseId: mockEnterpriseId,
          }),
        },
        productCategory: {
          createMany: jest.fn(),
        },
        productMedia: {
          createMany: jest.fn(),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      const result = await createProduct(mockUserId, mockEnterpriseId, {
        name: "Produto 1",
      });

      expect(result.id).toBe("prod-1");
      expect(mockTx.product.create).toHaveBeenCalled();
    });

    it("2. deve criar produto com categorias válidas", async () => {
      const catId = "123e4567-e89b-12d3-a456-426614174000";
      jest.spyOn(prisma.category, "findMany").mockResolvedValue([
        { id: catId, enterpriseId: mockEnterpriseId, deletedAt: null },
      ] as any);

      const mockTx = {
        product: {
          create: jest.fn<any>().mockResolvedValue({
            id: "prod-1",
            name: "Produto 1",
          }),
        },
        productCategory: {
          createMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        },
        productMedia: {
          createMany: jest.fn(),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      const result = await createProduct(mockUserId, mockEnterpriseId, {
        name: "Produto 1",
        categoryIds: [catId],
      });

      expect(result.id).toBe("prod-1");
      expect(mockTx.productCategory.createMany).toHaveBeenCalledWith({
        data: [{ productId: "prod-1", categoryId: catId }],
      });
    });

    it("3. deve lançar erro se categoria pertencer a outra empresa", async () => {
      const catId = "123e4567-e89b-12d3-a456-426614174000";
      // Retorna vazio pois enterpriseId não bate
      jest.spyOn(prisma.category, "findMany").mockResolvedValue([]);

      await expect(
        createProduct(mockUserId, mockEnterpriseId, {
          name: "Produto 1",
          categoryIds: [catId],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "One or more categories are invalid.",
      });
    });

    it("4. deve lançar 403 se a key da mídia não pertencer ao usuário", async () => {
      const invalidMedia = [
        {
          url: "https://media.bluefootgg.com/temp/1.jpg",
          key: `enterprise/${mockEnterpriseId}/users/other-user/products/temp/1.jpg`,
          type: "FOTO" as const,
        },
      ];

      await expect(
        createProduct(mockUserId, mockEnterpriseId, {
          name: "Produto 1",
          media: invalidMedia,
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "Invalid media.",
      });
    });

    it("5. deve lançar 400 se mais de uma mídia for marcada como principal (isMain)", async () => {
      const media = [
        {
          url: "https://media.bluefootgg.com/temp/1.jpg",
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/1.jpg`,
          type: "FOTO" as const,
          isMain: true,
        },
        {
          url: "https://media.bluefootgg.com/temp/2.jpg",
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/2.jpg`,
          type: "FOTO" as const,
          isMain: true,
        },
      ];

      await expect(
        createProduct(mockUserId, mockEnterpriseId, {
          name: "Produto 1",
          media,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Apenas uma mídia pode ser definida como principal.",
      });
    });

    it("6. deve lançar 400 se vídeo for marcado como mídia principal", async () => {
      const media = [
        {
          url: "https://media.bluefootgg.com/temp/v.mp4",
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/v.mp4`,
          type: "VIDEO" as const,
          isMain: true,
        },
      ];

      await expect(
        createProduct(mockUserId, mockEnterpriseId, {
          name: "Produto 1",
          media,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Um vídeo não pode ser a mídia principal.",
      });
    });

    it("7. deve marcar automaticamente a primeira FOTO como isMain se nenhuma for marcada", async () => {
      const media = [
        {
          url: "https://media.bluefootgg.com/temp/1.jpg",
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/1.jpg`,
          type: "FOTO" as const,
        },
      ];

      const mockTx = {
        product: {
          create: jest.fn<any>().mockResolvedValue({ id: "prod-1" }),
        },
        productCategory: { createMany: jest.fn() },
        productMedia: { createMany: jest.fn() },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      await createProduct(mockUserId, mockEnterpriseId, {
        name: "Produto 1",
        media,
      });

      expect(mockTx.productMedia.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ isMain: true }),
        ]),
      });
    });

    it("8. deve fazer rollback no S3 se a transação do Prisma falhar", async () => {
      const media = [
        {
          url: "https://media.bluefootgg.com/temp/1.jpg",
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/1.jpg`,
          type: "FOTO" as const,
        },
      ];

      jest
        .spyOn(prisma, "$transaction")
        .mockRejectedValue(new Error("Prisma Transaction Fail") as never);

      await expect(
        createProduct(mockUserId, mockEnterpriseId, {
          name: "Produto 1",
          media,
        })
      ).rejects.toThrow("Prisma Transaction Fail");

      // Deve ter chamado o s3.send para rollback
      expect(s3.send).toHaveBeenCalled();
    });
  });

  describe("getAuthorizedProduct", () => {
    it("9. deve autorizar ADMIN para exclusão de produto da empresa", async () => {
      jest.spyOn(prisma.product, "findFirst").mockResolvedValue({
        id: "prod-1",
        enterpriseId: mockEnterpriseId,
        userId: "other-seller",
        media: [],
      } as any);

      const product = await getAuthorizedProduct(
        "prod-1",
        { userId: mockAdminId, role: "ADMIN", enterpriseId: mockEnterpriseId },
        "delete"
      );

      expect(product.id).toBe("prod-1");
    });

    it("10. deve negar atualização de produto por ADMIN se ele não for o dono", async () => {
      jest.spyOn(prisma.product, "findFirst").mockResolvedValue({
        id: "prod-1",
        enterpriseId: mockEnterpriseId,
        userId: "other-seller",
        media: [],
      } as any);

      await expect(
        getAuthorizedProduct(
          "prod-1",
          { userId: mockAdminId, role: "ADMIN", enterpriseId: mockEnterpriseId },
          "update"
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "Acesso negado para edição",
      });
    });

    it("11. deve negar acesso de SELLER ao produto de outro usuário", async () => {
      jest.spyOn(prisma.product, "findFirst").mockResolvedValue({
        id: "prod-1",
        enterpriseId: mockEnterpriseId,
        userId: "other-seller",
        media: [],
      } as any);

      await expect(
        getAuthorizedProduct(
          "prod-1",
          { userId: mockUserId, role: "SELLER", enterpriseId: mockEnterpriseId },
          "update"
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "Acesso negado para edição",
      });
    });
  });

  describe("getEnterpriseProductsPublic", () => {
    it("12. deve listar produtos paginados com URLs CDN resolvidas", async () => {
      const mockProducts = [
        {
          id: "prod-1",
          name: "Produto 1",
          media: [{ key: "media-key-1.jpg", url: "https://old/1.jpg" }],
          user: {
            id: mockUserId,
            name: "Vendedor",
            profileImageUrl: null,
            profileImageKey: null,
          },
        },
      ];

      jest.spyOn(prisma.product, "findMany").mockResolvedValue(mockProducts as any);
      jest.spyOn(prisma.product, "count").mockResolvedValue(1 as any);

      const result = await getEnterpriseProductsPublic(
        { page: 1, limit: 10 },
        mockEnterpriseId
      );

      expect(result.products).toHaveLength(1);
      expect(result.products[0].media[0].url).toContain(
        "https://media.bluefootgg.com/media-key-1.jpg"
      );
      expect(result.totalItems).toBe(1);
    });
  });

  describe("getUserProducts", () => {
    it("13. deve listar produtos do próprio vendedor", async () => {
      jest.spyOn(prisma.product, "findMany").mockResolvedValue([
        {
          id: "prod-1",
          media: [],
          user: { profileImageUrl: null, profileImageKey: null },
        },
      ] as any);
      jest.spyOn(prisma.product, "count").mockResolvedValue(1 as any);

      const result = await getUserProducts(
        mockEnterpriseId,
        mockUserId,
        { page: 1, limit: 10 },
        { userId: mockUserId, role: "SELLER" }
      );

      expect(result.products).toHaveLength(1);
      expect(result.totalItems).toBe(1);
    });
  });

  describe("getPublicProductById", () => {
    it("14. deve retornar dados públicos do produto e resolver URLs CDN", async () => {
      jest.spyOn(prisma.product, "findFirst").mockResolvedValue({
        id: "prod-1",
        name: "Sapato",
        description: "Couro",
        price: 250,
        countViews: 15,
        categories: [],
        media: [{ id: "m-1", key: "shoe.jpg", url: "https://old/shoe.jpg", isMain: true }],
        user: { id: "u-1", name: "Loja", profileImageKey: "avatar.jpg", profileImageUrl: null },
      } as any);

      const result = await getPublicProductById("prod-1");

      expect(result.name).toBe("Sapato");
      expect(result.media[0].url).toContain("https://media.bluefootgg.com/shoe.jpg");
      expect(result.user.profileImageUrl).toContain("https://media.bluefootgg.com/avatar.jpg");
    });

    it("15. deve lançar 404 se produto não for encontrado", async () => {
      jest.spyOn(prisma.product, "findFirst").mockResolvedValue(null as any);

      await expect(getPublicProductById("prod-404")).rejects.toMatchObject({
        statusCode: 404,
        message: "Produto não encontrado",
      });
    });
  });

  describe("incrementProductView", () => {
    it("16. deve incrementar visualização de produto", async () => {
      jest.spyOn(prisma.product, "update").mockResolvedValue({ id: "prod-1" } as any);

      await incrementProductView("prod-1");

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: "prod-1" },
        data: { countViews: { increment: 1 } },
      });
    });
  });

  describe("updateProduct", () => {
    it("17. deve atualizar produto e suas categorias via transação", async () => {
      jest.spyOn(prisma.product, "findFirst").mockResolvedValue({
        id: "prod-1",
        enterpriseId: mockEnterpriseId,
        userId: mockUserId,
        media: [],
      } as any);

      const catId = "123e4567-e89b-12d3-a456-426614174000";
      jest.spyOn(prisma.category, "findMany").mockResolvedValue([
        { id: catId, enterpriseId: mockEnterpriseId, deletedAt: null },
      ] as any);

      const mockTx = {
        product: {
          update: jest.fn<any>().mockResolvedValue({}),
          findUnique: jest.fn<any>().mockResolvedValue({ id: "prod-1", name: "Atualizado" }),
        },
        productCategory: {
          deleteMany: jest.fn<any>().mockResolvedValue({}),
          createMany: jest.fn<any>().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (cb: any) => cb(mockTx));

      const result = await updateProduct(
        "prod-1",
        { userId: mockUserId, role: "SELLER", enterpriseId: mockEnterpriseId },
        { name: "Atualizado", categoryIds: [catId] }
      );

      expect(result.name).toBe("Atualizado");
      expect(mockTx.productCategory.deleteMany).toHaveBeenCalledWith({
        where: { productId: "prod-1" },
      });
    });
  });

  describe("deleteProduct", () => {
    it("18. deve excluir produto e acionar deleção de mídias no S3", async () => {
      jest.spyOn(prisma.product, "findFirst").mockResolvedValue({
        id: "prod-1",
        enterpriseId: mockEnterpriseId,
        userId: mockUserId,
        media: [{ key: "media-to-del.jpg" }],
      } as any);

      jest.spyOn(prisma.product, "delete").mockResolvedValue({ id: "prod-1" } as any);

      await deleteProduct("prod-1", {
        userId: mockUserId,
        role: "SELLER",
        enterpriseId: mockEnterpriseId,
      });

      expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: "prod-1" } });
      expect(s3.send).toHaveBeenCalled();
    });
  });
});
