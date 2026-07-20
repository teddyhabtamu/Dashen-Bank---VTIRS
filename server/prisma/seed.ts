import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_DEFINITIONS,
} from "../src/lib/rbac";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding RBAC...");

  // 1. Permissions (all known codes)
  const allCodes = Array.from(new Set(Object.values(PERMISSIONS)));
  for (const code of allCodes) {
    const [resource, action] = code.split(":");
    await prisma.permission.upsert({
      where: { code },
      update: { name: `${action} ${resource}`, category: resource },
      create: {
        code,
        name: `${action} ${resource}`,
        category: resource,
        description: `${action} permission on ${resource}`,
      },
    });
  }
  console.log(`  • ${allCodes.length} permissions ensured`);

  // 2. Roles
  for (const def of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { slug: def.slug },
      update: { name: def.name, description: def.description },
      create: {
        slug: def.slug,
        name: def.name,
        description: def.description,
      },
    });
  }
  console.log(`  • ${ROLE_DEFINITIONS.length} roles ensured`);

  // 3. Attach permissions to roles (role default set)
  for (const def of ROLE_DEFINITIONS) {
    const codes = ROLE_PERMISSIONS[def.slug] ?? [];
    const perms = await prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    await prisma.role.update({
      where: { slug: def.slug },
      data: { permissions: { set: perms.map((p) => ({ id: p.id })) } },
    });
  }
  console.log("  • role-permission links ensured");

  // 4. Default admin user
  const adminRole = await prisma.role.findUnique({
    where: { slug: "system_admin" },
  });
  if (!adminRole) throw new Error("system_admin role missing");

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@dashenbank.com.vtirs";
  const username = process.env.SEED_ADMIN_USER ?? "admin";
  const password = process.env.SEED_ADMIN_PASS ?? "Admin@1234";
  const hash = await hashPassword(password);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: hash,
        fullName: "System Administrator",
        status: "ACTIVE",
        roleId: adminRole.id,
      },
    });
    console.log(`  • created admin user "${username}" (password: ${password})`);
  } else {
    console.log(`  • admin user "${username}" already exists`);
  }

  // 5. Reference data: branches, departments, drivers, manufacturers
  const branches = [
    { code: "HQ", name: "Head Office - Addis Ababa" },
    { code: "AA-EAST", name: "Addis Ababa East Branch" },
    { code: "AA-WEST", name: "Addis Ababa West Branch" },
    { code: "DIR-DJIBOUTI", name: "Dire Dawa Branch" },
    { code: "BAHIR-DAR", name: "Bahir Dar Branch" },
    { code: "HAWASSA", name: "Hawassa Branch" },
  ];
  for (const b of branches) {
    await prisma.branch.upsert({
      where: { code: b.code },
      update: {},
      create: { ...b, region: "Ethiopia" },
    });
  }

  const departments = [
    { code: "FAC", name: "Facilities Department" },
    { code: "OPS", name: "Operations" },
    { code: "IT", name: "IT Modernization" },
    { code: "SEC", name: "Security" },
    { code: "LOG", name: "Logistics" },
  ];
  for (const d of departments) {
    await prisma.department.upsert({
      where: { code: d.code },
      update: {},
      create: d,
    });
  }

  const manufacturers = [
    "Toyota",
    "Isuzu",
    "Mitsubishi",
    "Hyundai",
    "Ford",
    "Mercedes-Benz",
  ];
  for (const m of manufacturers) {
    await prisma.manufacturer.upsert({
      where: { name: m },
      update: {},
      create: { name: m, country: "Various" },
    });
  }

  const drivers = [
    { employeeId: "DRV-001", fullName: "Abebe Kebede", licenseNo: "ET-12345" },
    { employeeId: "DRV-002", fullName: "Tigist Haile", licenseNo: "ET-23456" },
    { employeeId: "DRV-003", fullName: "Dawit Mengistu", licenseNo: "ET-34567" },
  ];
  for (const d of drivers) {
    await prisma.driver.upsert({
      where: { employeeId: d.employeeId! },
      update: {},
      create: d,
    });
  }

  console.log("  • reference data ensured (branches, departments, manufacturers, drivers)");
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
