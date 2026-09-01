import { describe, it, expect } from "vitest";
import {
  ETHIOPIAN_PHONE_PATTERN,
  formatEthiopianPhone,
  driverSchema,
} from "../src/validation/driver.js";

describe("driver validation", () => {
  describe("ETHIOPIAN_PHONE_PATTERN", () => {
    it("accepts +251 followed by 9 then 8 digits", () => {
      expect(ETHIOPIAN_PHONE_PATTERN.test("+251911234567")).toBe(true);
    });
    it("accepts +251 followed by 7 then 8 digits", () => {
      expect(ETHIOPIAN_PHONE_PATTERN.test("+251711234567")).toBe(true);
    });
    it("rejects a number not starting with 9 or 7", () => {
      expect(ETHIOPIAN_PHONE_PATTERN.test("+251811234567")).toBe(false);
    });
    it("rejects wrong digit count", () => {
      expect(ETHIOPIAN_PHONE_PATTERN.test("+25191123")).toBe(false);
    });
    it("rejects missing country code", () => {
      expect(ETHIOPIAN_PHONE_PATTERN.test("0911234567")).toBe(false);
    });
  });

  describe("formatEthiopianPhone", () => {
    it("normalizes a local 09… number", () => {
      expect(formatEthiopianPhone("0911 234 567")).toBe("+251911234567");
    });
    it("accepts a plain international number", () => {
      expect(formatEthiopianPhone("+251911234567")).toBe("+251911234567");
    });
    it("strips a leading country-code 251…", () => {
      expect(formatEthiopianPhone("251911234567")).toBe("+251911234567");
    });
    it("truncates beyond 9 national digits", () => {
      expect(formatEthiopianPhone("91123456789")).toBe("+251911234567");
    });
    it("handles non-digit cruft", () => {
      expect(formatEthiopianPhone("(09)-11-234-567")).toBe("+251911234567");
    });
    it("keeps an empty string empty", () => {
      expect(formatEthiopianPhone("")).toBe("+251");
    });
  });

  describe("driverSchema.phone", () => {
    it("accepts a valid Ethiopian phone", () => {
      const parsed = driverSchema.safeParse({ fullName: "Test", phone: "+251911234567" });
      expect(parsed.success).toBe(true);
    });
    it("rejects an invalid phone", () => {
      const parsed = driverSchema.safeParse({ fullName: "Test", phone: "091123456" });
      expect(parsed.success).toBe(false);
    });
    it("accepts null / empty phone", () => {
      for (const phone of [null, ""]) {
        const parsed = driverSchema.safeParse({ fullName: "Test", phone });
        expect(parsed.success).toBe(true);
      }
    });
  });
});