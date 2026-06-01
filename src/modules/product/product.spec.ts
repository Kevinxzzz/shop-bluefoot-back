import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { prisma } from "../../shared/database/prisma.js";
import { createProduct } from "./product.service.js";
import { AppError } from "../../shared/errors/AppError.js";
import { s3 } from "../../shared/config/s3.js";
import { DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";

describe("Product Service - Create Product", () => {
  const mockEnterpriseId = "ent-test-123";
  const mockUserId = "user-test-123";

  beforeEach(async () => {
    jest.clearAllMocks();

    await prisma.productMedia.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await prisma.enterprise.deleteMany();

    await prisma.enterprise.create({
      data: {
        id: mockEnterpriseId,
        cnpj: "12345678901234",
        name: "Enterprise Test",
        phoneNumber: "11999999999",
      },
    });

    const role = await prisma.userRole.findFirst() ?? await prisma.userRole.create({
      data: { role: "ADMIN_TEST_" + Date.now(), description: "Admin test" }
    });

    await prisma.user.create({
      data: {
        id: mockUserId,
        name: "User Test",
        email: "usertest@mail.com",
        password: "password123",
        roleId: role.id,
        enterpriseId: mockEnterpriseId,
      },
    });
  });

  it("1. should create product without categories", async () => {
    const product = await createProduct(mockUserId, mockEnterpriseId, {
      name: "Product Only",
      description: "Description",
      price: 100,
    });

    expect(product).toBeDefined();
    expect(product.name).toBe("Product Only");

    const countCategories = await prisma.productCategory.count();
    expect(countCategories).toBe(0);
  });

  it("2. should create product with valid categories", async () => {
    const cat1 = await prisma.category.create({
      data: { name: "Cat 1", slug: "cat-1", enterpriseId: mockEnterpriseId },
    });

    const product = await createProduct(mockUserId, mockEnterpriseId, {
      name: "Product With Categories",
      categoryIds: [cat1.id],
    });

    expect(product).toBeDefined();
    const productCategories = await prisma.productCategory.findMany({
      where: { productId: product.id },
    });
    expect(productCategories.length).toBe(1);
    expect(productCategories[0].categoryId).toBe(cat1.id);
  });

  it("3. should throw error if category belongs to another enterprise", async () => {
    const otherEnterprise = await prisma.enterprise.create({
      data: {
        id: "ent-test-other",
        cnpj: "09876543210987",
        name: "Other Enterprise",
        phoneNumber: "11888888888",
      },
    });

    const otherCat = await prisma.category.create({
      data: { name: "Other Cat", slug: "other-cat", enterpriseId: otherEnterprise.id },
    });

    await expect(
      createProduct(mockUserId, mockEnterpriseId, {
        name: "Product Other Cat",
        categoryIds: [otherCat.id],
      })
    ).rejects.toThrow(AppError);
  });

  it("4. should throw error if media key belongs to another user", async () => {
    await expect(
      createProduct(mockUserId, mockEnterpriseId, {
        name: "Product Invalid Media",
        media: [
          {
            key: `enterprise/${mockEnterpriseId}/users/other-user/products/temp/file.jpg`,
            url: "https://url.com/file.jpg",
            type: "FOTO",
          },
        ],
      })
    ).rejects.toThrow("Invalid media.");
  });

  it("5. should throw error if media key belongs to another enterprise", async () => {
    await expect(
      createProduct(mockUserId, mockEnterpriseId, {
        name: "Product Invalid Media Ent",
        media: [
          {
            key: `enterprise/other-enterprise/users/${mockUserId}/products/temp/file.jpg`,
            url: "https://url.com/file.jpg",
            type: "FOTO",
          },
        ],
      })
    ).rejects.toThrow("Invalid media.");
  });

  it("6. should move media correctly and save to db", async () => {
    jest.spyOn(s3, "send").mockResolvedValue({} as never);

    const product = await createProduct(mockUserId, mockEnterpriseId, {
      name: "Product With Media",
      media: [
        {
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/file.jpg`,
          url: "https://url.com/temp/file.jpg",
          type: "FOTO",
        },
      ],
    });

    expect(s3.send).toHaveBeenCalledTimes(2); // 1 copy, 1 delete

    const mediaInDb = await prisma.productMedia.findMany({
      where: { productId: product.id },
    });

    expect(mediaInDb.length).toBe(1);
    expect(mediaInDb[0].key).toBe(`enterprise/${mockEnterpriseId}/products/${product.id}/file.jpg`);
    expect(mediaInDb[0].isMain).toBe(true);
    expect(mediaInDb[0].order).toBe(0);
  });

  it("7. should rollback moved media if S3 fails mid-move", async () => {
    jest.spyOn(s3, "send").mockRejectedValueOnce(new Error("S3 Upload Failed") as never);

    await expect(
      createProduct(mockUserId, mockEnterpriseId, {
        name: "Product S3 Fail",
        media: [
          {
            key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/file.jpg`,
            url: "https://url.com/temp/file.jpg",
            type: "FOTO",
          },
        ],
      })
    ).rejects.toThrow("Erro ao processar mídias no provedor de armazenamento.");

    // Check rollback
    const products = await prisma.product.findMany({
      where: { name: "Product S3 Fail" },
    });
    expect(products.length).toBe(0); // Product shouldn't exist
  });

  it("8. should rollback moved media if Prisma transaction fails", async () => {
    jest.spyOn(s3, "send").mockResolvedValue({} as never);
    jest.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("DB Error") as never);

    await expect(
      createProduct(mockUserId, mockEnterpriseId, {
        name: "Product DB Fail",
        media: [
          {
            key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/file.jpg`,
            url: "https://url.com/temp/file.jpg",
            type: "FOTO",
          },
        ],
      })
    ).rejects.toThrow("DB Error");

    // We expect s3.send to be called 2 times:
    // 1. CopyObjectCommand (move)
    // 2. DeleteObjectsCommand (rollback)
    // O delete do temp foi skipado porque a transação falhou.
    expect(s3.send).toHaveBeenCalledTimes(2);

    const products = await prisma.product.findMany({
      where: { name: "Product DB Fail" },
    });
    expect(products.length).toBe(0);
  });

  it("9. should throw error if two media are marked as main", async () => {
    await expect(
      createProduct(mockUserId, mockEnterpriseId, {
        name: "Product Two Main",
        media: [
          {
            key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/f1.jpg`,
            url: "https://url.com/f1.jpg",
            type: "FOTO",
            isMain: true,
          },
          {
            key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/f2.jpg`,
            url: "https://url.com/f2.jpg",
            type: "FOTO",
            isMain: true,
          },
        ],
      })
    ).rejects.toThrow(AppError);
  });

  it("10. should throw error if video is marked as main", async () => {
    await expect(
      createProduct(mockUserId, mockEnterpriseId, {
        name: "Product Video Main",
        media: [
          {
            key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/v1.mp4`,
            url: "https://url.com/v1.mp4",
            type: "VIDEO",
            isMain: true,
          },
        ],
      })
    ).rejects.toThrow(AppError);
  });

  it("11. should set first FOTO as main if none is marked", async () => {
    jest.spyOn(s3, "send").mockResolvedValue({} as never);

    const product = await createProduct(mockUserId, mockEnterpriseId, {
      name: "Product Auto Main",
      media: [
        {
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/v1.mp4`,
          url: "https://url.com/v1.mp4",
          type: "VIDEO",
        },
        {
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/f1.jpg`,
          url: "https://url.com/f1.jpg",
          type: "FOTO",
        },
        {
          key: `enterprise/${mockEnterpriseId}/users/${mockUserId}/products/temp/f2.jpg`,
          url: "https://url.com/f2.jpg",
          type: "FOTO",
        },
      ],
    });

    const mediaInDb = await prisma.productMedia.findMany({
      where: { productId: product.id },
      orderBy: { order: "asc" },
    });

    expect(mediaInDb.length).toBe(3);
    // Video is order 0
    expect(mediaInDb[0].type).toBe("VIDEO");
    expect(mediaInDb[0].isMain).toBe(false);

    // First Foto is order 1
    expect(mediaInDb[1].type).toBe("FOTO");
    expect(mediaInDb[1].isMain).toBe(true);

    // Second Foto is order 2
    expect(mediaInDb[2].type).toBe("FOTO");
    expect(mediaInDb[2].isMain).toBe(false);
  });
});
