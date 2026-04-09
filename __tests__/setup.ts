import { vi } from "vitest";

// ─── Mock Prisma ────────────────────────────────────────────────────────────

// Create fresh model methods for each model (each gets its own vi.fn() instances)
function createModelMock() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  };
}

export const prismaMock = {
  shift: createModelMock(),
  patient: createModelMock(),
  user: createModelMock(),
  userPreference: createModelMock(),
  blockDay: createModelMock(),
  studyOrder: createModelMock(),
  notification: createModelMock(),
  consultationType: createModelMock(),
  userRole: createModelMock(),
  role: createModelMock(),
  $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  $transaction: vi.fn().mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return arg(prismaMock);
    }
    // Array of promises
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  }),
};

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

// ─── Mock Auth ──────────────────────────────────────────────────────────────

export const authMock = vi.fn().mockResolvedValue({
  user: { id: "user-1", email: "test@test.com", role: "secretary" },
});

vi.mock("@/auth", () => ({
  auth: authMock,
}));

// ─── Mock Auth Utils ────────────────────────────────────────────────────────

vi.mock("@/lib/auth-utils", () => ({
  isMedic: vi.fn().mockResolvedValue(false),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1", email: "test@test.com" }),
  getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
  getUserRole: vi.fn().mockResolvedValue("secretary"),
  requireAuth: vi.fn().mockResolvedValue({ id: "user-1", email: "test@test.com" }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

export function resetAllMocks() {
  vi.clearAllMocks();

  // Re-apply auth mock since restoreAllMocks removes implementations
  authMock.mockResolvedValue({
    user: { id: "user-1", email: "test@test.com", role: "secretary" },
  });

  // Re-set all model mocks to their defaults
  for (const key of Object.keys(prismaMock)) {
    const model = prismaMock[key as keyof typeof prismaMock];
    if (typeof model === "object" && model !== null && "findMany" in model) {
      for (const method of Object.keys(model)) {
        const fn = model[method as keyof typeof model];
        if (typeof fn === "function" && "mockResolvedValue" in fn) {
          if (method === "findMany") fn.mockResolvedValue([]);
          else if (method === "findFirst" || method === "findUnique") fn.mockResolvedValue(null);
          else if (method === "create" || method === "update" || method === "upsert" || method === "delete") fn.mockResolvedValue({});
          else if (method === "createMany" || method === "updateMany" || method === "deleteMany") fn.mockResolvedValue({ count: 0 });
          else if (method === "count") fn.mockResolvedValue(0);
        }
      }
    }
  }

  // Re-set $queryRawUnsafe mock
  prismaMock.$queryRawUnsafe.mockResolvedValue([]);

  // Re-set $transaction mock
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return arg(prismaMock);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });
}
