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

import {
  getPublicProductById,
  incrementProductView,
} from "./product.service.js";

import { app } from "../../app.js";
import request from "supertest";

describe("Product Service - Public Product Details", () => {
  const mockEnterpriseId = "ent-public-123";
  const mockSellerId = "seller-public-123";
  let testProductId: string;

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
        cnpj: "11111111111111",
        name: "Enterprise Public",
        phoneNumber: "11977777777",
      },
    });

    const role = await prisma.userRole.create({
      data: { role: "SELLER_PUBLIC", description: "Seller test" },
    });

    await prisma.user.create({
      data: {
        id: mockSellerId,
        name: "Seller Public",
        email: "sellerpublic@mail.com",
        password: "password123",
        contactLink: "https://wa.me/5511999999999",
        roleId: role.id,
        enterpriseId: mockEnterpriseId,
      },
    });

    const category = await prisma.category.create({
      data: { name: "Cat Public", slug: "cat-public", enterpriseId: mockEnterpriseId },
    });

    const product = await prisma.product.create({
      data: {
        name: "Product Public",
        description: "Public description",
        price: 1500,
        userId: mockSellerId,
        enterpriseId: mockEnterpriseId,
      },
    });

    testProductId = product.id;

    await prisma.productCategory.create({
      data: { productId: testProductId, categoryId: category.id },
    });

    await prisma.productMedia.create({
      data: {
        url: "https://cdn.example.com/photo.jpg",
        key: "photo-key",
        type: "FOTO",
        isMain: true,
        order: 0,
        productId: testProductId,
      },
    });
  });

  // ── Sucesso ──────────────────────────────────────────────

  it("should return public product without authentication", async () => {
    const product = await getPublicProductById(testProductId);

    expect(product).toBeDefined();
    expect(product.id).toBe(testProductId);
    expect(product.name).toBe("Product Public");
    expect(product.description).toBe("Public description");
    expect(product.price).toBe(1500);
    expect(product.user.name).toBe("Seller Public");
    expect(product.user.contactLink).toBe("https://wa.me/5511999999999");
    expect(product.categories.length).toBe(1);
    expect(product.media.length).toBe(1);
    expect(product.media[0].isMain).toBe(true);
  });

  it("should not return internal fields in public response", async () => {
    const product = await getPublicProductById(testProductId);

    const productAsAny = product as any;
    expect(productAsAny.enterpriseId).toBeUndefined();
    expect(productAsAny.userId).toBeUndefined();
    expect(productAsAny.deletedAt).toBeUndefined();
    expect(productAsAny.createdAt).toBeUndefined();
    expect(productAsAny.countViews).toBeDefined();
  });

  // ── Falhas ──────────────────────────────────────────────

  it("should throw 404 for non-existent product", async () => {
    await expect(
      getPublicProductById("non-existent-id")
    ).rejects.toThrow("Produto não encontrado");

    try {
      await getPublicProductById("non-existent-id");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(404);
    }
  });

  it("should not return soft-deleted product", async () => {
    await prisma.product.update({
      where: { id: testProductId },
      data: { deletedAt: new Date() },
    });

    await expect(
      getPublicProductById(testProductId)
    ).rejects.toThrow("Produto não encontrado");
  });

  // ── Contabilização de Views ──────────────────────────────

  it("should increment countViews on first visit", async () => {
    const before = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(before!.countViews).toBe(0);

    await incrementProductView(testProductId);

    const after = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(after!.countViews).toBe(1);
  });

  it("should increment countViews atomically", async () => {
    await incrementProductView(testProductId);
    await incrementProductView(testProductId);
    await incrementProductView(testProductId);

    const product = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(product!.countViews).toBe(3);
  });

  // ── Testes de Integração (Controller + Cookie) ──────────

  it("should increment view for unauthenticated visitor without cookie", async () => {
    const res = await request(app)
      .get(`/products/${testProductId}`)
      .expect(200);

    expect(res.body.name).toBe("Product Public");

    // Verify cookie was set
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const viewCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.includes(`product_view_${testProductId}`))
      : cookies?.includes(`product_view_${testProductId}`) ? cookies : undefined;
    expect(viewCookie).toBeDefined();
    expect(viewCookie).toContain("HttpOnly");

    // Verify view was incremented
    const product = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(product!.countViews).toBe(1);
  });

  it("should NOT increment view on refresh (cookie present)", async () => {
    // First visit
    await request(app)
      .get(`/products/${testProductId}`)
      .expect(200);

    const after1 = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(after1!.countViews).toBe(1);

    // Refresh (with cookie)
    await request(app)
      .get(`/products/${testProductId}`)
      .set("Cookie", `product_view_${testProductId}=1`)
      .expect(200);

    const after2 = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(after2!.countViews).toBe(1);
  });

  it("should NOT increment view for authenticated user", async () => {
    const jwt = await import("jsonwebtoken");
    const { env } = await import("../../shared/config/env.js");
    const token = jwt.default.sign({ userId: mockSellerId }, env.JWT_SECRET, { algorithm: "HS256" });

    await request(app)
      .get(`/products/${testProductId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const product = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(product!.countViews).toBe(0);
  });

  it("should treat invalid token as unauthenticated visitor", async () => {
    const res = await request(app)
      .get(`/products/${testProductId}`)
      .set("Authorization", "Bearer invalid-token-here")
      .expect(200);

    // Should have incremented (treated as visitor)
    const product = await prisma.product.findUnique({ where: { id: testProductId } });
    expect(product!.countViews).toBe(1);

    // Should have set cookie
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
  });

  it("should return 404 via HTTP for non-existent product", async () => {
    const res = await request(app)
      .get("/products/non-existent-id")
      .expect(404);

    expect(res.body.error).toBe("Produto não encontrado");
  });
});
