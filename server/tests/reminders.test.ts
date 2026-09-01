import { describe, it, expect } from "vitest";
import { daysUntil, expiryState, effectiveRegistrationStatus } from "../src/services/reminders.js";

describe("reminders", () => {
  describe("daysUntil", () => {
    it("returns null for null input", () => {
      expect(daysUntil(null)).toBeNull();
    });
    it("returns null for undefined input", () => {
      expect(daysUntil(undefined)).toBeNull();
    });
    it("returns 0 or close for today", () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const result = daysUntil(today);
      // Depending on the current time of day, noon today is either a fraction
      // of a day in the past (ceil -> 0) or a fraction in the future (ceil -> 1).
      expect([0, 1].includes(result)).toBe(true);
    });
    it("returns positive for future dates", () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      expect(daysUntil(future)).toBe(5);
    });
    it("returns negative for past dates", () => {
      const past = new Date();
      past.setDate(past.getDate() - 3);
      expect(daysUntil(past)).toBe(-3);
    });
    it("returns null for invalid date string", () => {
      expect(daysUntil("not-a-date")).toBeNull();
    });
  });

  describe("expiryState", () => {
    it("returns OK for null", () => {
      expect(expiryState(null)).toBe("OK");
    });
    it("returns EXPIRED for past date", () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      expect(expiryState(past)).toBe("EXPIRED");
    });
    it("returns CRITICAL for 0-7 days", () => {
      const critical = new Date();
      critical.setDate(critical.getDate() + 3);
      expect(expiryState(critical)).toBe("CRITICAL");
    });
    it("returns WARNING for 8-30 days", () => {
      const warning = new Date();
      warning.setDate(warning.getDate() + 15);
      expect(expiryState(warning)).toBe("WARNING");
    });
    it("returns OK for 31+ days", () => {
      const ok = new Date();
      ok.setDate(ok.getDate() + 60);
      expect(expiryState(ok)).toBe("OK");
    });
  });

  describe("effectiveRegistrationStatus", () => {
    it("returns SUSPENDED as-is", () => {
      expect(effectiveRegistrationStatus("SUSPENDED", null)).toBe("SUSPENDED");
    });
    it("returns PENDING_RENEWAL as-is", () => {
      expect(effectiveRegistrationStatus("PENDING_RENEWAL", null)).toBe("PENDING_RENEWAL");
    });
    it("returns EXPIRED when expiry date is past", () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      expect(effectiveRegistrationStatus("ACTIVE", past)).toBe("EXPIRED");
    });
    it("returns original status when expiry is in future", () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      expect(effectiveRegistrationStatus("ACTIVE", future)).toBe("ACTIVE");
    });
    it("returns original status when expiryDate is null", () => {
      expect(effectiveRegistrationStatus("ACTIVE", null)).toBe("ACTIVE");
    });
  });
});