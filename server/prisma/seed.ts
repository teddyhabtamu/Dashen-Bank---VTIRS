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

  // 5b. Sample users for each role
  const roles = await prisma.role.findMany();
  const hqBranch = await prisma.branch.findUnique({ where: { code: "HQ" } });
  const branchId = hqBranch?.id ?? null;
  const sampleUsers = [
    { username: "abebe.admin",  email: "abebe.admin@dashenbank.com.vtirs", fullName: "Abebe Kebede",      role: "facilities_admin",  branch: branchId, pass: "Pass1234" },
    { username: "alemu.officer", email: "alemu.officer@dashenbank.com.vtirs", fullName: "Alemu Worku",      role: "facilities_officer", branch: branchId, pass: "Pass1234" },
    { username: "biruk.mgmt",    email: "biruk.mgmt@dashenbank.com.vtirs",    fullName: "Biruk Tadesse",     role: "management",        branch: branchId, pass: "Pass1234" },
    { username: "sara.sysadmin", email: "sara.sysadmin@dashenbank.com.vtirs", fullName: "Sara Hailu",        role: "system_admin",      branch: branchId, pass: "Pass1234" },
  ];
  for (const su of sampleUsers) {
    const role = roles.find((r) => r.slug === su.role);
    if (!role) continue;
    const existingUser = await prisma.user.findUnique({ where: { username: su.username } });
    if (!existingUser) {
      await prisma.user.create({
        data: {
          username: su.username,
          email: su.email,
          passwordHash: await hashPassword(su.pass),
          fullName: su.fullName,
          status: "ACTIVE",
          roleId: role.id,
          branchId: su.branch,
        },
      });
    }
  }
  console.log(`  • ${sampleUsers.length} sample users ensured`);

  console.log("  • reference data ensured (branches, departments, manufacturers, drivers)");

  // 6. Sample fleet data (vehicles + registrations + insurance)
  await seedSampleFleet();

  console.log("Seed complete.");
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function seedSampleFleet() {
  const [branchList, deptList, driverList, admin] = await Promise.all([
    prisma.branch.findMany(),
    prisma.department.findMany(),
    prisma.driver.findMany(),
    prisma.user.findUnique({ where: { username: "admin" } }),
  ]);

  const branch = (code: string) => branchList.find((b) => b.code === code) ?? null;
  const dept = (code: string) => deptList.find((d) => d.code === code) ?? null;
  const driver = (emp: string) => driverList.find((d) => d.employeeId === emp) ?? null;

  interface Sample {
    plateNumber: string;
    prevPlateNo?: string;
    category: string;
    type: string;
    make: string;
    model: string;
    trim?: string;
    year: number;
    color: string;
    engineNo: string;
    chassisNo: string;
    engineCC: number;
    fuelType: string;
    transmission: string;
    driveType: string;
    odometer: number;
    branchCode: string;
    deptCode: string;
    driverEmp?: string;
    acquisitionDate: Date;
    purchaseCost: number;
    supplier: string;
    status: string;
    reg: { regNumber: string; office: string; regDays: number; expiryDays: number; status: string };
    ins: { company: string; policyNo: string; coverage: string; startDays: number; endDays: number };
  }

  const samples: Sample[] = [
    {
      plateNumber: "3-A-12345", category: "Passenger", type: "SUV", make: "Toyota", model: "Land Cruiser", trim: "GX-R", year: 2022, color: "White",
      engineNo: "ENG-LC-0001", chassisNo: "JTMHV05J00400001", engineCC: 4500, fuelType: "DIESEL", transmission: "AUTOMATIC", driveType: "FOUR_WD", odometer: 42000,
      branchCode: "HQ", deptCode: "FAC", acquisitionDate: daysFromNow(-900), purchaseCost: 4200000, supplier: "Moenco",
      status: "ACTIVE",
      reg: { regNumber: "REG-2024-0001", office: "AA Transport Authority", regDays: -160, expiryDays: 205, status: "ACTIVE" },
      ins: { company: "Awash Insurance", policyNo: "POL-AW-1001", coverage: "Comprehensive", startDays: -160, endDays: 205 },
    },
    {
      plateNumber: "3-A-23456", category: "Commercial", type: "Pickup", make: "Toyota", model: "Hilux", trim: "Double Cab", year: 2021, color: "Silver",
      engineNo: "ENG-HL-0002", chassisNo: "MR0FR22G50100002", engineCC: 2400, fuelType: "DIESEL", transmission: "MANUAL", driveType: "FOUR_WD", odometer: 68000,
      branchCode: "AA-EAST", deptCode: "LOG", driverEmp: "DRV-001", acquisitionDate: daysFromNow(-1200), purchaseCost: 2800000, supplier: "Moenco",
      status: "ASSIGNED",
      reg: { regNumber: "REG-2024-0002", office: "AA Transport Authority", regDays: -340, expiryDays: 20, status: "PENDING_RENEWAL" },
      ins: { company: "Nyala Insurance", policyNo: "POL-NY-1002", coverage: "Comprehensive", startDays: -340, endDays: 45 },
    },
    {
      plateNumber: "3-B-34567", category: "Commercial", type: "Pickup", make: "Isuzu", model: "D-Max", year: 2020, color: "Blue",
      engineNo: "ENG-DM-0003", chassisNo: "MPATFR85J00300003", engineCC: 2500, fuelType: "DIESEL", transmission: "MANUAL", driveType: "RWD", odometer: 95000,
      branchCode: "AA-WEST", deptCode: "OPS", acquisitionDate: daysFromNow(-1500), purchaseCost: 2100000, supplier: "Belayab Motors",
      status: "ACTIVE",
      reg: { regNumber: "REG-2023-0003", office: "AA Transport Authority", regDays: -380, expiryDays: -15, status: "EXPIRED" },
      ins: { company: "Awash Insurance", policyNo: "POL-AW-1003", coverage: "Third Party", startDays: -380, endDays: -5 },
    },
    {
      plateNumber: "3-B-45678", category: "Commercial", type: "Pickup", make: "Mitsubishi", model: "L200", year: 2019, color: "Grey",
      engineNo: "ENG-L2-0004", chassisNo: "MMBJNKB40KD000004", engineCC: 2500, fuelType: "DIESEL", transmission: "MANUAL", driveType: "FOUR_WD", odometer: 120000,
      branchCode: "DIR-DJIBOUTI", deptCode: "LOG", acquisitionDate: daysFromNow(-1800), purchaseCost: 1900000, supplier: "Matador Addis",
      status: "UNDER_MAINTENANCE",
      reg: { regNumber: "REG-2024-0004", office: "Dire Dawa Transport", regDays: -100, expiryDays: 90, status: "ACTIVE" },
      ins: { company: "Oromia Insurance", policyNo: "POL-OR-1004", coverage: "Comprehensive", startDays: -100, endDays: 120 },
    },
    {
      plateNumber: "3-A-56789", category: "Passenger", type: "Van", make: "Hyundai", model: "H1", year: 2022, color: "White",
      engineNo: "ENG-H1-0005", chassisNo: "KMFWBX7HABU000005", engineCC: 2500, fuelType: "DIESEL", transmission: "AUTOMATIC", driveType: "FWD", odometer: 30000,
      branchCode: "BAHIR-DAR", deptCode: "OPS", driverEmp: "DRV-002", acquisitionDate: daysFromNow(-700), purchaseCost: 3100000, supplier: "Marathon Motor",
      status: "ASSIGNED",
      reg: { regNumber: "REG-2024-0005", office: "Bahir Dar Transport", regDays: -60, expiryDays: 300, status: "ACTIVE" },
      ins: { company: "Nib Insurance", policyNo: "POL-NB-1005", coverage: "Comprehensive", startDays: -60, endDays: 300 },
    },
    {
      plateNumber: "3-B-67890", category: "Commercial", type: "Pickup", make: "Ford", model: "Ranger", trim: "XLT", year: 2021, color: "Black",
      engineNo: "ENG-RG-0006", chassisNo: "MNBUMFF50MW000006", engineCC: 3200, fuelType: "DIESEL", transmission: "AUTOMATIC", driveType: "FOUR_WD", odometer: 54000,
      branchCode: "HAWASSA", deptCode: "SEC", acquisitionDate: daysFromNow(-1000), purchaseCost: 3300000, supplier: "Belayab Motors",
      status: "ACTIVE",
      reg: { regNumber: "REG-2024-0006", office: "Hawassa Transport", regDays: -120, expiryDays: 60, status: "ACTIVE" },
      ins: { company: "Awash Insurance", policyNo: "POL-AW-1006", coverage: "Comprehensive", startDays: -120, endDays: 30 },
    },
    {
      plateNumber: "3-A-78901", category: "Passenger", type: "Minibus", make: "Mercedes-Benz", model: "Sprinter", year: 2023, color: "White",
      engineNo: "ENG-SP-0007", chassisNo: "WDB9066351S000007", engineCC: 2100, fuelType: "DIESEL", transmission: "AUTOMATIC", driveType: "RWD", odometer: 12000,
      branchCode: "HQ", deptCode: "OPS", acquisitionDate: daysFromNow(-300), purchaseCost: 5600000, supplier: "Moenco",
      status: "RESERVED",
      reg: { regNumber: "REG-2024-0007", office: "AA Transport Authority", regDays: -30, expiryDays: 150, status: "ACTIVE" },
      ins: { company: "Nyala Insurance", policyNo: "POL-NY-1007", coverage: "Comprehensive", startDays: -30, endDays: 150 },
    },
    {
      plateNumber: "3-A-89012", category: "Passenger", type: "Sedan", make: "Toyota", model: "Corolla", trim: "XLi", year: 2020, color: "Silver",
      engineNo: "ENG-CR-0008", chassisNo: "JTDBR32E900000008", engineCC: 1600, fuelType: "PETROL", transmission: "CVT", driveType: "FWD", odometer: 78000,
      branchCode: "AA-EAST", deptCode: "IT", driverEmp: "DRV-003", acquisitionDate: daysFromNow(-1400), purchaseCost: 1700000, supplier: "Moenco",
      status: "ASSIGNED",
      reg: { regNumber: "REG-2024-0008", office: "AA Transport Authority", regDays: -350, expiryDays: 5, status: "PENDING_RENEWAL" },
      ins: { company: "Nib Insurance", policyNo: "POL-NB-1008", coverage: "Third Party", startDays: -350, endDays: 200 },
    },
    {
      plateNumber: "3-C-90123", category: "Commercial", type: "Truck", make: "Isuzu", model: "NPR", year: 2018, color: "Blue",
      engineNo: "ENG-NP-0009", chassisNo: "JAANPR75L00000009", engineCC: 5200, fuelType: "DIESEL", transmission: "MANUAL", driveType: "RWD", odometer: 160000,
      branchCode: "AA-WEST", deptCode: "LOG", acquisitionDate: daysFromNow(-2200), purchaseCost: 2500000, supplier: "Belayab Motors",
      status: "ACTIVE",
      reg: { regNumber: "REG-2024-0009", office: "AA Transport Authority", regDays: -20, expiryDays: 400, status: "ACTIVE" },
      ins: { company: "Oromia Insurance", policyNo: "POL-OR-1009", coverage: "Third Party", startDays: -400, endDays: -30 },
    },
    {
      plateNumber: "3-A-01234", category: "Passenger", type: "SUV", make: "Hyundai", model: "Tucson", year: 2023, color: "Grey",
      engineNo: "ENG-TC-0010", chassisNo: "KMHJ281ADNU000010", engineCC: 2000, fuelType: "PETROL", transmission: "AUTOMATIC", driveType: "AWD", odometer: 18000,
      branchCode: "HQ", deptCode: "IT", acquisitionDate: daysFromNow(-250), purchaseCost: 3900000, supplier: "Marathon Motor",
      status: "ACTIVE",
      reg: { regNumber: "REG-2024-0010", office: "AA Transport Authority", regDays: -20, expiryDays: 250, status: "ACTIVE" },
      ins: { company: "Awash Insurance", policyNo: "POL-AW-1010", coverage: "Comprehensive", startDays: -20, endDays: 250 },
    },
    {
      plateNumber: "3-C-11223", category: "Passenger", type: "Bus", make: "Toyota", model: "Coaster", year: 2016, color: "White",
      engineNo: "ENG-CO-0011", chassisNo: "JTGFB518X01000011", engineCC: 4200, fuelType: "DIESEL", transmission: "MANUAL", driveType: "RWD", odometer: 240000,
      branchCode: "HQ", deptCode: "FAC", acquisitionDate: daysFromNow(-3000), purchaseCost: 3000000, supplier: "Moenco",
      status: "DISPOSED",
      reg: { regNumber: "REG-2022-0011", office: "AA Transport Authority", regDays: -700, expiryDays: -300, status: "EXPIRED" },
      ins: { company: "Nib Insurance", policyNo: "POL-NB-1011", coverage: "Third Party", startDays: -700, endDays: -300 },
    },
    {
      plateNumber: "3-B-22334", category: "Passenger", type: "SUV", make: "Mitsubishi", model: "Pajero", trim: "GLS", year: 2021, color: "Black",
      engineNo: "ENG-PJ-0012", chassisNo: "JMYLRV98W0J000012", engineCC: 3000, fuelType: "PETROL", transmission: "AUTOMATIC", driveType: "FOUR_WD", odometer: 61000,
      branchCode: "HAWASSA", deptCode: "SEC", driverEmp: "DRV-001", acquisitionDate: daysFromNow(-1100), purchaseCost: 3600000, supplier: "Matador Addis",
      status: "ASSIGNED",
      reg: { regNumber: "REG-2024-0012", office: "Hawassa Transport", regDays: -90, expiryDays: 75, status: "ACTIVE" },
      ins: { company: "Nyala Insurance", policyNo: "POL-NY-1012", coverage: "Comprehensive", startDays: -90, endDays: 75 },
    },
  ];

  let created = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const exists = await prisma.vehicle.findUnique({
      where: { plateNumber: s.plateNumber },
    });
    if (exists) continue;

    await prisma.vehicle.create({
      data: {
        vehicleCode: `VB-${s.year}-${String(i + 1).padStart(6, "0")}`,
        plateNumber: s.plateNumber,
        prevPlateNo: s.prevPlateNo,
        category: s.category,
        type: s.type,
        make: s.make,
        model: s.model,
        trim: s.trim,
        year: s.year,
        color: s.color,
        engineNo: s.engineNo,
        chassisNo: s.chassisNo,
        engineCC: s.engineCC,
        fuelType: s.fuelType,
        transmission: s.transmission,
        driveType: s.driveType,
        odometer: s.odometer,
        ownerName: "Dashen Bank S.C.",
        departmentId: dept(s.deptCode)?.id ?? null,
        branchId: branch(s.branchCode)?.id ?? null,
        currentDriverId: s.driverEmp ? driver(s.driverEmp)?.id ?? null : null,
        acquisitionDate: s.acquisitionDate,
        purchaseCost: s.purchaseCost,
        supplier: s.supplier,
        status: s.status,
        createdById: admin?.id ?? null,
        registrations: {
          create: {
            regNumber: s.reg.regNumber,
            regDate: daysFromNow(s.reg.regDays),
            expiryDate: daysFromNow(s.reg.expiryDays),
            office: s.reg.office,
            status: s.reg.status,
            createdById: admin?.id ?? null,
          },
        },
        insurances: {
          create: {
            company: s.ins.company,
            policyNo: s.ins.policyNo,
            coverage: s.ins.coverage,
            startDate: daysFromNow(s.ins.startDays),
            endDate: daysFromNow(s.ins.endDays),
            createdById: admin?.id ?? null,
          },
        },
      },
    });
    created++;
  }

  if (created > 0) {
    console.log(`  • created ${created} sample vehicle(s) with registrations & insurance`);
  } else {
    console.log("  • sample vehicles already present (skipped)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
