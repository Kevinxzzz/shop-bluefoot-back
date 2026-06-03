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

import { 
  getEnterpriseProducts,
  getUserProducts,
  updateProduct,
  updateProductMedia,
  deleteProduct
} from "./product.service.js";

import { getAuthorizedProduct } from "./product.authorization.js";

describe("Product Service - CRUD Operations", () => {
  const mockEnterpriseId = "ent-crud-123";
  const mockAdminId = "admin-crud-123";
  const mockSellerId = "seller-crud-123";

  beforeEach(async () => {
    jest.clearAllMocks();

    await prisma.productMedia.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.enterprise.deleteMany();

    await prisma.enterprise.create({
      data: {
        id: mockEnterpriseId,
        cnpj: "98765432109876",
        name: "Enterprise CRUD",
        phoneNumber: "11988888888",
      },
    });

    const roleAdmin = await prisma.userRole.create({
      data: { role: "ADMIN_CRUD", description: "Admin test" }
    });
    
    const roleSeller = await prisma.userRole.create({
      data: { role: "SELLER_CRUD", description: "Seller test" }
    });

    await prisma.user.createMany({
      data: [
        {
          id: mockAdminId,
          name: "Admin",
          email: "admincrud@mail.com",
          password: "password123",
          roleId: roleAdmin.id,
          enterpriseId: mockEnterpriseId,
        },
        {
          id: mockSellerId,
          name: "Seller",
          email: "sellercrud@mail.com",
          password: "password123",
          roleId: roleSeller.id,
          enterpriseId: mockEnterpriseId,
        }
      ]
    });
  });

  it("should enforce authorization correctly (getAuthorizedProduct)", async () => {
    const product = await prisma.product.create({
      data: {
        name: "Test Prod",
        userId: mockSellerId,
        enterpriseId: mockEnterpriseId,
      }
    });

    // Admin reading: Success
    const p1 = await getAuthorizedProduct(product.id, { userId: mockAdminId, role: "ADMIN", enterpriseId: mockEnterpriseId }, "read");
    expect(p1.id).toBe(product.id);

    // Admin updating: Error
    await expect(
      getAuthorizedProduct(product.id, { userId: mockAdminId, role: "ADMIN", enterpriseId: mockEnterpriseId }, "update")
    ).rejects.toThrow("Acesso negado para edição");

    // Admin deleting: Success
    const p3 = await getAuthorizedProduct(product.id, { userId: mockAdminId, role: "ADMIN", enterpriseId: mockEnterpriseId }, "delete");
    expect(p3.id).toBe(product.id);

    // Seller updating own: Success
    const p4 = await getAuthorizedProduct(product.id, { userId: mockSellerId, role: "SELLER", enterpriseId: mockEnterpriseId }, "update");
    expect(p4.id).toBe(product.id);

    // Other seller reading: Error
    await expect(
      getAuthorizedProduct(product.id, { userId: "other", role: "SELLER", enterpriseId: mockEnterpriseId }, "read")
    ).rejects.toThrow("Acesso negado para leitura");
  });

  it("should paginate getEnterpriseProducts and include owner user", async () => {
    for(let i=0; i < 25; i++) {
      await prisma.product.create({
        data: { name: `Prod ${i}`, userId: mockSellerId, enterpriseId: mockEnterpriseId }
      });
    }

    const res = await getEnterpriseProducts(mockEnterpriseId, { page: 2, limit: 10 }, "ADMIN");
    expect(res.totalItems).toBe(25);
    expect(res.totalPages).toBe(3);
    expect(res.products.length).toBe(10);
    expect(res.page).toBe(2);
    expect(res.products[0].user).toBeDefined();
    expect(res.products[0].user.name).toBe("Seller");
  });

  it("should update product data and categories via transaction", async () => {
    const cat1 = await prisma.category.create({ data: { name: "C1", slug: "c1", enterpriseId: mockEnterpriseId } });
    const cat2 = await prisma.category.create({ data: { name: "C2", slug: "c2", enterpriseId: mockEnterpriseId } });
    
    const product = await prisma.product.create({
      data: { name: "P1", userId: mockSellerId, enterpriseId: mockEnterpriseId }
    });

    const updated = await updateProduct(
      product.id, 
      { userId: mockSellerId, role: "SELLER", enterpriseId: mockEnterpriseId },
      { name: "P1 Updated", price: 200, categoryIds: [cat1.id, cat2.id] }
    );

    expect(updated?.name).toBe("P1 Updated");
    expect(updated?.price).toBe(200);
    expect(updated?.categories.length).toBe(2);
  });

  it("should update media, handle isMain fallback, and limit to max 3 photos", async () => {
    jest.spyOn(s3, "send").mockResolvedValue({} as never);

    const product = await prisma.product.create({
      data: { name: "P_MEDIA", userId: mockSellerId, enterpriseId: mockEnterpriseId }
    });

    const m1 = await prisma.productMedia.create({
      data: { url: "http://f1", key: "f1", type: "FOTO", isMain: true, productId: product.id }
    });

    // Delete m1 and send 1 new photo, it should become main
    const newMedia = await updateProductMedia(
      product.id,
      { userId: mockSellerId, role: "SELLER", enterpriseId: mockEnterpriseId },
      { keepMediaIds: [] },
      [{ url: "http://new", key: "temp/new", type: "FOTO" }]
    );

    expect(newMedia?.media.length).toBe(1);
    expect(newMedia?.media[0].isMain).toBe(true);
    expect(s3.send).toHaveBeenCalled(); // Copy & Delete
  });

  it("should not revert DB if S3 fails during DELETE", async () => {
    jest.spyOn(s3, "send").mockRejectedValue(new Error("AWS ERROR") as never);

    const product = await prisma.product.create({
      data: { name: "P_DEL", userId: mockSellerId, enterpriseId: mockEnterpriseId }
    });
    await prisma.productMedia.create({
      data: { url: "http://del", key: "del_key", type: "FOTO", isMain: true, productId: product.id }
    });

    // Does not throw
    await expect(deleteProduct(product.id, { userId: mockAdminId, role: "ADMIN", enterpriseId: mockEnterpriseId })).resolves.toBeUndefined();

    const check = await prisma.product.findUnique({ where: { id: product.id } });
    expect(check).toBeNull(); // It was deleted from DB even if S3 failed
  });
});

